import {
  FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronRight,
  FileQuestion,
  Folder,
  FolderOpen,
  House,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "./components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./components/ui/collapsible";
import { ScrollArea } from "./components/ui/scroll-area";
import "./styles.css";

type Asset = {
  id: string;
  kind: "video" | "audio" | "image" | "thumbnail";
  mimeType: string;
  sizeBytes: number;
};
type Capture = {
  id: string;
  jobId: string;
  title: string;
  creator: string | null;
  platform: string;
  sourceType: string;
  sourceUrl: string;
  synopsis: string;
  topics: string[];
  createdAt: string;
  description: string | null;
  transcript: string;
  sourceLanguage: string | null;
  translatedTranscript: string | null;
  translationLanguage: string | null;
  comments: Array<{
    author: string | null;
    text: string;
    likeCount: number | null;
    isPinned: boolean;
  }>;
  whyUseful: string | null;
  analysis: {
    takeaways?: string[];
    recommendations: string[];
    entities: Array<{
      name: string;
      type: string;
      location: string | null;
      description: string | null;
    }>;
    evidence: Array<{ claim: string; source: string; quote: string | null }>;
    claimsNeedingVerification: string[];
  };
  assets: Asset[];
  notePath: string;
};
type Job = {
  id: string;
  status: string;
  normalizedUrl: string;
  displayTitle: string | null;
  attempts: number;
  error: string | null;
  errorCode: string | null;
  errorDetail: string | null;
  resultNotePath: string | null;
  createdAt: string;
  updatedAt: string;
  reachedStages?: string[];
};
type LibraryExport = {
  id: string;
  status: "pending" | "complete" | "failed";
  kind: "full";
  errorCode: string | null;
  recordCount: number | null;
  createdAt: string;
  expiresAt: string;
};
type JobEvent = {
  id: string;
  status: string;
  message: string | null;
  createdAt: string;
};
type JobDetails = { job: Job; events: JobEvent[] };
type LibraryNode = {
  id: string;
  parentId: string | null;
  label: string;
  slug: string;
  kind: string;
  captureCount: number;
  childCount: number;
};
type LibraryNodeDetail = LibraryNode & {
  breadcrumb: LibraryNode[];
  children: LibraryNode[];
  captures: Capture[];
};
type CaptureFacets = {
  categories: Array<{
    id: string;
    label: string;
    kind: string;
    count: number;
  }>;
  topics: Array<{ label: string; count: number }>;
};
type OAuthConnection = {
  clientId: string;
  name: string;
  scope: string;
  authorizedAt: string;
  lastUsedAt: string | null;
};
type PlatformConnection = {
  platform: "facebook" | "instagram";
  connected: boolean;
  status: "connected" | "needs_attention" | "not_connected";
  cookieCount: number;
  lastValidatedAt: string | null;
  lastUsedAt: string | null;
  updatedAt: string | null;
};

function markdownForDisplay(value: string) {
  return value.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
}

function externalLinkLabel(href: string | undefined, children: ReactNode) {
  if (
    href &&
    /^https?:\/\//i.test(href) &&
    typeof children === "string" &&
    /^https?:\/\//i.test(children.trim())
  ) {
    try {
      const hostname = new URL(href).hostname.replace(/^www\./, "");
      return `Open link on ${hostname} ↗`;
    } catch {
      return "Open external link ↗";
    }
  }
  return children;
}
type AskSource = {
  id: string;
  citation: number;
  title: string;
  creator: string | null;
  platform: string;
  synopsis: string;
  sourceUrl: string;
  breadcrumb: string[];
};
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: AskSource[];
  sufficient: boolean | null;
  status: "pending" | "complete" | "failed" | "cancelled";
  errorCode: string | null;
  retryOf: string | null;
  userMessageId: string | null;
  createdAt: string;
};
type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  messages?: ChatMessage[];
};

const stages = [
  "queued",
  "downloading",
  "processing",
  "transcribing",
  "translating",
  "analyzing",
  "writing",
  "complete",
];
const stageCopy: Record<string, string> = {
  queued: "Waiting",
  downloading: "Downloading",
  processing: "Preparing media",
  transcribing: "Transcribing",
  translating: "Translating",
  analyzing: "Extracting knowledge",
  writing: "Archiving",
  complete: "Complete",
  failed: "Needs attention",
};
const failureCopy: Record<string, { title: string; message: string }> = {
  authentication_required: {
    title: "Login cookie expired",
    message: "Refresh the saved login cookies for this platform, then retry.",
  },
  private_post: {
    title: "Private post",
    message:
      "The post is private or the connected account does not have access.",
  },
  unavailable: {
    title: "Post unavailable",
    message: "The post was removed, expired, or is not available at this URL.",
  },
  unsupported_format: {
    title: "Post type not supported yet",
    message: "This archive currently handles video posts and Reels.",
  },
  archive_limit: {
    title: "Archive limit exceeded",
    message: "The media is longer or larger than the configured archive limit.",
  },
  platform_temporary: {
    title: "Platform temporarily unavailable",
    message:
      "Facebook or Instagram refused the download. Wait a little and retry.",
  },
  processing_failed: {
    title: "Media processing failed",
    message:
      "The post downloaded, but its video or audio could not be processed.",
  },
  ai_failed: {
    title: "Knowledge extraction failed",
    message:
      "The media was downloaded, but transcription or analysis did not finish.",
  },
};

function failureFor(job: Job) {
  if (job.errorCode && failureCopy[job.errorCode])
    return failureCopy[job.errorCode]!;
  const text = (job.error || "").toLowerCase();
  if (/cookie|logged-in|authentication/.test(text))
    return failureCopy.authentication_required!;
  if (/private/.test(text)) return failureCopy.private_post!;
  if (/unavailable|removed|404/.test(text)) return failureCopy.unavailable!;
  if (/unsupported|without metadata|no downloadable/.test(text))
    return failureCopy.unsupported_format!;
  if (/size|duration|limit/.test(text)) return failureCopy.archive_limit!;
  return {
    title: "Capture failed",
    message: "Retry this capture. Open the diagnostic only if it fails again.",
  };
}

function sourceLabel(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.includes("instagram") ? "Instagram" : "Facebook"} · ${parsed.pathname.replace(/\/$/, "").split("/").pop() || "post"}`;
  } catch {
    return "Social post";
  }
}

function sourceReference(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/$/, "").split("/").pop() || "post";
  } catch {
    return "Social post";
  }
}

function platformFor(url: string) {
  return url.includes("instagram.com") ? "instagram" : "facebook";
}

function PlatformIcon({ url }: { url: string }) {
  const platform = platformFor(url);
  return platform === "instagram" ? (
    <span className="platform-icon instagram" aria-label="Instagram">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle className="fill" cx="17.5" cy="6.5" r="1" />
      </svg>
    </span>
  ) : (
    <span className="platform-icon facebook" aria-label="Facebook">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 8h3V4.4c-.5-.1-2.2-.4-4.2-.4C8.8 4 6 6.4 6 10.8V14H2v4h4v6h5v-6h4l.7-4H11v-2.8C11 9.3 11.8 8 14 8Z" />
      </svg>
    </span>
  );
}

function JobInfoModal({
  details,
  onClose,
}: {
  details: JobDetails;
  onClose: () => void;
}) {
  const { job, events } = details;
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div className="modal-scrim" onClick={onClose}>
      <section
        className="job-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Processing details"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <div className="eyebrow">Processing details</div>
            <h2 id="job-modal-title">
              {job.displayTitle || sourceLabel(job.normalizedUrl)}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>
        </div>
        <dl className="job-facts">
          <div>
            <dt>Status</dt>
            <dd>{stageCopy[job.status] || job.status}</dd>
          </div>
          <div>
            <dt>Attempts</dt>
            <dd>{job.attempts}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{new Date(job.createdAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Last update</dt>
            <dd>{new Date(job.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>
        <a
          className="source-link"
          href={job.normalizedUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open original post ↗
        </a>
        <h3>Processing log</h3>
        <ol className="event-log">
          {events.map((event) => (
            <li key={event.id}>
              <span className={`event-dot ${event.status}`} />
              <div>
                <strong>{stageCopy[event.status] || event.status}</strong>
                {event.message && <p>{event.message}</p>}
                <time>{new Date(event.createdAt).toLocaleString()}</time>
              </div>
            </li>
          ))}
        </ol>
        {(job.errorDetail || job.error) && (
          <details className="modal-diagnostic">
            <summary>Technical diagnostic</summary>
            <code>{job.errorDetail || job.error}</code>
          </details>
        )}
        {job.resultNotePath && (
          <small className="note-result">
            Archive note: {job.resultNotePath}
          </small>
        )}
      </section>
    </div>
  );
}
type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

async function api<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      new Error(body.error || body.message || "Request failed"),
      { status: response.status, body },
    );
  return body as T;
}
const assetUrl = (captureId: string, assetId: string) =>
  `/api/v1/captures/${captureId}/assets/${assetId}`;

function Auth({ setup, onDone }: { setup: boolean; onDone: () => void }) {
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api(setup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: setup ? { Authorization: `Bearer ${setupToken}` } : {},
        body: JSON.stringify({ username, password }),
      });
      if (setup)
        await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    }
  }
  return (
    <main className="auth">
      <section className="auth-card">
        <div className="mark">◉</div>
        <h1>{setup ? "Create your private archive" : "Welcome back"}</h1>
        <p>
          {setup
            ? "Create the administrator account. You can make a Shortcut API key after signing in."
            : "Sign in to your Social Knowledge archive."}
        </p>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              autoComplete={setup ? "new-password" : "current-password"}
            />
          </label>
          {setup && (
            <label>
              Setup token
              <input
                type="password"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                autoComplete="off"
              />
            </label>
          )}
          <button>Continue</button>
          {error && <p className="error">{error}</p>}
        </form>
      </section>
    </main>
  );
}

function CaptureCard({
  capture,
  onOpen,
}: {
  capture: Capture;
  onOpen: (id: string) => void;
}) {
  const thumb = capture.assets.find(
    (a) => a.kind === "thumbnail" || a.kind === "image",
  );
  return (
    <button className="capture-card" onClick={() => onOpen(capture.id)}>
      {thumb ? (
        <img src={assetUrl(capture.id, thumb.id)} alt="" />
      ) : (
        <div className="placeholder">
          {capture.platform.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="card-body">
        <div className="eyebrow">
          {capture.platform} ·{" "}
          {new Date(capture.createdAt).toLocaleDateString()}
        </div>
        <h3>{capture.title}</h3>
        <p>{capture.creator || "Unknown creator"}</p>
        <div className="chips">
          {capture.topics.slice(0, 3).map((topic) => (
            <span key={topic}>{topic}</span>
          ))}
        </div>
      </div>
    </button>
  );
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const [capture, setCapture] = useState<Capture | null>(null);
  useEffect(() => {
    void api<{ capture: Capture }>(`/api/v1/captures/${id}`).then((x) =>
      setCapture(x.capture),
    );
  }, [id]);
  if (!capture)
    return (
      <div className="drawer">
        <p>Loading…</p>
      </div>
    );
  const video = capture.assets.find((a) => a.kind === "video");
  const images = capture.assets.filter((a) => a.kind === "image");
  const hasStructuredTakeaways = Boolean(capture.analysis.takeaways?.length);
  const takeaways = hasStructuredTakeaways
    ? capture.analysis.takeaways!
    : capture.analysis.recommendations;
  return (
    <div className="scrim" onClick={onClose}>
      <article className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>
          ×
        </button>
        {video && (
          <video
            controls
            preload="metadata"
            poster={
              capture.assets.find((a) => a.kind === "thumbnail")
                ? assetUrl(
                    capture.id,
                    capture.assets.find((a) => a.kind === "thumbnail")!.id,
                  )
                : undefined
            }
            src={assetUrl(capture.id, video.id)}
          />
        )}
        <div className="gallery">
          {images.map((image) => (
            <img key={image.id} src={assetUrl(capture.id, image.id)} alt="" />
          ))}
        </div>
        <div className="detail">
          <div className="eyebrow">
            {capture.platform} · {capture.creator || "Unknown creator"}
          </div>
          <h1>{capture.title}</h1>
          <p className="lead">{capture.synopsis}</p>
          {capture.whyUseful && (
            <>
              <h2>Bottom line</h2>
              <p className="bottom-line">{capture.whyUseful}</p>
            </>
          )}
          <h2>Key takeaways</h2>
          <ul className="takeaways">
            {takeaways.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          {hasStructuredTakeaways &&
            capture.analysis.recommendations.length > 0 && (
              <>
                <h2>Actions & recommendations</h2>
                <ul>
                  {capture.analysis.recommendations.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </>
            )}
          {capture.analysis.entities.length > 0 && (
            <details>
              <summary>Referenced people, places & products</summary>
              <div className="entities">
                {capture.analysis.entities.map((x) => (
                  <div key={x.name}>
                    <strong>{x.name}</strong>
                    <span>
                      {x.type}
                      {x.location ? ` · ${x.location}` : ""}
                    </span>
                    <p>{x.description}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
          <h2>Evidence</h2>
          <ul>
            {capture.analysis.evidence.map((x, i) => (
              <li key={i}>
                {x.claim} <em>({x.source})</em>
                {x.quote ? ` — “${x.quote}”` : ""}
              </li>
            ))}
          </ul>
          <details>
            <summary>Source description</summary>
            <p className="preserve">{capture.description || "Unavailable"}</p>
          </details>
          <details>
            <summary>Transcript</summary>
            <p className="preserve">{capture.transcript || "Unavailable"}</p>
          </details>
          {capture.translatedTranscript && (
            <details open>
              <summary>
                Translation · {capture.sourceLanguage || "Unknown language"} →{" "}
                {capture.translationLanguage}
              </summary>
              <p className="preserve">{capture.translatedTranscript}</p>
            </details>
          )}
          <details>
            <summary>
              Selected comments
              {capture.comments.length ? ` (${capture.comments.length})` : ""}
            </summary>
            {capture.comments.length ? (
              <ul className="comment-list">
                {capture.comments.map((comment, index) => (
                  <li key={`${comment.author ?? "unknown"}-${index}`}>
                    <strong>
                      {comment.isPinned ? "📌 " : ""}
                      {comment.author ?? "Unknown"}
                    </strong>
                    <p>{comment.text}</p>
                    {comment.likeCount !== null && (
                      <small>{comment.likeCount} likes</small>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No comments were available from the platform.</p>
            )}
          </details>
          <p>
            <a href={capture.sourceUrl} target="_blank" rel="noreferrer">
              Open original post ↗
            </a>
          </p>
          <small>Markdown: {capture.notePath}</small>
        </div>
      </article>
    </div>
  );
}

function Settings() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("iPhone Shortcut");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [createdKeyId, setCreatedKeyId] = useState<string | null>(null);
  const [defaultLanguage, setDefaultLanguage] = useState("English");
  const [translateForeign, setTranslateForeign] = useState(true);
  const [preferenceMessage, setPreferenceMessage] = useState("");
  const [connections, setConnections] = useState<OAuthConnection[]>([]);
  const [platformConnections, setPlatformConnections] = useState<
    PlatformConnection[]
  >([]);
  const [platformMessage, setPlatformMessage] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [libraryExports, setLibraryExports] = useState<LibraryExport[]>([]);
  const [backupMessage, setBackupMessage] = useState("");
  async function load() {
    const [
      keyResult,
      preferenceResult,
      connectionResult,
      exportResult,
      platformResult,
    ] = await Promise.all([
      api<{ apiKeys: ApiKey[] }>("/api/v1/api-keys"),
      api<{
        preferences: { defaultLanguage: string; translateForeign: boolean };
      }>("/api/v1/preferences"),
      api<{ connections: OAuthConnection[]; mcpUrl: string }>(
        "/api/v1/oauth/connections",
      ),
      api<{ exports: LibraryExport[] }>("/api/v1/library-exports"),
      api<{ connections: PlatformConnection[] }>(
        "/api/v1/platform-connections",
      ),
    ]);
    setKeys(keyResult.apiKeys);
    setDefaultLanguage(preferenceResult.preferences.defaultLanguage);
    setTranslateForeign(preferenceResult.preferences.translateForeign);
    setConnections(connectionResult.connections);
    setMcpUrl(connectionResult.mcpUrl);
    setLibraryExports(exportResult.exports);
    setPlatformConnections(platformResult.connections);
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!libraryExports.some((item) => item.status === "pending")) {
      if (backupMessage === "Preparing your backup…") {
        setBackupMessage(
          libraryExports[0]?.status === "complete"
            ? "Your backup is ready to download."
            : libraryExports[0]?.status === "failed"
              ? "The backup could not be completed. You can try again."
              : "",
        );
      }
      return;
    }
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [libraryExports]);
  async function create(event: FormEvent) {
    event.preventDefault();
    const result = await api<{ token: string; apiKey: ApiKey }>(
      "/api/v1/api-keys",
      {
        method: "POST",
        body: JSON.stringify({ name }),
      },
    );
    setToken(result.token);
    setCreatedKeyId(result.apiKey.id);
    setMessage("Copy this key now. It will not be shown again.");
    await load();
  }
  async function uploadPlatformCookies(
    platform: PlatformConnection["platform"],
    file: File,
  ) {
    setPlatformMessage(`Checking ${platform} cookies…`);
    try {
      await api(`/api/v1/platform-connections/${platform}`, {
        method: "PUT",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: await file.text(),
      });
      setPlatformMessage(
        `${platform === "instagram" ? "Instagram" : "Facebook"} connected. New captures will use this login when needed.`,
      );
      await load();
    } catch (error) {
      const code =
        error instanceof Error
          ? (error as Error & { body?: { error?: string } }).body?.error
          : null;
      setPlatformMessage(
        code === "no_platform_cookies"
          ? `That file did not contain ${platform} cookies. Export cookies while signed in and try again.`
          : "The cookie file could not be saved. Use a Netscape-format cookies.txt export.",
      );
    }
  }
  return (
    <div className="settings">
      <div className="page-title">
        <h1>Settings</h1>
        <p>
          Choose how knowledge is processed and manage Shortcut and agent
          access.
        </p>
      </div>
      <section className="settings-card">
        <h2>Facebook and Instagram</h2>
        <p className="settings-help">
          Connect your logged-in browser session so private or login-protected
          posts can be captured. Export a Netscape-format{" "}
          <code>cookies.txt</code> while signed in, then upload it here.
          Passwords are never requested or stored.
        </p>
        <div className="platform-connections">
          {platformConnections.map((connection) => {
            const label =
              connection.platform === "instagram" ? "Instagram" : "Facebook";
            return (
              <article key={connection.platform}>
                <div className="platform-connection-heading">
                  <PlatformIcon
                    url={`https://www.${connection.platform}.com`}
                  />
                  <div>
                    <strong>{label}</strong>
                    <span className={`connection-state ${connection.status}`}>
                      {connection.status === "connected"
                        ? "Connected"
                        : connection.status === "needs_attention"
                          ? "Reconnect needed"
                          : "Not connected"}
                    </span>
                  </div>
                </div>
                <p>
                  {connection.lastUsedAt
                    ? `Last worked ${new Date(connection.lastUsedAt).toLocaleString()}`
                    : connection.connected
                      ? `${connection.cookieCount} platform cookies stored securely`
                      : "Anonymous downloads will still be attempted."}
                </p>
                <div className="platform-connection-actions">
                  <label className="button-like">
                    {connection.connected
                      ? "Replace cookies"
                      : "Upload cookies"}
                    <input
                      type="file"
                      accept=".txt,text/plain"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (file)
                          await uploadPlatformCookies(
                            connection.platform,
                            file,
                          );
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {connection.connected && (
                    <button
                      className="secondary-button"
                      onClick={async () => {
                        await api(
                          `/api/v1/platform-connections/${connection.platform}`,
                          { method: "DELETE" },
                        );
                        setPlatformMessage(`${label} disconnected.`);
                        await load();
                      }}
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {platformMessage && (
          <p className="action-feedback" role="status">
            {platformMessage}
          </p>
        )}
        <details className="api-examples cookie-help">
          <summary>How to export browser cookies</summary>
          <p>
            Use a trusted cookies.txt exporter in your desktop browser while
            logged into the selected platform. Social Knowledge discards every
            cookie that does not belong to that platform before encrypting the
            connection.
          </p>
        </details>
      </section>
      <section className="settings-card">
        <h2>AI Connections</h2>
        <p className="settings-help">
          Connect ChatGPT, Codex, or another MCP client with read-only access to
          your saved archive.
        </p>
        <label>
          MCP server
          <input readOnly value={mcpUrl} />
        </label>
        <details className="api-examples">
          <summary>Codex configuration</summary>
          <p>
            Store your account key in <code>SOCIAL_KNOWLEDGE_API_KEY</code>,
            then add:
          </p>
          <pre>{`[mcp_servers.social_knowledge]\nurl = "${mcpUrl}"\nbearer_token_env_var = "SOCIAL_KNOWLEDGE_API_KEY"`}</pre>
        </details>
        <div className="key-list">
          {connections.map((connection) => (
            <article key={connection.clientId}>
              <div>
                <strong>{connection.name}</strong>
                <small>
                  Read-only · connected{" "}
                  {new Date(connection.authorizedAt).toLocaleDateString()} ·{" "}
                  {connection.lastUsedAt
                    ? `last used ${new Date(connection.lastUsedAt).toLocaleDateString()}`
                    : "never used"}
                </small>
              </div>
              <button
                onClick={async () => {
                  await api(
                    `/api/v1/oauth/connections/${connection.clientId}`,
                    { method: "DELETE" },
                  );
                  await load();
                }}
              >
                Revoke
              </button>
            </article>
          ))}
          {!connections.length && <p>No OAuth applications connected yet.</p>}
        </div>
      </section>
      <section className="settings-card">
        <h2>Export library</h2>
        <p className="settings-help">
          Create a portable backup containing all of your capture metadata,
          transcripts, comments, Markdown notes, images, audio, and videos.
          Account credentials and server configuration are excluded.
        </p>
        <button
          disabled={libraryExports.some((item) => item.status === "pending")}
          onClick={async () => {
            setBackupMessage("Preparing your backup…");
            try {
              await api("/api/v1/library-exports", { method: "POST" });
              await load();
            } catch (error) {
              setBackupMessage(
                error instanceof Error
                  ? error.message
                  : "Backup could not start.",
              );
            }
          }}
        >
          {libraryExports.some((item) => item.status === "pending")
            ? "Preparing backup…"
            : "Create full backup"}
        </button>
        {backupMessage && <p className="action-feedback">{backupMessage}</p>}
        <div className="key-list">
          {libraryExports.map((item) => (
            <article key={item.id}>
              <div>
                <strong>
                  {item.status === "complete"
                    ? `Backup ready · ${item.recordCount ?? 0} captures`
                    : item.status === "pending"
                      ? "Preparing backup"
                      : "Backup failed"}
                </strong>
                <small>
                  Created {new Date(item.createdAt).toLocaleString()} · expires{" "}
                  {new Date(item.expiresAt).toLocaleString()}
                </small>
              </div>
              {item.status === "complete" && (
                <a
                  className="backup-download"
                  href={`/api/v1/library-exports/${item.id}/download`}
                >
                  Download
                </a>
              )}
            </article>
          ))}
        </div>
        <p className="settings-help">
          Backups contain private content and are available for 24 hours. Store
          downloaded archives somewhere secure.
        </p>
      </section>
      <section className="settings-card">
        <h2>Language</h2>
        <p className="settings-help">
          New captures use these preferences. Original transcripts are always
          preserved.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await api<{
              preferences: {
                defaultLanguage: string;
                translateForeign: boolean;
              };
            }>("/api/v1/preferences", {
              method: "PATCH",
              body: JSON.stringify({ defaultLanguage, translateForeign }),
            });
            setDefaultLanguage(result.preferences.defaultLanguage);
            setTranslateForeign(result.preferences.translateForeign);
            setPreferenceMessage("Language preferences saved.");
          }}
        >
          <label>
            Default language
            <select
              value={defaultLanguage}
              onChange={(event) => setDefaultLanguage(event.target.value)}
            >
              {[
                "English",
                "French",
                "Portuguese",
                "Spanish",
                "German",
                "Italian",
                "Dutch",
              ].map((language) => (
                <option key={language}>{language}</option>
              ))}
            </select>
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={translateForeign}
              onChange={(event) => setTranslateForeign(event.target.checked)}
            />
            Translate foreign-language clips into my default language
          </label>
          <button>Save language settings</button>
        </form>
        {preferenceMessage && (
          <p className="action-feedback">{preferenceMessage}</p>
        )}
      </section>
      <section className="settings-card">
        <h2>API keys</h2>
        <p className="settings-help">
          Each account key can submit captures and read, search, and export your
          knowledge through the Agent API. It cannot manage your account or
          settings.
        </p>
        <form onSubmit={create}>
          <label>
            Key name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <button>Create API key</button>
        </form>
        {token && (
          <div className="token-box">
            <strong>{message}</strong>
            <code>{token}</code>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(token);
                setMessage("Copied to clipboard.");
              }}
            >
              Copy key
            </button>
          </div>
        )}
        <div className="key-list">
          {keys.map((key) => (
            <article key={key.id}>
              <div>
                <strong>{key.name}</strong>
                <small>
                  {key.prefix}… · created{" "}
                  {new Date(key.createdAt).toLocaleDateString()} ·{" "}
                  {key.lastUsedAt
                    ? `last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                    : "never used"}
                </small>
              </div>
              <button
                onClick={async () => {
                  await api(`/api/v1/api-keys/${key.id}`, { method: "DELETE" });
                  await load();
                  if (createdKeyId === key.id) {
                    setToken("");
                    setCreatedKeyId(null);
                  }
                  setMessage(`${key.name} was revoked.`);
                }}
              >
                Revoke
              </button>
            </article>
          ))}
          {!keys.length && <p>No account API keys yet.</p>}
        </div>
        <details className="api-examples">
          <summary>Agent API examples</summary>
          <p>
            Replace <code>$SOCIAL_KNOWLEDGE_API_KEY</code> with an account key.
          </p>
          <pre>{`curl -H "Authorization: Bearer $SOCIAL_KNOWLEDGE_API_KEY" \\
  "${window.location.origin}/api/v1/knowledge/search?q=lisbon%20restaurants"

curl -H "Authorization: Bearer $SOCIAL_KNOWLEDGE_API_KEY" \\
  "${window.location.origin}/api/v1/knowledge/captures/CAPTURE_ID?include=transcript"

curl -X POST -H "Authorization: Bearer $SOCIAL_KNOWLEDGE_API_KEY" \\
  -H "Content-Type: application/json" -d '{"include":["transcript","comments"]}' \\
  "${window.location.origin}/api/v1/knowledge/exports"`}</pre>
          <p>
            <a href="/openapi.json" target="_blank" rel="noreferrer">
              OpenAPI 3.1 specification ↗
            </a>
          </p>
        </details>
      </section>
    </div>
  );
}

function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    try {
      const saved = window.localStorage.getItem(
        "social-knowledge-library-expanded-v2",
      );
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);
  const [selected, setSelected] = useState<string>("home");
  const [node, setNode] = useState<LibraryNodeDetail | null>(null);
  const [markdown, setMarkdown] = useState(
    "# Social Knowledge\n\nChoose a category or capture to explore your library.",
  );
  const [selectedCapture, setSelectedCapture] = useState<string | null>(null);
  async function loadTree() {
    const result = await api<{
      nodes: LibraryNode[];
      unclassifiedCount: number;
    }>("/api/v1/library/tree");
    setNodes(result.nodes);
    setUnclassifiedCount(result.unclassifiedCount);
  }
  useEffect(() => {
    void loadTree();
  }, []);
  useEffect(() => {
    if (!nodes.length) return;
    try {
      window.localStorage.setItem(
        "social-knowledge-library-expanded-v2",
        JSON.stringify([...expandedNodes]),
      );
    } catch {
      // Browsing still works when storage is unavailable.
    }
  }, [expandedNodes, nodes.length]);
  async function openNode(id: string) {
    const result = await api<{ node: LibraryNodeDetail; markdown: string }>(
      `/api/v1/library/nodes/${id}`,
    );
    setSelected(id);
    setNode(result.node);
    setMarkdown(result.markdown);
    setSelectedCapture(null);
  }
  async function openCapture(id: string) {
    const result = await api<{ markdown: string }>(
      `/api/v1/captures/${id}/markdown`,
    );
    setSelected(`capture:${id}`);
    setSelectedCapture(id);
    setMarkdown(result.markdown);
    setNode(null);
  }
  async function openUnclassified() {
    const result = await api<{ captures: Capture[] }>(
      "/api/v1/library/unclassified",
    );
    setSelected("unclassified");
    setNode(null);
    setSelectedCapture(null);
    setMarkdown(
      [
        "# Unclassified",
        "",
        "These captures need a confident placement.",
        "",
        ...result.captures.map(
          (capture) => `- [${capture.title}](capture:${capture.id})`,
        ),
      ].join("\n"),
    );
  }
  const children = (parentId: string | null) =>
    nodes.filter((candidate) => candidate.parentId === parentId);
  const branch = (parentId: string | null, depth = 0): ReactNode =>
    children(parentId).map((item) => {
      const expandable = item.childCount > 0;
      const expanded = expandedNodes.has(item.id);
      const branchId = `library-branch-${item.id}`;
      return (
        <Collapsible
          key={item.id}
          open={expanded}
          onOpenChange={(open) =>
            setExpandedNodes((current) => {
              const next = new Set(current);
              if (open) next.add(item.id);
              else next.delete(item.id);
              return next;
            })
          }
        >
          <div
            className={`library-tree-row ${selected === item.id ? "selected" : ""}`}
            style={{ paddingLeft: 4 + depth * 16 }}
          >
            {expandable ? (
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="library-tree-toggle"
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${item.label}`}
                  aria-controls={branchId}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </CollapsibleTrigger>
            ) : (
              <span className="library-tree-leaf" aria-hidden="true" />
            )}
            <Button
              type="button"
              variant="ghost"
              className="library-tree-node"
              onClick={() => void openNode(item.id)}
            >
              <span className="library-tree-label">
                {expandable && expanded ? <FolderOpen /> : <Folder />}
                <span>{item.label}</span>
              </span>
              <small className="library-count">{item.captureCount}</small>
            </Button>
          </div>
          {expandable && (
            <CollapsibleContent id={branchId} className="library-tree-branch">
              {branch(item.id, depth + 1)}
            </CollapsibleContent>
          )}
        </Collapsible>
      );
    });
  async function refresh() {
    await loadTree();
    if (node) await openNode(node.id);
  }
  return (
    <div className="library-page">
      <div className="page-title">
        <div className="eyebrow">Generated knowledge base</div>
        <h1>Library</h1>
        <p>
          Browse stable Markdown notes through an organized, living hierarchy.
        </p>
      </div>
      <div className={`library-layout ${selected !== "home" ? "viewing" : ""}`}>
        <aside className="library-sidebar" aria-label="Knowledge tree">
          <div className="library-sidebar-header">
            <div>
              <strong>Knowledge base</strong>
              <small>{nodes.length} categories</small>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="library-collapse-all"
              disabled={expandedNodes.size === 0}
              onClick={() => setExpandedNodes(new Set())}
            >
              Collapse all
            </Button>
          </div>
          <ScrollArea className="library-tree">
            <Button
              type="button"
              variant="ghost"
              className={`library-root-row ${selected === "home" ? "selected" : ""}`}
              onClick={() => {
                setSelected("home");
                setNode(null);
                setSelectedCapture(null);
                setMarkdown(
                  "# Social Knowledge\n\nChoose a domain to begin exploring.",
                );
              }}
            >
              <House aria-hidden="true" />
              <span>Home</span>
              <small className="library-count">
                {nodes
                  .filter((n) => n.parentId === null)
                  .reduce((sum, n) => sum + n.captureCount, 0)}
              </small>
            </Button>
            {branch(null)}
            <Button
              type="button"
              variant="ghost"
              className={`library-root-row ${selected === "unclassified" ? "selected" : ""}`}
              onClick={() => void openUnclassified()}
            >
              <FileQuestion aria-hidden="true" />
              <span>Unclassified</span>
              <small className="library-count">{unclassifiedCount}</small>
            </Button>
          </ScrollArea>
        </aside>
        <section className="markdown-pane">
          {selected !== "home" && (
            <button
              className="library-mobile-back"
              onClick={() => {
                setSelected("home");
                setNode(null);
                setSelectedCapture(null);
              }}
            >
              ‹ Browse library
            </button>
          )}
          {node && (
            <div className="library-toolbar">
              <div className="library-breadcrumb">
                {node.breadcrumb.map((part) => part.label).join("  ›  ")}
              </div>
              <div>
                <button
                  onClick={async () => {
                    const label = window.prompt(
                      "New category name",
                      node.label,
                    );
                    if (!label) return;
                    await api(`/api/v1/library/nodes/${node.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ label }),
                    });
                    await refresh();
                  }}
                >
                  Rename
                </button>
                <button
                  onClick={async () => {
                    const compatible = nodes.filter(
                      (candidate) =>
                        candidate.kind === node.kind &&
                        candidate.id !== node.id,
                    );
                    const targetLabel = window.prompt(
                      `Merge into: ${compatible.map((candidate) => candidate.label).join(", ")}`,
                    );
                    const target = compatible.find(
                      (candidate) =>
                        candidate.label.toLowerCase() ===
                        targetLabel?.toLowerCase(),
                    );
                    if (
                      !target ||
                      !window.confirm(
                        `Merge ${node.label} into ${target.label}?`,
                      )
                    )
                      return;
                    await api(`/api/v1/library/nodes/${node.id}/merge`, {
                      method: "POST",
                      body: JSON.stringify({ targetNodeId: target.id }),
                    });
                    setSelected(target.id);
                    await loadTree();
                    await openNode(target.id);
                  }}
                >
                  Merge
                </button>
              </div>
            </div>
          )}
          {selectedCapture && (
            <div className="library-toolbar">
              <button onClick={() => onOpen(selectedCapture)}>
                Open capture
              </button>
              <button
                onClick={async () => {
                  const label = window.prompt(
                    `Move to category: ${nodes.map((candidate) => candidate.label).join(", ")}`,
                  );
                  const target = [...nodes]
                    .reverse()
                    .find(
                      (candidate) =>
                        candidate.label.toLowerCase() === label?.toLowerCase(),
                    );
                  if (!target) return;
                  await api(
                    `/api/v1/captures/${selectedCapture}/classification`,
                    {
                      method: "PATCH",
                      body: JSON.stringify({ nodeId: target.id }),
                    },
                  );
                  await loadTree();
                }}
              >
                Move capture
              </button>
            </div>
          )}
          <article className="markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              urlTransform={(url) =>
                /^(capture:|library:|https?:|mailto:|\/)/i.test(url) ? url : ""
              }
              components={{
                a: ({ href, children }) => {
                  if (href?.startsWith("capture:"))
                    return (
                      <button
                        className="markdown-link"
                        onClick={() => void openCapture(href.slice(8))}
                      >
                        {children}
                      </button>
                    );
                  if (href?.startsWith("library:"))
                    return (
                      <button
                        className="markdown-link"
                        onClick={() => void openNode(href.slice(8))}
                      >
                        {children}
                      </button>
                    );
                  return (
                    <a href={href} target="_blank" rel="noreferrer">
                      {externalLinkLabel(href, children)}
                    </a>
                  );
                },
              }}
            >
              {markdownForDisplay(markdown)}
            </ReactMarkdown>
          </article>
        </section>
      </div>
    </div>
  );
}

function AskAI({ onOpen }: { onOpen: (id: string) => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  async function loadList() {
    const result = await api<{ conversations: Conversation[] }>(
      "/api/v1/conversations",
    );
    setConversations(result.conversations);
    if (!current && result.conversations[0])
      await openConversation(result.conversations[0].id);
  }
  async function openConversation(id: string) {
    const result = await api<{ conversation: Conversation }>(
      `/api/v1/conversations/${id}`,
    );
    setCurrent(result.conversation);
  }
  async function createConversation() {
    const result = await api<{ conversation: Conversation }>(
      "/api/v1/conversations",
      { method: "POST", body: JSON.stringify({}) },
    );
    setCurrent(result.conversation);
    const list = await api<{ conversations: Conversation[] }>(
      "/api/v1/conversations",
    );
    setConversations(list.conversations);
  }
  useEffect(() => {
    void loadList();
  }, []);
  async function consumeStream(
    response: Response,
    conversationId: string,
    temporaryId: string,
  ) {
    if (!response.ok || !response.body) {
      const problem = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        problem.error === "conversation_busy"
          ? "This conversation is already answering in another tab."
          : problem.error === "invalid_message"
            ? "Enter a question between 1 and 2,000 characters."
            : problem.error === "invalid_request_id"
              ? "The request identifier was invalid. Please try again."
              : "Ask AI could not start the answer.",
      );
    }
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "",
      answer = "",
      sources: AskSource[] = [],
      sufficient: boolean | null = null;
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const block of events) {
        const event = /^event: (.+)$/m.exec(block)?.[1];
        const raw = /^data: (.+)$/m.exec(block)?.[1];
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (event === "delta") answer += data.text;
        if (event === "sources") {
          sources = data.sources;
          sufficient = data.sufficient;
        }
        if (event === "error") throw new Error(data.message);
        setCurrent((existing) =>
          existing
            ? {
                ...existing,
                messages: (existing.messages ?? []).map((message) =>
                  message.id === temporaryId
                    ? { ...message, content: answer, sources, sufficient }
                    : message,
                ),
              }
            : existing,
        );
      }
      if (done) break;
    }
    await openConversation(conversationId);
  }
  async function runRequest(
    url: string,
    body: object,
    conversationId: string,
    temporaryId: string,
  ) {
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      await consumeStream(response, conversationId, temporaryId);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setError(cause instanceof Error ? cause.message : "Ask AI failed.");
    } finally {
      abortRef.current = null;
      setStreaming(false);
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      await openConversation(conversationId).catch(() => undefined);
      await loadList().catch(() => undefined);
    }
  }
  async function send(text = question) {
    const cleaned = text.trim();
    if (!cleaned || streaming) return;
    let conversation = current;
    if (!conversation) {
      const result = await api<{ conversation: Conversation }>(
        "/api/v1/conversations",
        { method: "POST", body: JSON.stringify({}) },
      );
      conversation = result.conversation;
      setCurrent(conversation);
    }
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleaned,
      sources: [],
      sufficient: null,
      status: "complete",
      errorCode: null,
      retryOf: null,
      userMessageId: null,
      createdAt: new Date().toISOString(),
    };
    const assistant: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      sources: [],
      sufficient: null,
      status: "pending",
      errorCode: null,
      retryOf: null,
      userMessageId: userMessage.id,
      createdAt: new Date().toISOString(),
    };
    setCurrent({
      ...conversation,
      messages: [...(conversation.messages ?? []), userMessage, assistant],
    });
    setQuestion("");
    await runRequest(
      `/api/v1/conversations/${conversation.id}/messages`,
      { message: cleaned, requestId: crypto.randomUUID() },
      conversation.id,
      assistant.id,
    );
  }
  async function retry(message: ChatMessage) {
    if (!current || streaming) return;
    const temporary: ChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      content: "",
      sources: [],
      sufficient: null,
      status: "pending",
      errorCode: null,
      retryOf: message.id,
    };
    setCurrent({
      ...current,
      messages: [...(current.messages ?? []), temporary],
    });
    await runRequest(
      `/api/v1/conversations/${current.id}/messages/${message.id}/retry`,
      { requestId: crypto.randomUUID() },
      current.id,
      temporary.id,
    );
  }
  const suggestions = [
    "What Lisbon restaurants have I saved?",
    "Summarize my saved Portugal recommendations.",
    "Which products have creators recommended?",
  ];
  return (
    <div className="ask-page">
      <aside className="conversation-sidebar">
        <button className="new-chat" onClick={() => void createConversation()}>
          ＋ New conversation
        </button>
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            className={current?.id === conversation.id ? "selected" : ""}
            onClick={() => void openConversation(conversation.id)}
          >
            <span>{conversation.title}</span>
            <small>{conversation.messageCount ?? 0} messages</small>
          </button>
        ))}
      </aside>
      <section className="chat-panel">
        <div className="chat-heading">
          <div>
            <div className="eyebrow">Your saved archive</div>
            <h1>Ask AI</h1>
          </div>
          {current && (
            <button
              className="delete-chat"
              onClick={async () => {
                if (!window.confirm("Delete this conversation?")) return;
                await api(`/api/v1/conversations/${current.id}`, {
                  method: "DELETE",
                });
                setCurrent(null);
                await loadList();
              }}
            >
              Delete
            </button>
          )}
        </div>
        <div className="messages">
          {!current?.messages?.length && (
            <div className="ask-empty">
              <h2>Ask what you’ve saved.</h2>
              <p>
                Answers are grounded only in your archived captures and link
                back to their evidence.
              </p>
              <div className="suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => void send(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          {current?.messages?.map((message) => (
            <article
              className={`chat-message ${message.role} ${message.status}`}
              key={message.id}
            >
              <div className="message-role">
                {message.role === "user" ? "You" : "Social Knowledge"}
              </div>
              <div className="message-content">
                {message.content ? (
                  message.role === "assistant" ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={(url) =>
                        /^(https?:|mailto:)/i.test(url) ? url : ""
                      }
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noreferrer">
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    message.content
                  )
                ) : message.status === "pending" ? (
                  <span className="typing">Searching your archive…</span>
                ) : (
                  <span>
                    {message.status === "cancelled"
                      ? "Answer stopped."
                      : "Ask AI could not finish this answer."}
                  </span>
                )}
              </div>
              {message.role === "assistant" &&
                (message.status === "failed" ||
                  message.status === "cancelled") && (
                  <button
                    className="retry-answer"
                    disabled={streaming}
                    onClick={() => void retry(message)}
                  >
                    Retry
                  </button>
                )}
              {message.role === "assistant" && message.sufficient === false && (
                <small className="insufficient">
                  The saved archive did not contain enough evidence.
                </small>
              )}
              {message.sources?.length > 0 && (
                <div className="answer-sources">
                  <strong>Sources</strong>
                  {message.sources.map((source) => (
                    <button key={source.id} onClick={() => onOpen(source.id)}>
                      <span className="source-number">{source.citation}</span>
                      <span>
                        <b>{source.title}</b>
                        <small>
                          {source.breadcrumb.join(" › ") || source.platform}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
        <form
          className="chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="Ask your archive"
            placeholder="Ask about your saved places, products, recommendations…"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button
            type={streaming ? "button" : "submit"}
            className={streaming ? "stop-answer" : ""}
            disabled={!streaming && !question.trim()}
            onClick={streaming ? () => abortRef.current?.abort() : undefined}
          >
            {streaming ? "Stop" : "Send"}
          </button>
        </form>
        <small className="grounding-note">
          Answers use only your saved archive. Open sources to verify creator
          claims.
        </small>
      </section>
    </div>
  );
}

function App() {
  const [authState, setAuthState] = useState<
    "loading" | "setup" | "login" | "ready"
  >("loading");
  const initialTab = new URLSearchParams(window.location.search).get("tab");
  const [tab, setTab] = useState<
    "inbox" | "library" | "ask" | "activity" | "capture" | "settings"
  >(
    initialTab === "library" ||
      initialTab === "ask" ||
      initialTab === "activity" ||
      initialTab === "capture" ||
      initialTab === "settings"
      ? initialTab
      : "inbox",
  );
  const highlightedJob = new URLSearchParams(window.location.search).get("job");
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [platform, setPlatform] = useState("");
  const [category, setCategory] = useState("");
  const [topic, setTopic] = useState("");
  const [facets, setFacets] = useState<CaptureFacets>({
    categories: [],
    topics: [],
  });
  const [detail, setDetail] = useState<string | null>(null);
  const [captureUrl, setCaptureUrl] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobDetails, setJobDetails] = useState<JobDetails | null>(null);
  async function check() {
    try {
      await api("/api/auth/me");
      setAuthState("ready");
    } catch (e) {
      const err = e as { body?: { setupRequired?: boolean } };
      setAuthState(err.body?.setupRequired ? "setup" : "login");
    }
  }
  async function load() {
    const query = new URLSearchParams({ limit: "48" });
    if (deferredSearch) query.set("search", deferredSearch);
    if (platform) query.set("platform", platform);
    if (category) query.set("nodeId", category);
    if (topic) query.set("topic", topic);
    const [c, j, f] = await Promise.all([
      api<{ captures: Capture[] }>(`/api/v1/captures?${query}`),
      api<{ jobs: Job[] }>("/api/v1/jobs?limit=100"),
      api<CaptureFacets>("/api/v1/capture-facets"),
    ]);
    setCaptures(c.captures);
    setJobs(j.jobs);
    setFacets(f);
  }
  useEffect(() => {
    void check();
  }, []);
  useEffect(() => {
    if (authState !== "ready") return;
    void load();
    const stream = new EventSource("/api/v1/events");
    stream.onmessage = () => void load();
    return () => stream.close();
  }, [authState, deferredSearch, platform, category, topic]);
  const hasInboxFilters = Boolean(search || platform || category || topic);
  const counts = useMemo(
    () => ({
      active: jobs.filter((j) => !["complete", "failed"].includes(j.status))
        .length,
      failed: jobs.filter((j) => j.status === "failed").length,
    }),
    [jobs],
  );
  if (authState === "loading")
    return (
      <main className="auth">
        <p>Loading…</p>
      </main>
    );
  if (authState !== "ready")
    return (
      <Auth
        setup={authState === "setup"}
        onDone={() => {
          const returnTo = new URLSearchParams(window.location.search).get(
            "returnTo",
          );
          if (returnTo?.startsWith("/oauth/authorize?"))
            window.location.assign(returnTo);
          else void check();
        }}
      />
    );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("Submitting…");
    try {
      const result = await api<{
        created: boolean;
        retried?: boolean;
        job: Job;
      }>("/api/v1/jobs", {
        method: "POST",
        body: JSON.stringify({ url: captureUrl, note: note || undefined }),
      });
      setMessage(
        result.retried
          ? "The previous failure was re-queued."
          : result.created
            ? "Added to the processing queue."
            : `Already captured · ${result.job.status}`,
      );
      setCaptureUrl("");
      setNote("");
      setTab("activity");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Submission failed");
      setTab("activity");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <>
      <header>
        <div>
          <span className="logo">◉</span>
          <strong>Social Knowledge</strong>
        </div>
        <nav>
          {(
            [
              "inbox",
              "library",
              "ask",
              "activity",
              "capture",
              "settings",
            ] as const
          ).map((x) => (
            <button
              className={tab === x ? "active" : ""}
              onClick={() => setTab(x)}
              key={x}
            >
              {x}
              {x === "activity" && counts.active + counts.failed > 0
                ? ` ${counts.active + counts.failed}`
                : ""}
            </button>
          ))}
        </nav>
        <button
          className="logout"
          onClick={async () => {
            await api("/api/auth/logout", { method: "POST" });
            setAuthState("login");
          }}
        >
          Sign out
        </button>
      </header>
      <main className="shell">
        {tab === "inbox" && (
          <>
            <div className="hero">
              <div>
                <div className="eyebrow">Your private archive</div>
                <h1>Ideas worth keeping.</h1>
                <p>
                  Search the durable knowledge extracted from every saved social
                  post.
                </p>
              </div>
              <div className="stat">
                <strong>{captures.length}</strong>
                <span>captures shown</span>
              </div>
            </div>
            <div className="inbox-filter-panel">
              <div className="filter-toolbar">
                <label className="filter-search">
                  <Search aria-hidden="true" />
                  <span className="sr-only">Search your archive</span>
                  <input
                    placeholder="Search titles, transcripts, places…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setSearch("")}
                    >
                      <X aria-hidden="true" />
                    </button>
                  )}
                </label>
                <label className="platform-filter">
                  <SlidersHorizontal aria-hidden="true" />
                  <span className="sr-only">Filter by platform</span>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                  >
                    <option value="">All platforms</option>
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                  </select>
                </label>
                {hasInboxFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="clear-filters"
                    onClick={() => {
                      setSearch("");
                      setPlatform("");
                      setCategory("");
                      setTopic("");
                    }}
                  >
                    <X aria-hidden="true" /> Clear
                  </Button>
                )}
              </div>
              {!!facets.categories.length && (
                <div className="filter-group">
                  <span>Categories</span>
                  <div className="filter-pills">
                    <button
                      type="button"
                      className={!category ? "active" : ""}
                      onClick={() => setCategory("")}
                    >
                      All
                    </button>
                    {facets.categories.map((facet) => (
                      <button
                        type="button"
                        key={facet.id}
                        className={category === facet.id ? "active" : ""}
                        aria-pressed={category === facet.id}
                        onClick={() =>
                          setCategory((current) =>
                            current === facet.id ? "" : facet.id,
                          )
                        }
                      >
                        {facet.label}
                        <small>{facet.count}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!!facets.topics.length && (
                <div className="filter-group secondary">
                  <span>Topics</span>
                  <div className="filter-pills">
                    {facets.topics.map((facet) => (
                      <button
                        type="button"
                        key={facet.label}
                        className={topic === facet.label ? "active" : ""}
                        aria-pressed={topic === facet.label}
                        onClick={() =>
                          setTopic((current) =>
                            current === facet.label ? "" : facet.label,
                          )
                        }
                      >
                        {facet.label}
                        <small>{facet.count}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="grid">
              {captures.map((c) => (
                <CaptureCard capture={c} onOpen={setDetail} key={c.id} />
              ))}
            </div>
            {!captures.length && (
              <div className="empty">
                <h2>
                  {hasInboxFilters
                    ? "No matching captures"
                    : "Your inbox is ready"}
                </h2>
                <p>
                  {hasInboxFilters
                    ? "Try removing a filter or using a broader keyword."
                    : "Completed captures will appear here."}
                </p>
              </div>
            )}
          </>
        )}
        {tab === "activity" && (
          <>
            <div className="page-title">
              <h1>Activity</h1>
              <p>Live processing history and recoverable failures.</p>
            </div>
            {message && (
              <p className="action-feedback" role="status">
                {message}
              </p>
            )}
            <div className="job-list">
              {jobs.map((job) => (
                <article
                  key={job.id}
                  className={highlightedJob === job.id ? "highlighted" : ""}
                >
                  <div>
                    <div className="job-heading">
                      <PlatformIcon url={job.normalizedUrl} />
                      {job.status !== "complete" && (
                        <span className={`status ${job.status}`}>
                          {stageCopy[job.status] || job.status}
                        </span>
                      )}
                      <strong>
                        {job.displayTitle || sourceReference(job.normalizedUrl)}
                      </strong>
                    </div>
                    <small>
                      {sourceReference(job.normalizedUrl)} ·{" "}
                      {new Date(job.createdAt).toLocaleString()} ·{" "}
                      {job.attempts ? `attempt ${job.attempts}` : "not started"}
                    </small>
                    {job.status === "complete" ? (
                      <div className="complete-summary" role="status">
                        <span aria-hidden="true">✓</span>
                        Complete
                      </div>
                    ) : (
                      <div
                        className="stage-breadcrumbs"
                        aria-label={`Capture stage: ${stageCopy[job.status] || job.status}`}
                      >
                        {stages.slice(0, -1).map((stage, index) => {
                          const current = stages.indexOf(job.status);
                          const reached = job.reachedStages?.includes(stage);
                          const state =
                            current === index
                              ? "current"
                              : reached || current > index
                                ? "reached"
                                : "pending";
                          return (
                            <span
                              className={state}
                              key={stage}
                              title={stageCopy[stage]}
                            >
                              {state === "reached" ? "✓" : index + 1}{" "}
                              {stageCopy[stage]}
                            </span>
                          );
                        })}
                        <span
                          className={`completion-chip ${job.status === "failed" ? "failed" : "pending"}`}
                        >
                          {job.status === "failed" ? "! Failed" : "8 Complete"}
                        </span>
                      </div>
                    )}
                    {job.status === "failed" &&
                      (() => {
                        const failure = failureFor(job);
                        return (
                          <div className="failure-card">
                            <strong>{failure.title}</strong>
                            <p>{failure.message}</p>
                            {(job.errorDetail || job.error) && (
                              <details>
                                <summary>Technical diagnostic</summary>
                                <code>{job.errorDetail || job.error}</code>
                              </details>
                            )}
                          </div>
                        );
                      })()}
                  </div>
                  <div className="job-actions">
                    <button
                      className="info-button"
                      aria-label={`View details for ${job.displayTitle || sourceLabel(job.normalizedUrl)}`}
                      title="View processing details"
                      onClick={async () =>
                        setJobDetails(
                          await api<JobDetails>(`/api/v1/jobs/${job.id}`),
                        )
                      }
                    >
                      i
                    </button>
                    {job.status === "failed" && (
                      <button
                        onClick={async () => {
                          try {
                            setMessage("Retrying capture…");
                            await api(`/api/v1/jobs/${job.id}/retry`, {
                              method: "POST",
                            });
                            setMessage("Capture re-queued successfully.");
                            await load();
                          } catch (error) {
                            setMessage(
                              error instanceof Error
                                ? error.message
                                : "Retry failed",
                            );
                          }
                        }}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {tab === "library" && <Library onOpen={setDetail} />}
        {tab === "ask" && <AskAI onOpen={setDetail} />}
        {tab === "capture" && (
          <div className="capture-panel">
            <div className="eyebrow">Manual capture</div>
            <h1>Save a social post</h1>
            <form onSubmit={submit}>
              <label>
                Facebook or Instagram URL
                <input
                  type="url"
                  required
                  value={captureUrl}
                  onChange={(e) => setCaptureUrl(e.target.value)}
                />
              </label>
              <label>
                Why are you saving it?
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button disabled={submitting}>
                {submitting ? "Submitting…" : "Capture"}
              </button>
              <p>{message}</p>
            </form>
          </div>
        )}
        {tab === "settings" && <Settings />}
      </main>
      {detail && <Detail id={detail} onClose={() => setDetail(null)} />}
      {jobDetails && (
        <JobInfoModal
          details={jobDetails}
          onClose={() => setJobDetails(null)}
        />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
