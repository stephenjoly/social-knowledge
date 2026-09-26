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
  Activity,
  Bot,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Copy,
  DatabaseBackup,
  FileQuestion,
  Folder,
  FolderOpen,
  House,
  Inbox,
  KeyRound,
  LibraryBig,
  Link2,
  LogOut,
  MessageSquare,
  Plus,
  RotateCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Settings as SettingsIcon,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./components/ui/collapsible";
import { ScrollArea } from "./components/ui/scroll-area";
import {
  applyStreamEvent,
  finishStream,
  initialStreamState,
  mergeConversationSnapshot,
  reconcileConversationAttempt,
  SseDecoder,
  type StreamState,
} from "./chat-stream";
import "./styles.css";
import "./activity-capture.css";
import "./auth-redesign.css";
import "./knowledge-ask.css";
import "./settings.css";
import "./inbox.css";

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
  categoryLabel?: string | null;
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
type ActivityStageName = "added" | "found" | "media" | "text" | "saved";
type ActivityStageState = "queued" | "active" | "completed" | "failed";
type ActivityStage = {
  name: ActivityStageName;
  state: ActivityStageState;
  durationMs: number | null;
};
type ActivityJob = {
  id: string;
  status: string;
  normalizedUrl: string;
  displayTitle: string | null;
  attempts: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  reachedStages: ActivityStageName[];
  stages: ActivityStage[];
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
type ActivityEvent = {
  id: string;
  attempt?: number | null;
  failureCode?: string | null;
  status: string;
  createdAt: string;
  label: string;
  message: string | null;
  durationMs: number | null;
  state: "pending" | "running" | "completed" | "failed";
};
type ActivityDetails = { job: ActivityJob; events: ActivityEvent[] };
type ActivityCounts = {
  active: number;
  queued: number;
  failed: number;
  savedToday: number;
  recentEvents: number;
};
type ActivityPage = {
  jobs: ActivityJob[];
  nextCursor: string | null;
  generatedAt: string;
  counts: ActivityCounts;
};
type FailedActivityPage = {
  failures: ActivityJob[];
  nextCursor: string | null;
  total: number;
};
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
  captures: Array<{
    id: string;
    title: string;
    platform: string;
    creator: string | null;
    creatorUrl: string | null;
    sourceUrl: string;
    synopsis: string;
    takeaways: string[];
    createdAt: string;
    assignedNode: { id: string; label: string };
    breadcrumb: Array<{ id: string; label: string }>;
  }>;
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
type InboxView = "tiles" | "table";
type InboxSortKey = "title" | "savedAt" | "source" | "category" | "topic";

const inboxSortOptions: Array<{
  key: InboxSortKey;
  label: string;
  ascending: string;
  descending: string;
}> = [
  {
    key: "savedAt",
    label: "Saved date",
    ascending: "Oldest first",
    descending: "Newest first",
  },
  {
    key: "title",
    label: "Title",
    ascending: "Title A–Z",
    descending: "Title Z–A",
  },
  {
    key: "source",
    label: "Source",
    ascending: "Source A–Z",
    descending: "Source Z–A",
  },
  {
    key: "category",
    label: "Category",
    ascending: "Category A–Z",
    descending: "Category Z–A",
  },
  {
    key: "topic",
    label: "Topic",
    ascending: "Topic A–Z",
    descending: "Topic Z–A",
  },
];

function captureSource(capture: Capture) {
  const platform = capture.platform
    ? `${capture.platform.slice(0, 1).toUpperCase()}${capture.platform.slice(1)}`
    : "Unknown platform";
  return capture.creator ? `${platform} · ${capture.creator}` : platform;
}

function formatCaptureDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
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

function markdownLinkText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\[\]]/g, "\\$&");
}

function libraryHomeMarkdown(
  nodes: LibraryNode[],
  unclassifiedCount: number,
) {
  const populated = nodes.filter((node) => node.captureCount > 0);
  const domains = populated.filter((node) => node.parentId === null);
  const captureCount = domains.reduce((total, node) => total + node.captureCount, 0) + unclassifiedCount;
  const mapBranch = (parentId: string | null, depth = 0): string[] =>
    populated.filter((node) => node.parentId === parentId).flatMap((node) => [
      `${"  ".repeat(depth)}- [${markdownLinkText(node.label)}](library:${node.id}) — ${node.captureCount} ${node.captureCount === 1 ? "capture" : "captures"}`,
      ...mapBranch(node.id, depth + 1),
    ]);
  return [
    "# Social Knowledge",
    "",
    captureCount ? `Browse ${captureCount} saved ${captureCount === 1 ? "capture" : "captures"} across your knowledge base.` : "Your map of content will grow as you save and classify captures.",
    "",
    "## Map of content",
    "",
    ...mapBranch(null),
    ...(unclassifiedCount > 0 ? [`- [Unclassified](library:unclassified) — ${unclassifiedCount} captures`] : []),
    "",
    ...(captureCount > 0 ? ["Open a category to browse its subcategories, extracted insights, and source captures.", ""] : []),
  ].join("\n");
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
  statusText?: string | null;
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

function answerWithCaptureLinks(content: string, sources: AskSource[]) {
  const sourcesByCitation = new Map(
    sources.map((source) => [source.citation, source]),
  );
  let normalized = content;
  let replacedCaptureId = false;
  for (const source of sources) {
    const captureCitation = `[${source.id}]`;
    if (normalized.includes(captureCitation)) {
      normalized = normalized.replaceAll(
        captureCitation,
        `[${source.citation}]`,
      );
      replacedCaptureId = true;
    }
  }
  if (replacedCaptureId)
    normalized = normalized.replace(/\n{2,}Sources:\s*(?:\[\d+]\s*)+$/i, "");
  return normalized.replace(/\[(\d+)]/g, (citation, value: string) => {
    const source = sourcesByCitation.get(Number(value));
    return source ? `[${value}](capture:${source.id})` : citation;
  });
}

function PlatformMark({ platform }: { platform: string }) {
  const normalized = platform.toLowerCase();
  if (normalized === "instagram")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.4" cy="6.7" r="1" className="platform-mark-fill" />
      </svg>
    );
  if (normalized === "facebook")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M14 21v-8h3l.5-3H14V8.2c0-.9.3-1.7 1.8-1.7H18V3.8c-.7-.1-1.5-.2-2.4-.2-2.5 0-4.3 1.6-4.3 4.4v2H8.5v3h2.8v8H14Z"
          className="platform-mark-fill"
        />
      </svg>
    );
  return <span aria-hidden="true">↗</span>;
}

const activityStages: ActivityStageName[] = [
  "added",
  "found",
  "media",
  "text",
  "saved",
];
const activityStageCopy: Record<ActivityStageName, string> = {
  added: "Added",
  found: "Found",
  media: "Media",
  text: "Text",
  saved: "Saved",
};
const activityStatusCopy: Record<string, string> = {
  queued: "Queued",
  downloading: "Downloading",
  processing: "Preparing media",
  transcribing: "Transcribing",
  translating: "Translating",
  analyzing: "Extracting knowledge",
  writing: "Saving capture",
  complete: "Saved",
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
  ai_credentials_rejected: {
    title: "AI credentials rejected",
    message: "Reconnect the AI provider, then retry this capture.",
  },
  ai_quota_exceeded: {
    title: "AI provider quota exceeded",
    message: "Add provider credits or increase the quota, then retry.",
  },
  ai_rate_limited: {
    title: "AI provider rate limit reached",
    message: "Wait a little, then retry this capture.",
  },
  ai_model_unavailable: {
    title: "AI model unavailable",
    message: "Choose or configure an available AI model, then retry.",
  },
};

function failureFor(job: ActivityJob) {
  if (job.errorCode && Object.hasOwn(failureCopy, job.errorCode))
    return failureCopy[job.errorCode]!;
  return {
    title: "Capture failed",
    message: "Retry this capture. If it fails again, check your capture setup.",
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

function formatPreciseDuration(durationMs: number | null) {
  if (durationMs === null) return "pending";
  if (durationMs < 1000) return `${durationMs} ms`;
  if (durationMs < 60000) {
    const seconds = durationMs / 1000;
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function formatEventDuration(event: ActivityEvent) {
  if (event.state === "running") return "running";
  if (event.state === "pending") return "pending";
  return event.durationMs === null ? "—" : formatPreciseDuration(event.durationMs);
}

function formatStageDuration(stage: ActivityStage | undefined) {
  if (!stage || stage.state === "queued") return "pending";
  if (stage.state === "active") return "running";
  return stage.durationMs === null ? "—" : formatPreciseDuration(stage.durationMs);
}

function formatActivityTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 10) return "now";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatEventTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

const activityLogLabels: Record<string, string> = {
  queued: "Queued",
  downloading: "Finding source",
  processing: "Processing media",
  transcribing: "Transcribing",
  translating: "Translating",
  analyzing: "Extracting knowledge",
  writing: "Saving capture",
  complete: "Saved",
  failed: "Capture failed",
};
const safeActivityMessages = new Set([
  "URL accepted and queued",
  "Capture accepted",
  "Source found",
  "Instagram reel found",
  "Facebook post found",
  "Download started",
  "Media prepared",
  "Waiting for media download",
  "Transcript ready",
  "Knowledge extracted",
  "Capture archived",
  "Manual retry requested",
  "Retry scheduled",
  "AI title ready; extracting detailed knowledge",
]);

function safeActivityEvent(event: ActivityEvent): ActivityEvent | null {
  const label = Object.hasOwn(activityLogLabels, event.status)
    ? activityLogLabels[event.status]
    : null;
  if (!label) return null;
  return {
    ...event,
    attempt: Number.isSafeInteger(event.attempt) && (event.attempt ?? 0) > 0 ? event.attempt : null,
    label: event.status === "queued" && event.message === "Manual retry requested"
      ? "Manual retry requested"
      : event.status === "queued" && event.message === "Retry scheduled"
        ? "Automatic retry scheduled"
        : label,
    message: event.status === "failed"
      ? event.failureCode && Object.hasOwn(failureCopy, event.failureCode)
        ? `${failureCopy[event.failureCode]!.title}. ${failureCopy[event.failureCode]!.message}`
        : "The cause was not recorded for this attempt."
      : safeActivityMessages.has(event.message ?? "")
        ? event.message
        : null,
  };
}
type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};
type AiProvider = {
  id: "openai" | "cerebras";
  name: string;
  docsUrl: string;
  connected: boolean;
  status: string;
  keyHint: string | null;
  verifiedAt: string | null;
  supportsVision: boolean;
  capabilities: { transcription: boolean; analysis: boolean };
  models: { transcription: string[]; analysis: string[] };
};
type AiSelection = { provider: "openai" | "cerebras"; model: string };
type AiProviderState = {
  providers: AiProvider[];
  selections: {
    transcription: AiSelection | null;
    analysis: AiSelection | null;
  };
  readiness: { capture: boolean; ask: boolean };
};
type SettingsTopic =
  "overview" | "ai" | "connections" | "api" | "data" | "account" | "all";
type AccountUser = {
  id: string;
  username: string;
  role: string;
  createdAt?: string;
};

type AppTab = "inbox" | "library" | "ask" | "activity" | "capture" | "settings";

function tabFromLocation(): AppTab {
  const value = new URLSearchParams(window.location.search).get("tab");
  return value === "library" ||
    value === "ask" ||
    value === "activity" ||
    value === "capture" ||
    value === "settings"
    ? value
    : "inbox";
}

const appNavigation: Array<{
  tab: Exclude<AppTab, "capture">;
  label: string;
  icon: LucideIcon;
}> = [
  { tab: "inbox", label: "Inbox", icon: Inbox },
  { tab: "activity", label: "Activity", icon: Activity },
  { tab: "library", label: "Knowledge base", icon: LibraryBig },
  { tab: "ask", label: "Ask", icon: MessageSquare },
  { tab: "settings", label: "Settings", icon: SettingsIcon },
];

function AppNavigation({
  tab,
  activeCount,
  onNavigate,
}: {
  tab: AppTab;
  activeCount: number;
  onNavigate: (nextTab: AppTab) => void;
}) {
  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {appNavigation.map(({ tab: nextTab, label, icon: Icon }) => (
        <button
          type="button"
          className={tab === nextTab ? "active" : ""}
          data-tab={nextTab}
          aria-label={label}
          aria-current={tab === nextTab ? "page" : undefined}
          onClick={() => onNavigate(nextTab)}
          key={nextTab}
        >
          <Icon className="app-nav-icon" aria-hidden="true" />
          <span className="app-nav-desktop-label">{label}</span>
          <span className="app-nav-mobile-label" aria-hidden="true">
            {nextTab === "library" ? "Knowledge" : label}
          </span>
          {nextTab === "activity" && activeCount > 0 && (
            <span className="app-nav-badge" aria-hidden="true">
              {activeCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
type Invitation = {
  id: string;
  role: "admin" | "member";
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
};
type InvitationDetails = {
  role: "admin" | "member";
  expiresAt: string;
};
type DemoAccount = {
  username: string;
  password: string;
  role: "admin" | "member";
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

function RegistrationForm({
  setup,
  inviteToken,
  invite,
  onDone,
}: {
  setup?: boolean;
  inviteToken?: string;
  invite?: InvitationDetails | null;
  onDone: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const isAdministrator = setup || invite?.role === "admin";
  const heading = setup
    ? "Create your private archive"
    : invite?.role === "admin"
      ? "Join as an administrator"
      : "Join this private archive";
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    if (isAdministrator && !acknowledged) {
      setError(
        "Confirm that you understand this account has administrator access.",
      );
      return;
    }
    try {
      await api(setup ? "/api/auth/setup" : "/api/auth/invitations/redeem", {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          ...(setup ? { administratorAcknowledged: acknowledged } : {}),
          ...(inviteToken
            ? { token: inviteToken, administratorAcknowledged: acknowledged }
            : {}),
        }),
      });
      onDone();
    } catch (e) {
      const code = (e as { body?: { error?: string } }).body?.error;
      setError(
        code === "setup_complete"
          ? "An administrator account has already been created. Sign in instead."
          : code === "invalid_invitation"
            ? "This invitation is no longer valid. Ask an administrator for a new link."
            : e instanceof Error
              ? e.message
              : "Unable to create your account.",
      );
    }
  }
  return (
    <main className="auth">
      <section className="auth-card">
        <div className="auth-wordmark">social knowledge</div>
        <h1>{heading}</h1>
        <p>
          {setup
            ? "Your first account manages access to this archive. Connect an AI provider next, or set it up later."
            : isAdministrator
              ? "This invitation grants administrator access. Administrators can invite others, but cannot see their private archive data."
              : "Choose your own sign-in details. Your saved archive stays private to your account."}
        </p>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              minLength={2}
              maxLength={40}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
          {isAdministrator && (
            <label>
              <span className="auth-acknowledgement">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                I understand this is an administrator account and can manage
                access to this archive.
              </span>
            </label>
          )}
          <button>Create account</button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}

function Auth({
  setup,
  inviteToken,
  onDone,
}: {
  setup: boolean;
  inviteToken: string | null;
  onDone: (created?: boolean) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [invite, setInvite] = useState<InvitationDetails | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(Boolean(inviteToken));
  useEffect(() => {
    if (!inviteToken) return;
    void api<{ invitation: InvitationDetails }>(
      "/api/auth/invitations/inspect",
      {
        method: "POST",
        body: JSON.stringify({ token: inviteToken }),
      },
    )
      .then((result) => setInvite(result.invitation))
      .catch(() =>
        setError(
          "This invitation is no longer valid. Ask an administrator for a new link.",
        ),
      )
      .finally(() => setLoadingInvite(false));
  }, [inviteToken]);
  useEffect(() => {
    if (setup || inviteToken) return;
    void api<{ accounts: DemoAccount[] }>("/api/auth/demo-accounts")
      .then((result) => setDemoAccounts(result.accounts))
      .catch(() => setDemoAccounts([]));
  }, [setup, inviteToken]);
  if (setup || (inviteToken && invite))
    return (
      <RegistrationForm
        setup={setup}
        inviteToken={inviteToken ?? undefined}
        invite={invite}
        onDone={() => onDone(true)}
      />
    );
  if (inviteToken && loadingInvite)
    return (
      <main className="auth">
        <p>Checking invitation…</p>
      </main>
    );
  if (inviteToken && error)
    return (
      <main className="auth">
        <section className="auth-card">
          <h1>Invitation unavailable</h1>
          <p className="error" role="alert">
            {error}
          </p>
        </section>
      </main>
    );
  async function login(loginUsername: string, loginPassword: string) {
    setError("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      });
      onDone(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? "Incorrect username or password."
          : "Unable to sign in.",
      );
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await login(username, password);
  }
  return (
    <main className="auth">
      <section className="auth-card">
        <div className="auth-wordmark">social knowledge</div>
        <h1>Welcome back</h1>
        <p>Sign in to your Social Knowledge archive.</p>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button>Continue</button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
        {!!demoAccounts.length && (
          <section
            className="demo-accounts"
            aria-labelledby="demo-accounts-title"
          >
            <h2 id="demo-accounts-title">Test accounts</h2>
            {demoAccounts.map((account) => (
              <article key={account.username}>
                <div>
                  <strong>
                    {account.role === "admin"
                      ? "Demo administrator"
                      : "Demo member"}
                  </strong>
                  <span>{account.username}</span>
                  <code>{account.password}</code>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void login(account.username, account.password)}
                >
                  Use account
                </button>
              </article>
            ))}
            <small>
              Synthetic test accounts only. Never store real information here.
            </small>
          </section>
        )}
      </section>
    </main>
  );
}

function ProviderOnboarding({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<AiProviderState | null>(null);
  const [step, setStep] = useState<"transcription" | "analysis">(
    "transcription",
  );
  const [provider, setProvider] = useState<"openai" | "cerebras">("openai");
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    void api<AiProviderState>("/api/v1/ai-providers").then((result) => {
      setState(result);
      if (result.selections.transcription) setStep("analysis");
    });
  }, []);
  const selectedProvider = state?.providers.find(
    (item) => item.id === provider,
  );
  async function choose(
    selection: "transcription" | "analysis",
    selected: AiSelection,
  ) {
    const result = await api<AiProviderState>("/api/v1/ai-settings", {
      method: "PUT",
      body: JSON.stringify({ [selection]: selected }),
    });
    setState(result);
    return result;
  }
  return (
    <main className="auth">
      <section className="auth-card onboarding-card">
        <div className="auth-wordmark">social knowledge</div>
        <p className="step-label">
          Step {step === "transcription" ? "1" : "2"} of 2
        </p>
        <h1>
          {step === "transcription"
            ? "Transcribe your captures"
            : "Analyze your archive"}
        </h1>
        <p>
          {step === "transcription"
            ? "Connect OpenAI to turn reel audio into searchable text."
            : "Choose the provider that summarizes captures and answers questions."}{" "}
          Keys are encrypted and verified before they are saved.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitting(true);
            setMessage("Testing the key with the provider…");
            try {
              let result = state!;
              if (!selectedProvider?.connected) {
                result = await api<AiProviderState>(
                  `/api/v1/ai-providers/${provider}`,
                  { method: "PUT", body: JSON.stringify({ apiKey }) },
                );
                setState(result);
              }
              const definition = result.providers.find(
                (item) => item.id === provider,
              )!;
              const model = definition.models[step][0];
              if (!model) throw new Error("model_unavailable");
              result = await choose(step, { provider, model });
              setApiKey("");
              if (step === "transcription") {
                setStep("analysis");
                setProvider(
                  result.providers.find((item) => item.id === "openai")
                    ?.connected
                    ? "openai"
                    : "cerebras",
                );
                setMessage(
                  "Transcription is ready. Now choose how to analyze your archive.",
                );
              } else onDone();
            } catch (error) {
              setMessage(
                (error as { body?: { error?: string } }).body?.error ===
                  "invalid_api_key"
                  ? "The provider rejected that API key. Check it and try again."
                  : "The provider could not be reached. Try again shortly.",
              );
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {step === "analysis" && (
            <label>
              Analysis provider
              <select
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value as "openai" | "cerebras");
                  setApiKey("");
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="cerebras">Cerebras</option>
              </select>
            </label>
          )}
          {selectedProvider?.models[step][0] && (
            <p className="model-choice">
              <span>
                {step === "transcription"
                  ? "Transcription model"
                  : "Analysis model"}
              </span>
              <strong>{selectedProvider.models[step][0]}</strong>
            </p>
          )}
          {selectedProvider?.connected ? (
            <p className="connected-choice">
              <strong>{selectedProvider.name} connected</strong>
              <span>
                {selectedProvider.keyHint} · no need to enter the key again
              </span>
            </p>
          ) : (
            <label>
              {provider === "cerebras" ? "Cerebras" : "OpenAI"} API key
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="off"
                placeholder="Paste API key"
                required
              />
            </label>
          )}
          <button disabled={submitting || !state}>
            {submitting
              ? "Verifying…"
              : step === "transcription"
                ? "Connect transcription"
                : "Use for analysis"}
          </button>
          <button type="button" className="secondary-button" onClick={onDone}>
            Set up later
          </button>
          <p className="settings-help">
            Capture needs transcription and analysis. Ask only needs analysis.
            You can finish either setup in Settings.
          </p>
          {message && (
            <p className="action-feedback" role="status">
              {message}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}

function CaptureCard({
  capture,
  onOpen,
  categoryLabel,
}: {
  capture: Capture;
  onOpen: (id: string) => void;
  categoryLabel: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const thumb = capture.assets.find(
    (a) => a.kind === "thumbnail" || a.kind === "image",
  );
  return (
    <button
      type="button"
      className="capture-card inbox-tile"
      onClick={() => onOpen(capture.id)}
    >
      <span className="inbox-tile-media">
        {thumb && !imageFailed ? (
          <img
            src={assetUrl(capture.id, thumb.id)}
            alt=""
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="placeholder" aria-hidden="true">
            {capture.platform.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      <span className="card-body">
        <span className="inbox-tile-source">
          <span>
            <PlatformMark platform={capture.platform} />
            {captureSource(capture)}
          </span>
          <time dateTime={capture.createdAt}>
            {formatCaptureDate(capture.createdAt)}
          </time>
        </span>
        <strong className="inbox-tile-title">{capture.title}</strong>
        <span className="inbox-tile-summary">
          {capture.synopsis || "No summary is available yet."}
        </span>
        <span className="inbox-tile-footer">
          {categoryLabel && <span>Category: {categoryLabel}</span>}
          {capture.topics.slice(0, 1).map((topic) => (
            <span className="inbox-topic" key={topic}>
              {topic}
            </span>
          ))}
          <span className="inbox-open-detail">
            Open details <ChevronRight aria-hidden="true" />
          </span>
        </span>
      </span>
    </button>
  );
}

function CaptureTableRow({
  capture,
  onOpen,
  categoryLabel,
}: {
  capture: Capture;
  onOpen: (id: string) => void;
  categoryLabel: string | null;
}) {
  return (
    <tr>
      <td>
        <button
          type="button"
          className="inbox-table-title"
          onClick={() => onOpen(capture.id)}
        >
          {capture.title}
          <ChevronRight aria-hidden="true" />
        </button>
      </td>
      <td>
        <time dateTime={capture.createdAt}>
          {formatCaptureDate(capture.createdAt)}
        </time>
      </td>
      <td>{captureSource(capture)}</td>
      <td>{categoryLabel || "—"}</td>
      <td>{capture.topics[0] || "—"}</td>
    </tr>
  );
}

function CaptureMobileRow({
  capture,
  onOpen,
  categoryLabel,
}: {
  capture: Capture;
  onOpen: (id: string) => void;
  categoryLabel: string | null;
}) {
  return (
    <article className="inbox-mobile-row">
      <button type="button" onClick={() => onOpen(capture.id)}>
        <strong>
          {capture.title}
          <ChevronRight aria-hidden="true" />
        </strong>
        <span>
          <b>Saved date</b>
          <time dateTime={capture.createdAt}>
            {formatCaptureDate(capture.createdAt)}
          </time>
        </span>
        <span>
          <b>Source</b>
          {captureSource(capture)}
        </span>
        <span>
          <b>Category</b>
          {categoryLabel || "—"}
        </span>
        <span>
          <b>Topic</b>
          {capture.topics[0] || "—"}
        </span>
      </button>
    </article>
  );
}

function InboxLoadingCards() {
  return (
    <div className="inbox-loading-cards" aria-label="Loading captures">
      {[1, 2, 3, 4].map((index) => (
        <div className="inbox-loading-card" key={index} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
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

function AccessManagement() {
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [administratorAcknowledged, setAdministratorAcknowledged] =
    useState(false);
  const [message, setMessage] = useState("");
  const [createdInvitationUrl, setCreatedInvitationUrl] = useState("");
  async function load() {
    setLoadError("");
    try {
      const [userResult, invitationResult] = await Promise.all([
        api<{ users: AccountUser[] }>("/api/v1/admin/users"),
        api<{ invitations: Invitation[] }>("/api/v1/admin/invitations"),
      ]);
      setUsers(userResult.users);
      setInvitations(invitationResult.invitations);
    } catch {
      setLoadError("People and invitations could not be loaded. Try again.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const copyInvitation = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage(
        "Invitation link copied. It is shown only when created or regenerated.",
      );
    } catch {
      setMessage("Copy the invitation link from the field below.");
    }
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (role === "admin" && !administratorAcknowledged) {
      setMessage(
        "Confirm administrator access before creating this invitation.",
      );
      return;
    }
    try {
      const result = await api<{
        invitation: Invitation;
        invitationUrl: string;
      }>("/api/v1/admin/invitations", {
        method: "POST",
        body: JSON.stringify({ role, administratorAcknowledged }),
      });
      setCreatedInvitationUrl(result.invitationUrl);
      setMessage(
        `${role === "admin" ? "Administrator" : "Member"} invitation created. It expires in 24 hours.`,
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Invitation could not be created.",
      );
    }
  };
  return (
    <section className="settings-card access-management">
      <h2>People and access</h2>
      <p className="settings-help">
        Administrators can invite people and manage invitations. Each person’s
        archive, connections, API keys, and exports remain private to their
        account.
      </p>
      <form onSubmit={create}>
        <label>
          Invitation role
          <select
            value={role}
            onChange={(event) => {
              setRole(event.target.value as "member" | "admin");
              setAdministratorAcknowledged(false);
            }}
          >
            <option value="member">Member — private archive access</option>
            <option value="admin">Administrator — can manage access</option>
          </select>
        </label>
        {role === "admin" && (
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={administratorAcknowledged}
              onChange={(event) =>
                setAdministratorAcknowledged(event.target.checked)
              }
            />
            I understand this invitation grants administrator access.
          </label>
        )}
        <button>Create invitation</button>
      </form>
      {message && (
        <p className="action-feedback" role="status">
          {message}
        </p>
      )}
      {loadError && (
        <div className="settings-inline-error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {createdInvitationUrl && (
        <div className="token-box invitation-link">
          <strong>Share this link securely</strong>
          <input
            value={createdInvitationUrl}
            readOnly
            aria-label="New invitation link"
          />
          <button
            type="button"
            onClick={() => void copyInvitation(createdInvitationUrl)}
          >
            Copy invitation
          </button>
        </div>
      )}
      <div className="access-list">
        <h3>Accounts</h3>
        {users.map((user) => (
          <article key={user.id}>
            <div>
              <strong>{user.username}</strong>
              <small>
                {user.role === "admin" ? "Administrator" : "Member"}
                {user.createdAt
                  ? ` · joined ${new Date(user.createdAt).toLocaleDateString()}`
                  : ""}
              </small>
            </div>
          </article>
        ))}
        {!users.length && !loadError && (
          <p className="settings-help">
            {loading ? "Loading accounts…" : "No accounts yet."}
          </p>
        )}
      </div>
      <div className="access-list">
        <h3>Invitations</h3>
        {invitations.map((invitation) => {
          const inactive =
            invitation.consumedAt ||
            invitation.revokedAt ||
            new Date(invitation.expiresAt).getTime() < Date.now();
          const state = invitation.consumedAt
            ? "Used"
            : invitation.revokedAt
              ? "Revoked"
              : new Date(invitation.expiresAt).getTime() < Date.now()
                ? "Expired"
                : "Active";
          return (
            <article key={invitation.id}>
              <div>
                <strong>
                  {invitation.role === "admin" ? "Administrator" : "Member"}{" "}
                  invitation
                </strong>
                <small>
                  {state} · expires{" "}
                  {new Date(invitation.expiresAt).toLocaleString()}
                </small>
              </div>
              <div className="access-actions">
                {!inactive && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={async () => {
                      try {
                        await api(
                          `/api/v1/admin/invitations/${invitation.id}/revoke`,
                          { method: "POST" },
                        );
                        setMessage("Invitation revoked.");
                        await load();
                      } catch {
                        setMessage(
                          "Invitation could not be revoked. Try again.",
                        );
                      }
                    }}
                  >
                    Revoke
                  </button>
                )}
                {!invitation.consumedAt && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={async () => {
                      try {
                        const result = await api<{ invitationUrl: string }>(
                          `/api/v1/admin/invitations/${invitation.id}/regenerate`,
                          { method: "POST" },
                        );
                        setCreatedInvitationUrl(result.invitationUrl);
                        setMessage(
                          "New invitation link created. The previous link no longer works.",
                        );
                        await load();
                      } catch {
                        setMessage(
                          "Invitation link could not be regenerated. Try again.",
                        );
                      }
                    }}
                  >
                    Regenerate
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!invitations.length && !loadError && (
          <p className="settings-help">
            {loading ? "Loading invitations…" : "No invitations yet."}
          </p>
        )}
      </div>
    </section>
  );
}

function Settings({ user }: { user: AccountUser | null }) {
  const [topic, setTopic] = useState<SettingsTopic>("overview");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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
  const [aiState, setAiState] = useState<AiProviderState | null>(null);
  const aiStateRef = useRef<AiProviderState | null>(null);
  const [selectedAiProvider, setSelectedAiProvider] = useState<
    "openai" | "cerebras"
  >("cerebras");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [providerMessage, setProviderMessage] = useState("");
  const [verifyingProvider, setVerifyingProvider] = useState(false);
  const applyAiState = (nextState: AiProviderState) => {
    aiStateRef.current = nextState;
    setAiState(nextState);
  };
  async function load(showLoading = false) {
    if (showLoading) setLoading(true);
    setLoadError("");
    try {
      const [
        keyResult,
        preferenceResult,
        connectionResult,
        exportResult,
        platformResult,
        aiResult,
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
        api<AiProviderState>("/api/v1/ai-providers"),
      ]);
      setKeys(keyResult.apiKeys);
      setDefaultLanguage(preferenceResult.preferences.defaultLanguage);
      setTranslateForeign(preferenceResult.preferences.translateForeign);
      setConnections(connectionResult.connections);
      setMcpUrl(connectionResult.mcpUrl);
      setLibraryExports(exportResult.exports);
      setPlatformConnections(platformResult.connections);
      applyAiState(aiResult);
    } catch {
      setLoadError(
        "Settings could not be loaded. Check your connection and try again.",
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }
  useEffect(() => {
    void load(true);
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
    try {
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
    } catch {
      setMessage("The API key could not be created. Try again.");
    }
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
  async function saveTaskSelection(
    task: "transcription" | "analysis",
    provider: AiSelection["provider"],
    model: string,
  ) {
    try {
      const result = await api<AiProviderState>("/api/v1/ai-settings", {
        method: "PUT",
        body: JSON.stringify({ [task]: { provider, model } }),
      });
      applyAiState(result);
      setProviderMessage(
        `${task === "transcription" ? "Transcription" : "Analysis"} selection updated.`,
      );
    } catch {
      setProviderMessage(
        `The ${task === "transcription" ? "transcription" : "analysis"} selection could not be updated. Try again.`,
      );
    }
  }
  const topics: Array<{
    id: SettingsTopic;
    label: string;
    description: string;
    icon: LucideIcon;
  }> = [
    {
      id: "overview",
      label: "Overview",
      description: "A clear view of your setup.",
      icon: SettingsIcon,
    },
    {
      id: "ai",
      label: "AI",
      description: "Providers and task models.",
      icon: Bot,
    },
    {
      id: "connections",
      label: "Connections",
      description: "Sources and social sessions.",
      icon: Link2,
    },
    {
      id: "api",
      label: "API keys",
      description: "Integration access.",
      icon: KeyRound,
    },
    {
      id: "data",
      label: "Data & export",
      description: "Language and portable archives.",
      icon: DatabaseBackup,
    },
    {
      id: "account",
      label: "Account",
      description: "Profile and access management.",
      icon: UserRound,
    },
  ];
  const connectedPlatforms = platformConnections.filter(
    (connection) => connection.connected,
  );
  const openAi = aiState?.providers.find(
    (provider) => provider.id === "openai",
  );
  const activeTopic = topics.find((item) => item.id === topic);
  const showTopic = (value: SettingsTopic) =>
    topic === value || topic === "all";
  const selectTopic = (value: SettingsTopic) => {
    setTopic(value);
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(".settings-heading")?.focus(),
    );
  };
  return (
    <div className="settings settings-workspace">
      <header className="settings-heading" tabIndex={-1}>
        <div>
          <p className="settings-breadcrumb">
            {topic === "overview"
              ? "SETTINGS"
              : `SETTINGS  /  ${activeTopic?.label ?? "ALL TOPICS"}`}
          </p>
          <h1>
            {topic === "overview"
              ? "Settings"
              : (activeTopic?.label ?? "All settings")}
          </h1>
          <p>
            {topic === "overview"
              ? "Manage your sources, AI, access, and archive."
              : (activeTopic?.description ??
                "Review every part of your workspace setup.")}
          </p>
        </div>
        {topic !== "overview" && (
          <button
            className="settings-back"
            type="button"
            onClick={() => selectTopic("overview")}
          >
            Back to overview
          </button>
        )}
      </header>
      <div className="settings-layout">
        <nav className="settings-topic-sidebar" aria-label="Settings topics">
          <span className="settings-topic-label">Settings</span>
          {topics.map(({ id, label, icon: Icon }) => (
            <button
              className={topic === id ? "active" : ""}
              type="button"
              aria-current={topic === id ? "page" : undefined}
              onClick={() => selectTopic(id)}
              key={id}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-panels">
          <nav className="settings-mobile-topics" aria-label="Settings topics">
            <button
              type="button"
              className={topic === "overview" ? "active" : ""}
              onClick={() => selectTopic("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={topic === "ai" ? "active" : ""}
              onClick={() => selectTopic("ai")}
            >
              AI
            </button>
            <label>
              <span className="sr-only">More settings topics</span>
              <select
                aria-label="More settings topics"
                value={topic === "overview" || topic === "ai" ? "" : topic}
                onChange={(event) =>
                  selectTopic(event.target.value as SettingsTopic)
                }
              >
                <option value="">All topics</option>
                <option value="connections">Connections</option>
                <option value="api">API keys</option>
                <option value="data">Data & export</option>
                <option value="account">Account</option>
                <option value="all">View all settings</option>
              </select>
            </label>
          </nav>
          {loading ? (
            <section
              className="settings-loading"
              aria-live="polite"
              aria-busy="true"
            >
              <span className="settings-loading-mark" aria-hidden="true" />
              <div>
                <strong>Loading settings</strong>
                <p>Getting your private workspace ready.</p>
              </div>
            </section>
          ) : loadError ? (
            <section className="settings-load-error" role="alert">
              <strong>Settings unavailable</strong>
              <p>{loadError}</p>
              <button type="button" onClick={() => void load(true)}>
                Try again
              </button>
            </section>
          ) : (
            <>
              {topic === "overview" && (
                <section
                  className="settings-overview"
                  aria-labelledby="settings-essentials-heading"
                >
                  <div className="settings-overview-heading">
                    <div>
                      <p className="settings-section-kicker">ESSENTIALS</p>
                      <h2 id="settings-essentials-heading">
                        Start where it matters
                      </h2>
                    </div>
                    {!openAi?.connected && (
                      <button
                        className="settings-quick-action"
                        type="button"
                        onClick={() => {
                          setSelectedAiProvider("openai");
                          selectTopic("ai");
                        }}
                      >
                        Connect OpenAI
                      </button>
                    )}
                  </div>
                  <div className="settings-overview-list">
                    {[
                      {
                        id: "connections" as const,
                        icon: Link2,
                        title: "Connections",
                        detail: "Connect sources and see what is syncing.",
                        status: `${connectedPlatforms.length} connected`,
                      },
                      {
                        id: "ai" as const,
                        icon: Bot,
                        title: "AI",
                        detail:
                          "Choose providers for transcription and analysis.",
                        status: aiState?.readiness.capture
                          ? "Ready"
                          : "Needs setup",
                      },
                      {
                        id: "api" as const,
                        icon: KeyRound,
                        title: "API keys",
                        detail: "Create and manage access for integrations.",
                        status: keys.length
                          ? `${keys.length} active`
                          : "No keys",
                      },
                      {
                        id: "data" as const,
                        icon: DatabaseBackup,
                        title: "Full archive export",
                        detail:
                          "Download your complete archive in a portable format.",
                        status: libraryExports.some(
                          (item) => item.status === "pending",
                        )
                          ? "Preparing"
                          : "Available",
                      },
                    ].map(({ id, icon: Icon, title, detail, status }) => (
                      <button
                        className="settings-overview-row"
                        type="button"
                        onClick={() => selectTopic(id)}
                        key={id}
                      >
                        <span
                          className="settings-overview-icon"
                          aria-hidden="true"
                        >
                          <Icon />
                        </span>
                        <span className="settings-overview-copy">
                          <strong>{title}</strong>
                          <small>{detail}</small>
                        </span>
                        <span className="settings-overview-status">
                          {status}
                        </span>
                        <ChevronRight aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  <div className="settings-account-summary">
                    <div>
                      <span
                        className="settings-overview-icon"
                        aria-hidden="true"
                      >
                        <ShieldCheck />
                      </span>
                      <span>
                        <strong>Account</strong>
                        <small>
                          {user?.role === "admin"
                            ? "Profile, security, and people access."
                            : "Your profile and private workspace preferences."}
                        </small>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectTopic("account")}
                    >
                      Manage account <ChevronRight aria-hidden="true" />
                    </button>
                  </div>
                </section>
              )}
              {showTopic("ai") && (
                <section className="settings-card ai-provider-settings">
                  <div className="settings-card-heading">
                    <span className="settings-section-kicker">
                      1 · PROVIDER CONNECTIONS
                    </span>
                    <h2>AI processing</h2>
                  </div>
                  <p className="settings-help">
                    Choose transcription and analysis separately. Provider keys
                    are encrypted at rest and never shown again.
                  </p>
                  <div className="ai-readiness" role="status">
                    <strong>
                      {aiState?.readiness.capture
                        ? "Capture ready"
                        : "Capture needs transcription and analysis"}
                    </strong>
                    <span>
                      {aiState?.readiness.ask
                        ? "Ask is ready."
                        : "Ask needs an analysis provider."}
                    </span>
                  </div>
                  <div className="ai-task-grid">
                    {(["transcription", "analysis"] as const).map((task) => {
                      const selection = aiState?.selections[task];
                      const options = (aiState?.providers ?? []).filter(
                        (item) => item.capabilities[task],
                      );
                      return (
                        <article className="ai-task" key={task}>
                          <span className="step-label">
                            {task === "transcription" ? "Step 1" : "Step 2"}
                          </span>
                          <h3>
                            {task === "transcription"
                              ? "Transcription"
                              : "Analysis & Ask"}
                          </h3>
                          <p>
                            {task === "transcription"
                              ? "Turns audio into searchable text. OpenAI is currently required."
                              : "Creates summaries, topics, vision insights, and answers."}
                          </p>
                          <label>
                            Provider
                            <select
                              value={selection?.provider ?? ""}
                              onChange={async (event) => {
                                const provider = event.target.value as
                                  "openai" | "cerebras";
                                const currentOptions = (
                                  aiStateRef.current?.providers ?? options
                                ).filter((item) => item.capabilities[task]);
                                const definition = currentOptions.find(
                                  (item) => item.id === provider,
                                );
                                if (!definition?.connected) {
                                  setSelectedAiProvider(provider);
                                  setProviderMessage(
                                    `Connect ${definition?.name ?? provider} below before selecting it for ${task}.`,
                                  );
                                  return;
                                }
                                const model = definition.models[task][0];
                                if (!model) {
                                  setProviderMessage(
                                    `${definition.name} has no ${task} model available.`,
                                  );
                                  return;
                                }
                                await saveTaskSelection(task, provider, model);
                              }}
                            >
                              <option value="" disabled>
                                Choose provider
                              </option>
                              {options.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                  {item.connected
                                    ? " · connected"
                                    : " · connect first"}
                                </option>
                              ))}
                            </select>
                          </label>
                          {selection && (
                            <label>
                              Model
                              <select
                                value={selection.model}
                                onChange={async (event) => {
                                  await saveTaskSelection(
                                    task,
                                    selection.provider,
                                    event.target.value,
                                  );
                                }}
                              >
                                {options
                                  .find(
                                    (item) => item.id === selection.provider,
                                  )
                                  ?.models[task].map((model) => (
                                    <option key={model}>{model}</option>
                                  ))}
                              </select>
                            </label>
                          )}
                          <strong
                            className={
                              selection ? "task-status ready" : "task-status"
                            }
                          >
                            {selection
                              ? `${options.find((item) => item.id === selection.provider)?.name} · ${selection.model}`
                              : "Not configured"}
                          </strong>
                        </article>
                      );
                    })}
                  </div>
                  <h3 className="provider-connections-title">
                    Provider connections
                  </h3>
                  <div className="platform-connections">
                    {(aiState?.providers ?? []).map((provider) => (
                      <article
                        className={
                          provider.id === selectedAiProvider
                            ? "selected-provider"
                            : ""
                        }
                        key={provider.id}
                      >
                        <div className="platform-connection-heading">
                          <div>
                            <strong>{provider.name}</strong>
                            <span
                              className={`connection-state ${provider.connected ? "connected" : ""}`}
                            >
                              {provider.connected
                                ? "Verified"
                                : provider.status === "needs_attention"
                                  ? "Reconnect needed"
                                  : "Not connected"}
                            </span>
                          </div>
                        </div>
                        <p>
                          {provider.connected
                            ? `${provider.keyHint} · verified ${new Date(provider.verifiedAt!).toLocaleString()}`
                            : provider.id === "cerebras"
                              ? "Fast text generation through Cerebras Inference. Transcript, description, and comments are analyzed; sampled video frames are not sent."
                              : "Required for transcription; also supports analysis and vision."}
                        </p>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setSelectedAiProvider(provider.id)}
                        >
                          {provider.connected
                            ? "Replace key"
                            : `Connect ${provider.name}`}
                        </button>
                        {provider.connected && (
                          <button
                            type="button"
                            className="text-button danger-button"
                            onClick={async () => {
                              try {
                                const result = await api<AiProviderState>(
                                  `/api/v1/ai-providers/${provider.id}`,
                                  { method: "DELETE" },
                                );
                                applyAiState(result);
                                setProviderMessage(
                                  `${provider.name} disconnected. Any task that used it now needs a provider.`,
                                );
                              } catch {
                                setProviderMessage(
                                  `${provider.name} could not be disconnected. Try again.`,
                                );
                              }
                            }}
                          >
                            Disconnect {provider.name}
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                  <form
                    className="settings-provider-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      setVerifyingProvider(true);
                      setProviderMessage("Testing the key with the provider…");
                      try {
                        const result = await api<AiProviderState>(
                          `/api/v1/ai-providers/${selectedAiProvider}`,
                          {
                            method: "PUT",
                            body: JSON.stringify({ apiKey: providerApiKey }),
                          },
                        );
                        applyAiState(result);
                        setProviderApiKey("");
                        setProviderMessage(
                          `${selectedAiProvider === "cerebras" ? "Cerebras" : "OpenAI"} connected. Review the task selections above.`,
                        );
                      } catch (error) {
                        setProviderMessage(
                          (error as { body?: { error?: string } }).body
                            ?.error === "invalid_api_key"
                            ? "The provider rejected that API key. Check it and try again."
                            : "The provider could not be reached. Try again shortly.",
                        );
                      } finally {
                        setVerifyingProvider(false);
                      }
                    }}
                  >
                    <label>
                      {selectedAiProvider === "cerebras"
                        ? "Cerebras"
                        : "OpenAI"}{" "}
                      API key
                      <input
                        type="password"
                        value={providerApiKey}
                        onChange={(event) =>
                          setProviderApiKey(event.target.value)
                        }
                        autoComplete="off"
                        required
                        placeholder="Paste API key"
                      />
                    </label>
                    <button disabled={verifyingProvider}>
                      {verifyingProvider ? "Verifying…" : "Verify and use"}
                    </button>
                  </form>
                  {providerMessage && (
                    <p
                      className="action-feedback"
                      role="status"
                      aria-live="polite"
                    >
                      {providerMessage}
                    </p>
                  )}
                </section>
              )}
              {showTopic("connections") && (
                <section className="settings-card settings-connections-card">
                  <h2>Facebook and Instagram</h2>
                  <p className="settings-help">
                    Connect your logged-in browser session so private or
                    login-protected posts can be captured. Export a
                    Netscape-format <code>cookies.txt</code> while signed in,
                    then upload it here. Passwords are never requested or
                    stored.
                  </p>
                  <div className="platform-connections">
                    {platformConnections.map((connection) => {
                      const label =
                        connection.platform === "instagram"
                          ? "Instagram"
                          : "Facebook";
                      return (
                        <article key={connection.platform}>
                          <div className="platform-connection-heading">
                            <PlatformIcon
                              url={`https://www.${connection.platform}.com`}
                            />
                            <div>
                              <strong>{label}</strong>
                              <span
                                className={`connection-state ${connection.status}`}
                              >
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
                                  try {
                                    await api(
                                      `/api/v1/platform-connections/${connection.platform}`,
                                      { method: "DELETE" },
                                    );
                                    setPlatformMessage(
                                      `${label} disconnected.`,
                                    );
                                    await load();
                                  } catch {
                                    setPlatformMessage(
                                      `${label} could not be disconnected. Try again.`,
                                    );
                                  }
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
                      Use a trusted cookies.txt exporter in your desktop browser
                      while logged into the selected platform. Social Knowledge
                      discards every cookie that does not belong to that
                      platform before encrypting the connection.
                    </p>
                  </details>
                </section>
              )}
              {showTopic("api") && (
                <section className="settings-card settings-agent-connections-card">
                  <h2>AI Connections</h2>
                  <p className="settings-help">
                    Connect ChatGPT, Codex, or another MCP client with read-only
                    access to your saved archive.
                  </p>
                  <label>
                    MCP server
                    <input readOnly value={mcpUrl} />
                  </label>
                  <details className="api-examples">
                    <summary>Codex configuration</summary>
                    <p>
                      Store your account key in{" "}
                      <code>SOCIAL_KNOWLEDGE_API_KEY</code>, then add:
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
                            {new Date(
                              connection.authorizedAt,
                            ).toLocaleDateString()}{" "}
                            ·{" "}
                            {connection.lastUsedAt
                              ? `last used ${new Date(connection.lastUsedAt).toLocaleDateString()}`
                              : "never used"}
                          </small>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              await api(
                                `/api/v1/oauth/connections/${connection.clientId}`,
                                { method: "DELETE" },
                              );
                              await load();
                            } catch {
                              setMessage(
                                "That AI connection could not be revoked. Try again.",
                              );
                            }
                          }}
                        >
                          Revoke
                        </button>
                      </article>
                    ))}
                    {!connections.length && (
                      <p>No OAuth applications connected yet.</p>
                    )}
                  </div>
                  {message && !token && (
                    <p className="action-feedback" role="status">
                      {message}
                    </p>
                  )}
                </section>
              )}
              {showTopic("data") && (
                <section className="settings-card settings-export-card">
                  <h2>Export library</h2>
                  <p className="settings-help">
                    Create a portable backup containing all of your capture
                    metadata, transcripts, comments, Markdown notes, images,
                    audio, and videos. Account credentials and server
                    configuration are excluded.
                  </p>
                  <button
                    disabled={libraryExports.some(
                      (item) => item.status === "pending",
                    )}
                    onClick={async () => {
                      setBackupMessage("Preparing your backup…");
                      try {
                        await api("/api/v1/library-exports", {
                          method: "POST",
                        });
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
                  {backupMessage && (
                    <p className="action-feedback">{backupMessage}</p>
                  )}
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
                            Created {new Date(item.createdAt).toLocaleString()}{" "}
                            · expires{" "}
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
                    Backups contain private content and are available for 24
                    hours. Store downloaded archives somewhere secure.
                  </p>
                </section>
              )}
              {showTopic("data") && (
                <section className="settings-card settings-language-card">
                  <h2>Language</h2>
                  <p className="settings-help">
                    New captures use these preferences. Original transcripts are
                    always preserved.
                  </p>
                  <form
                    className="settings-language-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      try {
                        const result = await api<{
                          preferences: {
                            defaultLanguage: string;
                            translateForeign: boolean;
                          };
                        }>("/api/v1/preferences", {
                          method: "PATCH",
                          body: JSON.stringify({
                            defaultLanguage,
                            translateForeign,
                          }),
                        });
                        setDefaultLanguage(result.preferences.defaultLanguage);
                        setTranslateForeign(
                          result.preferences.translateForeign,
                        );
                        setPreferenceMessage("Language preferences saved.");
                      } catch {
                        setPreferenceMessage(
                          "Language preferences could not be saved. Try again.",
                        );
                      }
                    }}
                  >
                    <label>
                      Default language
                      <select
                        value={defaultLanguage}
                        onChange={(event) =>
                          setDefaultLanguage(event.target.value)
                        }
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
                        onChange={(event) =>
                          setTranslateForeign(event.target.checked)
                        }
                      />
                      Translate foreign-language clips into my default language
                    </label>
                    <button>Save language settings</button>
                  </form>
                  {preferenceMessage && (
                    <p className="action-feedback">{preferenceMessage}</p>
                  )}
                </section>
              )}
              {showTopic("api") && (
                <section className="settings-card settings-api-keys-card">
                  <h2>API keys</h2>
                  <p className="settings-help">
                    Each account key can submit captures and read, search, and
                    export your knowledge through the Agent API. It cannot
                    manage your account or settings.
                  </p>
                  <form className="settings-key-form" onSubmit={create}>
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
                  {message && !token && (
                    <p className="action-feedback" role="status">
                      {message}
                    </p>
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
                            try {
                              await api(`/api/v1/api-keys/${key.id}`, {
                                method: "DELETE",
                              });
                              await load();
                              if (createdKeyId === key.id) {
                                setToken("");
                                setCreatedKeyId(null);
                              }
                              setMessage(`${key.name} was revoked.`);
                            } catch {
                              setMessage(
                                `${key.name} could not be revoked. Try again.`,
                              );
                            }
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
                      Replace <code>$SOCIAL_KNOWLEDGE_API_KEY</code> with an
                      account key.
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
              )}
              {showTopic("account") && (
                <>
                  <section className="settings-card settings-account-card">
                    <div className="settings-card-heading">
                      <span className="settings-section-kicker">
                        PROFILE & SECURITY
                      </span>
                      <h2>Account</h2>
                    </div>
                    <p className="settings-help">
                      Your archive, API keys, connections, and exports remain
                      private to your account.
                    </p>
                    <dl className="settings-account-facts">
                      <div>
                        <dt>Workspace</dt>
                        <dd>{user?.username || "Personal workspace"}</dd>
                      </div>
                      <div>
                        <dt>Role</dt>
                        <dd>
                          {user?.role === "admin" ? "Administrator" : "Member"}
                        </dd>
                      </div>
                      {user?.createdAt && (
                        <div>
                          <dt>Member since</dt>
                          <dd>
                            {new Date(user.createdAt).toLocaleDateString()}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </section>
                  {user?.role === "admin" && <AccessManagement />}
                </>
              )}
            </>
          )}
        </div>
      </div>
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
  const [navigation, setNavigation] = useState({ entries: ["home"], index: 0 });
  const [navigationLoading, setNavigationLoading] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const navigationRequest = useRef(0);
  useEffect(() => () => { navigationRequest.current += 1; }, []);
  const [node, setNode] = useState<LibraryNodeDetail | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [selectedCapture, setSelectedCapture] = useState<string | null>(null);
  const [treeQuery, setTreeQuery] = useState("");
  const [mobilePane, setMobilePane] = useState<"browse" | "reading">("browse");
  const [libraryExports, setLibraryExports] = useState<LibraryExport[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  async function loadTree() {
    const result = await api<{
      nodes: LibraryNode[];
      unclassifiedCount: number;
    }>("/api/v1/library/tree");
    setNodes(result.nodes.filter((item) => item.captureCount > 0));
    setUnclassifiedCount(result.unclassifiedCount);
  }
  async function loadExports() {
    const result = await api<{ exports: LibraryExport[] }>(
      "/api/v1/library-exports",
    );
    setLibraryExports(result.exports);
  }
  useEffect(() => {
    void loadTree();
    void loadExports();
  }, []);
  useEffect(() => {
    if (!libraryExports.some((item) => item.status === "pending")) {
      if (exportMessage === "Preparing your archive…") {
        setExportMessage(
          libraryExports[0]?.status === "complete"
            ? "Your archive is ready to download."
            : libraryExports[0]?.status === "failed"
              ? "Archive export could not be completed. You can try again."
              : "",
        );
      }
      return;
    }
    const timer = window.setInterval(() => void loadExports(), 2500);
    return () => window.clearInterval(timer);
  }, [exportMessage, libraryExports]);
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
  async function navigateLibrary(target: string, historyIndex?: number) {
    const request = ++navigationRequest.current;
    setNavigationLoading(true);
    setNavigationError("");
    try {
      let nextNode: LibraryNodeDetail | null = null;
      let nextMarkdown = "";
      let nextCapture: string | null = null;
      if (target === "unclassified") {
        const result = await api<{ captures: Capture[] }>("/api/v1/library/unclassified");
        nextMarkdown = ["# Unclassified", "", "These captures need a confident placement.", "", ...result.captures.map((capture) => `- [${markdownLinkText(capture.title)}](capture:${capture.id})`)].join("\n");
      } else if (target.startsWith("capture:")) {
        nextCapture = target.slice(8);
        const result = await api<{ markdown: string }>(`/api/v1/captures/${nextCapture}/markdown`);
        nextMarkdown = result.markdown;
      } else if (target !== "home") {
        const result = await api<{ node: LibraryNodeDetail; markdown: string }>(`/api/v1/library/nodes/${target}`);
        nextNode = result.node;
        nextMarkdown = result.markdown;
      }
      if (request !== navigationRequest.current) return;
      setSelected(target);
      setNode(nextNode);
      setMarkdown(nextMarkdown);
      setSelectedCapture(nextCapture);
      setMobilePane("reading");
      setNavigation((current) => historyIndex !== undefined
        ? { ...current, index: historyIndex }
        : current.entries[current.index] === target
          ? current
          : { entries: [...current.entries.slice(0, current.index + 1), target], index: current.index + 1 });
    } catch {
      if (request === navigationRequest.current) setNavigationError("This page could not be loaded. Please try again.");
    } finally {
      if (request === navigationRequest.current) setNavigationLoading(false);
    }
  }
  const openNode = (id: string) => navigateLibrary(id);
  const openCapture = (id: string) => navigateLibrary(`capture:${id}`);
  const openUnclassified = () => navigateLibrary("unclassified");
  const children = (parentId: string | null) =>
    nodes.filter((candidate) => candidate.parentId === parentId);
  const nodeMatchesTreeQuery = (item: LibraryNode): boolean => {
    const query = treeQuery.trim().toLocaleLowerCase();
    if (!query) return true;
    if (item.label.toLocaleLowerCase().includes(query)) return true;
    return children(item.id).some(nodeMatchesTreeQuery);
  };
  const branch = (parentId: string | null, depth = 0): ReactNode =>
    children(parentId)
      .filter(nodeMatchesTreeQuery)
      .map((item) => {
        const expandable = children(item.id).length > 0;
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
  const selectedTitle =
    node?.label ??
    (selectedCapture
      ? "Capture note"
      : selected === "unclassified"
        ? "Unclassified"
        : "Home");
  const preparingExport = libraryExports.some(
    (item) => item.status === "pending",
  );
  return (
    <div className="library-page">
      <div className="knowledge-page-heading">
        <div>
          <div className="eyebrow">Knowledge base</div>
          <h1>{selectedTitle}</h1>
          <p>
            {selectedCapture
              ? "Generated Markdown, source context, and the original capture."
              : "Browse generated notes by category. Your saved posts remain the source."}
          </p>
        </div>
        <div className="knowledge-page-actions">
          <a className="knowledge-back-link" href="/">
            ← Back to Inbox
          </a>
          <button
            type="button"
            className="knowledge-export-button"
            onClick={() => setExportDialogOpen(true)}
          >
            Export archive
          </button>
        </div>
      </div>
      <div
        className="library-mobile-switch"
        role="tablist"
        aria-label="Knowledge base view"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === "browse"}
          onClick={() => setMobilePane("browse")}
        >
          Browse tree
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === "reading"}
          onClick={() => setMobilePane("reading")}
        >
          Reading pane
        </button>
      </div>
      <div className={`library-layout mobile-${mobilePane}`}>
        <aside className="library-sidebar" aria-label="Knowledge tree">
          <div className="library-sidebar-header">
            <div>
              <strong>Knowledge base</strong>
              <small>{nodes.length} categories</small>
            </div>
            <div className="library-tree-actions">
            <Button type="button" variant="ghost" className="library-collapse-all"
              disabled={!nodes.some((item) => children(item.id).length > 0 && !expandedNodes.has(item.id))}
              onClick={() => setExpandedNodes(new Set(nodes.filter((item) => children(item.id).length > 0).map((item) => item.id)))}>
              Expand all
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="library-collapse-all"
              disabled={!nodes.some((item) => children(item.id).length > 0 && expandedNodes.has(item.id))}
              onClick={() => setExpandedNodes(new Set())}
            >
              Collapse all
            </Button>
            </div>
          </div>
          <label className="knowledge-tree-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Search categories</span>
            <input
              type="search"
              placeholder="Search categories"
              value={treeQuery}
              onChange={(event) => setTreeQuery(event.target.value)}
            />
            {treeQuery && (
              <button
                type="button"
                aria-label="Clear category search"
                onClick={() => setTreeQuery("")}
              >
                <X aria-hidden="true" />
              </button>
            )}
          </label>
          <ScrollArea className="library-tree">
            <Button
              type="button"
              variant="ghost"
              className={`library-root-row ${selected === "home" ? "selected" : ""}`}
              onClick={() => void navigateLibrary("home")}
            >
              <House aria-hidden="true" />
              <span>Home</span>
              <small className="library-count">
                {nodes
                  .filter((n) => n.parentId === null)
                  .reduce((sum, n) => sum + n.captureCount, 0) + unclassifiedCount}
              </small>
            </Button>
            {branch(null)}
            {unclassifiedCount > 0 && <Button
              type="button"
              variant="ghost"
              className={`library-root-row ${selected === "unclassified" ? "selected" : ""}`}
              onClick={() => void openUnclassified()}
            >
              <FileQuestion aria-hidden="true" />
              <span>Unclassified</span>
              <small className="library-count">{unclassifiedCount}</small>
            </Button>}
          </ScrollArea>
        </aside>
        <section className="markdown-pane" aria-label="Reading pane">
          <div className="library-toolbar library-navigation">
            <nav aria-label="Knowledge base history">
              <button type="button" aria-label="Back in knowledge base" disabled={navigationLoading || navigation.index === 0}
                onClick={() => void navigateLibrary(navigation.entries[navigation.index - 1]!, navigation.index - 1)}><ArrowLeft aria-hidden="true" /> Back</button>
              <button type="button" aria-label="Forward in knowledge base" disabled={navigationLoading || navigation.index === navigation.entries.length - 1}
                onClick={() => void navigateLibrary(navigation.entries[navigation.index + 1]!, navigation.index + 1)}><ArrowRight aria-hidden="true" /> Forward</button>
            </nav>
            {selectedCapture && <button type="button" onClick={() => onOpen(selectedCapture)}>Open capture</button>}
          </div>
          {navigationLoading && <p className="library-navigation-feedback" role="status">Loading page…</p>}
          {navigationError && <p className="library-navigation-feedback" role="alert">{navigationError}</p>}
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
                        onClick={() => void (href === "library:unclassified" ? openUnclassified() : openNode(href.slice(8)))}
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
              {markdownForDisplay(
                selected === "home"
                  ? libraryHomeMarkdown(nodes, unclassifiedCount)
                  : markdown,
              )}
            </ReactMarkdown>
          </article>
        </section>
      </div>
      {exportDialogOpen && (
        <div
          className="knowledge-export-scrim"
          role="presentation"
          onClick={() => setExportDialogOpen(false)}
        >
          <section
            className="knowledge-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-archive-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <div className="eyebrow">Portable backup</div>
              <h2 id="export-archive-title">Download your archive</h2>
              <p>
                Create a complete private copy of your saved knowledge. Account
                credentials and server configuration are excluded.
              </p>
            </div>
            <ul className="knowledge-export-contents">
              <li>Markdown notes and capture metadata</li>
              <li>Transcripts, comments, images, audio, and video</li>
              <li>One secure download link, available for 24 hours</li>
            </ul>
            {exportMessage && (
              <p className="knowledge-export-message" role="status">
                {exportMessage}
              </p>
            )}
            {libraryExports[0]?.status === "complete" && (
              <a
                className="knowledge-export-ready"
                href={`/api/v1/library-exports/${libraryExports[0].id}/download`}
              >
                Download ready archive
              </a>
            )}
            <div className="knowledge-export-actions">
              <button
                type="button"
                className="knowledge-dialog-cancel"
                onClick={() => setExportDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="knowledge-export-button"
                disabled={preparingExport}
                onClick={async () => {
                  setExportMessage("Preparing your archive…");
                  try {
                    await api("/api/v1/library-exports", { method: "POST" });
                    await loadExports();
                  } catch (error) {
                    setExportMessage(
                      error instanceof Error
                        ? error.message
                        : "Archive export could not start.",
                    );
                  }
                }}
              >
                {preparingExport ? "Preparing…" : "Prepare download"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function AskAI({ onOpen }: { onOpen: (id: string) => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [reconciliationNotice, setReconciliationNotice] = useState("");
  const [conversationListOpen, setConversationListOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const selectedConversationIdRef = useRef<string | null>(null);
  const activeAttemptRef = useRef<{
    conversationId: string;
    temporaryId: string;
    optimisticUserId: string | null;
  } | null>(null);
  const partialAnswersRef = useRef(new Map<string, string>());
  const serverAssistantIdsRef = useRef(new Map<string, string>());

  type StreamOutcome = StreamState<AskSource>;

  function updateAssistant(temporaryId: string, patch: Partial<ChatMessage>) {
    setCurrent((existing) =>
      existing
        ? {
            ...existing,
            messages: (existing.messages ?? []).map((message) =>
              message.id === temporaryId ? { ...message, ...patch } : message,
            ),
          }
        : existing,
    );
  }
  async function loadList(openFirst = true) {
    const result = await api<{ conversations: Conversation[] }>(
      "/api/v1/conversations",
    );
    setConversations(result.conversations);
    if (
      openFirst &&
      !selectedConversationIdRef.current &&
      result.conversations[0]
    )
      await openConversation(result.conversations[0].id);
  }
  async function fetchConversation(id: string) {
    const result = await api<{ conversation: Conversation }>(
      `/api/v1/conversations/${id}`,
    );
    return result.conversation;
  }
  async function openConversation(id: string) {
    selectedConversationIdRef.current = id;
    const conversation = await fetchConversation(id);
    if (selectedConversationIdRef.current !== id) return;
    const active = activeAttemptRef.current;
    const activeForConversation = active?.conversationId === id ? active : null;
    const activeAssistantId = activeForConversation
      ? (serverAssistantIdsRef.current.get(activeForConversation.temporaryId) ??
        conversation.messages?.find(
          (message) =>
            message.role === "assistant" && message.status === "pending",
        )?.id)
      : undefined;
    if (activeForConversation && activeAssistantId)
      serverAssistantIdsRef.current.set(
        activeForConversation.temporaryId,
        activeAssistantId,
      );
    setCurrent((existing) =>
      mergeConversationSnapshot(
        existing?.id === id ? existing : null,
        conversation,
        activeForConversation
          ? {
              assistantId: activeAssistantId,
              partialText: partialAnswersRef.current.get(
                activeForConversation.temporaryId,
              ),
              optimisticMessageIds: [
                activeForConversation.temporaryId,
                ...(activeForConversation.optimisticUserId
                  ? [activeForConversation.optimisticUserId]
                  : []),
              ],
            }
          : {},
      ),
    );
  }
  async function createConversation() {
    const result = await api<{ conversation: Conversation }>(
      "/api/v1/conversations",
      { method: "POST", body: JSON.stringify({}) },
    );
    selectedConversationIdRef.current = result.conversation.id;
    setCurrent(result.conversation);
    const list = await api<{ conversations: Conversation[] }>(
      "/api/v1/conversations",
    );
    setConversations(list.conversations);
  }
  useEffect(() => {
    void loadList();
  }, []);

  function applyConversationSnapshot(
    snapshot: Conversation,
    options: {
      assistantId?: string;
      partialText?: string;
      optimisticMessageIds?: string[];
    },
  ) {
    setCurrent((existing) =>
      existing?.id === snapshot.id &&
      selectedConversationIdRef.current === snapshot.id
        ? mergeConversationSnapshot(existing, snapshot, options)
        : existing,
    );
  }

  async function reconcileAttempt(
    conversationId: string,
    outcome: StreamOutcome,
    optimisticMessageIds: string[],
  ) {
    const assistantId = outcome.assistantId;
    const isSelected = () =>
      selectedConversationIdRef.current === conversationId;
    const result = await reconcileConversationAttempt(
      assistantId,
      () => fetchConversation(conversationId),
      {
        sleep: (milliseconds) =>
          new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
        onSnapshot: (snapshot) => {
          const assistant = assistantId
            ? snapshot.messages?.find((message) => message.id === assistantId)
            : undefined;
          if (assistant?.status === "complete" && isSelected()) setError("");
          applyConversationSnapshot(snapshot, {
            assistantId,
            partialText: outcome.text,
            optimisticMessageIds,
          });
        },
        onStillPending: () => {
          if (isSelected()) setReconciliationNotice("Still stopping…");
        },
      },
    );
    if (result === "timeout" && isSelected())
      setError("The answer is still stopping. Refresh before retrying.");
  }

  async function consumeStream(
    response: Response,
    temporaryId: string,
  ): Promise<StreamOutcome> {
    if (!response.ok || !response.body) {
      const problem = (await response.json().catch(() => ({}))) as {
        error?: string;
        assistantId?: string;
      };
      throw Object.assign(
        new Error(
          problem.error === "conversation_busy"
            ? "This conversation is already answering in another tab."
            : problem.error === "ai_provider_required" ||
                problem.error === "analysis_provider_required"
              ? "Choose a connected analysis provider in Settings before using Ask AI."
              : problem.error === "invalid_message"
                ? "Enter a question between 1 and 2,000 characters."
                : problem.error === "invalid_request_id"
                  ? "The request identifier was invalid. Please try again."
                  : "Ask AI could not start the answer.",
        ),
        problem.assistantId ? { assistantId: problem.assistantId } : {},
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseDecoder();
    let state = initialStreamState<AskSource>();
    let renderedId = temporaryId;

    const setRenderedId = (serverAssistantId: string) => {
      if (serverAssistantId === renderedId) return;
      const previousId = renderedId;
      renderedId = serverAssistantId;
      serverAssistantIdsRef.current.set(temporaryId, serverAssistantId);
      setCurrent((existing) =>
        existing
          ? {
              ...existing,
              messages: (existing.messages ?? []).map((message) =>
                message.id === previousId
                  ? { ...message, id: serverAssistantId }
                  : message,
              ),
            }
          : existing,
      );
    };
    const applyState = (next: StreamOutcome) => {
      state = next;
      if (state.assistantId) setRenderedId(state.assistantId);
      partialAnswersRef.current.set(temporaryId, state.text);
      updateAssistant(renderedId, {
        content: state.text,
        sources: state.sources,
        sufficient: state.sufficient,
        statusText: state.statusText,
        ...(state.status === "pending" ? {} : { status: state.status }),
        errorCode: state.errorCode,
      });
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        const chunk = decoder.decode(value ?? new Uint8Array(), {
          stream: !done,
        });
        for (const event of parser.push(chunk, done))
          applyState(applyStreamEvent(state, event));
        if (done) break;
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    }
    applyState(finishStream(state));
    return state;
  }
  async function runRequest(
    url: string,
    body: object,
    conversationId: string,
    temporaryId: string,
    optimisticUserId: string | null,
  ) {
    const controller = new AbortController();
    abortRef.current = controller;
    activeAttemptRef.current = {
      conversationId,
      temporaryId,
      optimisticUserId,
    };
    setStreaming(true);
    setError("");
    setReconciliationNotice("");
    let outcome: StreamOutcome | null = null;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      outcome = await consumeStream(response, temporaryId);
      if (
        outcome.status === "failed" &&
        outcome.errorMessage &&
        selectedConversationIdRef.current === conversationId
      )
        setError(outcome.errorMessage);
    } catch (cause) {
      const aborted =
        (cause instanceof DOMException && cause.name === "AbortError") ||
        (cause instanceof Error && cause.name === "AbortError");
      if (!aborted) controller.abort();
      const answer = partialAnswersRef.current.get(temporaryId) ?? "";
      const responseAssistantId =
        cause instanceof Error &&
        "assistantId" in cause &&
        typeof cause.assistantId === "string"
          ? cause.assistantId
          : undefined;
      const assistantId =
        serverAssistantIdsRef.current.get(temporaryId) ?? responseAssistantId;
      outcome = {
        ...initialStreamState<AskSource>(),
        assistantId,
        text: answer,
        status: aborted ? "cancelled" : "failed",
        errorCode: aborted ? "cancelled" : "provider_error",
        errorMessage: aborted
          ? "Answer stopped."
          : cause instanceof Error
            ? cause.message
            : "Ask AI failed.",
      };
      updateAssistant(assistantId ?? temporaryId, {
        content: answer,
        status: outcome.status,
        errorCode: outcome.errorCode,
      });
      if (!aborted && selectedConversationIdRef.current === conversationId)
        setError(cause instanceof Error ? cause.message : "Ask AI failed.");
    } finally {
      abortRef.current = null;
      try {
        if (outcome) {
          await reconcileAttempt(conversationId, outcome, [
            temporaryId,
            ...(optimisticUserId ? [optimisticUserId] : []),
          ]);
        }
        await loadList(false).catch(() => undefined);
      } finally {
        partialAnswersRef.current.delete(temporaryId);
        serverAssistantIdsRef.current.delete(temporaryId);
        if (activeAttemptRef.current?.temporaryId === temporaryId)
          activeAttemptRef.current = null;
        setReconciliationNotice("");
        setStreaming(false);
      }
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
      selectedConversationIdRef.current = conversation.id;
      setCurrent(conversation);
    }
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleaned,
      sources: [],
      sufficient: null,
      status: "complete",
      statusText: null,
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
      statusText: null,
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
      userMessage.id,
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
      statusText: null,
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
      null,
    );
  }
  const suggestions = [
    "What Lisbon restaurants have I saved?",
    "Summarize my saved Portugal recommendations.",
    "Which products have creators recommended?",
  ];
  return (
    <div className="ask-page-wrap">
      <div className="ask-page-intro">
        <div>
          <div className="eyebrow">Your saved archive</div>
          <h1>Ask</h1>
          <p>Answers from your saved posts, with sources.</p>
        </div>
      </div>
      <div className="ask-page">
        <aside
          className={`conversation-sidebar ${conversationListOpen ? "open" : ""}`}
          aria-label="Ask conversations"
        >
          <div className="conversation-sidebar-heading">
            <strong>Conversations</strong>
            <button
              type="button"
              className="conversation-list-toggle"
              aria-expanded={conversationListOpen}
              aria-controls="ask-conversation-list"
              onClick={() => setConversationListOpen((open) => !open)}
            >
              {conversationListOpen ? "Hide" : "Browse"}
            </button>
          </div>
          <button
            className="new-chat"
            onClick={() => void createConversation()}
          >
            ＋ New conversation
          </button>
          <div id="ask-conversation-list" className="conversation-list">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={current?.id === conversation.id ? "selected" : ""}
                onClick={() => {
                  setConversationListOpen(false);
                  void openConversation(conversation.id);
                }}
              >
                <span>{conversation.title}</span>
                <small>{conversation.messageCount ?? 0} messages</small>
              </button>
            ))}
          </div>
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
                disabled={streaming}
                onClick={async () => {
                  if (!window.confirm("Delete this conversation?")) return;
                  await api(`/api/v1/conversations/${current.id}`, {
                    method: "DELETE",
                  });
                  setCurrent(null);
                  selectedConversationIdRef.current = null;
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
                          /^(capture:|https?:|mailto:)/i.test(url) ? url : ""
                        }
                        components={{
                          a: ({ href, children }) => {
                            if (href?.startsWith("capture:")) {
                              const source = message.sources.find(
                                ({ id }) => id === href.slice(8),
                              );
                              if (source)
                                return (
                                  <button
                                    type="button"
                                    className={`inline-capture-link platform-${source.platform.toLowerCase()}`}
                                    aria-label={`Open ${source.platform} reel: ${source.title}`}
                                    title={`Open ${source.title}`}
                                    onClick={() => onOpen(source.id)}
                                  >
                                    <PlatformMark platform={source.platform} />
                                    <span>{children}</span>
                                  </button>
                                );
                            }
                            return (
                              <a href={href} target="_blank" rel="noreferrer">
                                {children}
                              </a>
                            );
                          },
                        }}
                      >
                        {answerWithCaptureLinks(
                          message.content,
                          message.sources,
                        )}
                      </ReactMarkdown>
                    ) : (
                      message.content
                    )
                  ) : message.status === "pending" ? (
                    <span className="typing">
                      {message.statusText || "Searching your archive…"}
                    </span>
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
                {message.role === "assistant" &&
                  message.sufficient === false && (
                    <small className="insufficient">
                      The saved archive did not contain enough evidence.
                    </small>
                  )}
                {message.sources?.length > 0 && (
                  <div className="answer-sources">
                    <strong>Sources</strong>
                    {message.sources.map((source) => (
                      <button
                        key={source.id}
                        aria-label={`Open ${source.platform} reel: ${source.title}`}
                        onClick={() => onOpen(source.id)}
                      >
                        <span
                          className={`source-number platform-${source.platform.toLowerCase()}`}
                        >
                          <PlatformMark platform={source.platform} />
                          <span>{source.citation}</span>
                        </span>
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
          {reconciliationNotice && (
            <p className="chat-error" role="status">
              {reconciliationNotice}
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
    </div>
  );
}

function App() {
  const [authState, setAuthState] = useState<
    "loading" | "setup" | "login" | "onboarding" | "ready"
  >("loading");
  const [user, setUser] = useState<AccountUser | null>(null);
  const [inviteToken] = useState(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("invite");
    if (token)
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    return token;
  });
  const [tab, setTab] = useState<AppTab>(tabFromLocation);
  const highlightedJob = new URLSearchParams(window.location.search).get("job");
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [activityJobs, setActivityJobs] = useState<ActivityJob[]>([]);
  const [activityNextCursor, setActivityNextCursor] = useState<string | null>(
    null,
  );
  const [activityCounts, setActivityCounts] = useState<ActivityCounts>({
    active: 0,
    queued: 0,
    failed: 0,
    savedToday: 0,
    recentEvents: 0,
  });
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const activityRequest = useRef(0);
  const [failedJobs, setFailedJobs] = useState<ActivityJob[]>([]);
  const [failedNextCursor, setFailedNextCursor] = useState<string | null>(null);
  const [failedTotal, setFailedTotal] = useState(0);
  const [failedError, setFailedError] = useState(false);
  const [failedLoadingMore, setFailedLoadingMore] = useState(false);
  const failedRequest = useRef(0);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [platform, setPlatform] = useState("");
  const [category, setCategory] = useState("");
  const [topic, setTopic] = useState("");
  const [inboxView, setInboxView] = useState<InboxView>(() => {
    try {
      return window.localStorage.getItem("social-knowledge:inbox-view") ===
        "table"
        ? "table"
        : "tiles";
    } catch {
      return "tiles";
    }
  });
  const [sort, setSort] = useState<InboxSortKey>("savedAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);
  const [facets, setFacets] = useState<CaptureFacets>({
    categories: [],
    topics: [],
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const inboxRequest = useRef(0);
  const liveRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inboxFilters = useRef({
    search: "",
    platform: "",
    category: "",
    topic: "",
  });
  const inboxPresentation = useRef<{
    sort: InboxSortKey;
    direction: "asc" | "desc";
  }>({ sort: "savedAt", direction: "desc" });
  const [detail, setDetail] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [captureUrl, setCaptureUrl] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [captureError, setCaptureError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [captureSubmitted, setCaptureSubmitted] = useState(false);
  const [activityFilter, setActivityFilter] = useState<"active" | "all">("active");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<ActivityDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const detailsRequest = useRef(0);
  const lastNewestActive = useRef<string | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const [retryingIds, setRetryingIds] = useState<string[]>([]);
  const [copyFeedback, setCopyFeedback] = useState("");
  async function check() {
    try {
      const result = await api<{ user: AccountUser }>("/api/auth/me");
      setUser(result.user);
      setAuthState("ready");
    } catch (e) {
      setUser(null);
      const err = e as { body?: { setupRequired?: boolean } };
      setAuthState(err.body?.setupRequired ? "setup" : "login");
    }
  }
  async function loadInboxPage(append = false) {
    const requestId = ++inboxRequest.current;
    const cursor = append ? nextCursor : null;
    if (append && !cursor) return;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoadingInbox(true);
      setLoadingMore(false);
      setCaptures([]);
      setNextCursor(null);
      setInboxError(null);
    }
    const query = new URLSearchParams({ limit: "48" });
    const filters = inboxFilters.current;
    if (filters.search) query.set("search", filters.search);
    if (filters.platform) query.set("platform", filters.platform);
    if (filters.category) query.set("nodeId", filters.category);
    if (filters.topic) query.set("topic", filters.topic);
    query.set("sort", inboxPresentation.current.sort);
    query.set("direction", inboxPresentation.current.direction);
    if (cursor) query.set("cursor", cursor);
    try {
      const page = await api<{
        captures: Capture[];
        nextCursor: string | null;
      }>(`/api/v1/captures?${query}`);
      if (requestId !== inboxRequest.current) return;
      setCaptures((current) => {
        if (!append) return page.captures;
        const existing = new Set(current.map((capture) => capture.id));
        return [
          ...current,
          ...page.captures.filter((capture) => !existing.has(capture.id)),
        ];
      });
      setNextCursor(page.nextCursor);
      setInboxError(null);
    } catch (error) {
      if (requestId === inboxRequest.current)
        setInboxError(
          append
            ? "Unable to load more captures. Try again."
            : "Unable to load captures. Try again.",
        );
    } finally {
      if (requestId === inboxRequest.current) {
        if (append) setLoadingMore(false);
        else setLoadingInbox(false);
      }
    }
  }
  async function loadActivityPage(
    filter: "active" | "all" = activityFilter,
    append = false,
  ) {
    const requestId = ++activityRequest.current;
    const cursor = append ? activityNextCursor : null;
    if (append && !cursor) return;
    if (append) setActivityLoadingMore(true);
    else {
      setActivityLoading(true);
      setActivityError(null);
      setActivityNextCursor(null);
    }
    const query = new URLSearchParams({
      limit: "100",
      filter,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (cursor) query.set("cursor", cursor);
    try {
      const page = await api<ActivityPage>(`/api/v1/jobs?${query}`);
      if (requestId !== activityRequest.current) return;
      const jobs = page.jobs.filter((job) =>
        filter === "active"
          ? job.status !== "failed" && job.status !== "complete"
          : true,
      );
      setActivityJobs((current) => {
        if (!append) return jobs;
        const seen = new Set(current.map((job) => job.id));
        return [...current, ...jobs.filter((job) => !seen.has(job.id))];
      });
      setActivityNextCursor(page.nextCursor);
      setActivityCounts(page.counts);
    } catch {
      if (requestId === activityRequest.current)
        setActivityError("Unable to load capture activity. Try again.");
    } finally {
      if (requestId === activityRequest.current) {
        if (append) setActivityLoadingMore(false);
        else setActivityLoading(false);
      }
    }
  }
  async function loadFailedJobs(append = false) {
    const requestId = ++failedRequest.current;
    const cursor = append ? failedNextCursor : null;
    if (append && !cursor) return;
    if (append) setFailedLoadingMore(true);
    else setFailedNextCursor(null);
    const query = new URLSearchParams({ limit: "50" });
    if (cursor) query.set("cursor", cursor);
    try {
      const page = await api<FailedActivityPage>(
        `/api/v1/jobs/failed?${query}`,
      );
      if (requestId !== failedRequest.current) return;
      setFailedJobs((current) => {
        if (!append) return page.failures;
        const seen = new Set(current.map((job) => job.id));
        return [...current, ...page.failures.filter((job) => !seen.has(job.id))];
      });
      setFailedNextCursor(page.nextCursor);
      setFailedTotal(page.total);
      setFailedError(false);
    } catch {
      if (requestId === failedRequest.current && !append) {
        setFailedJobs([]);
        setFailedError(true);
      }
    } finally {
      if (requestId === failedRequest.current && append)
        setFailedLoadingMore(false);
    }
  }
  async function loadSupportingData() {
    const facets = await api<CaptureFacets>("/api/v1/capture-facets");
    setFacets(facets);
  }
  async function load() {
    await Promise.all([
      loadInboxPage(),
      loadSupportingData(),
      loadActivityPage(),
      loadFailedJobs(),
    ]);
  }
  function scheduleLiveRefresh() {
    if (liveRefreshTimer.current) return;
    liveRefreshTimer.current = setTimeout(() => {
      liveRefreshTimer.current = null;
      void load();
    }, 250);
  }
  useEffect(() => {
    void check();
  }, []);
  useEffect(() => {
    if (authState !== "ready") return;
    inboxFilters.current = {
      search: deferredSearch,
      platform,
      category,
      topic,
    };
    inboxPresentation.current = { sort, direction };
    void loadInboxPage();
  }, [authState, deferredSearch, platform, category, topic, sort, direction]);
  useEffect(() => {
    try {
      window.localStorage.setItem("social-knowledge:inbox-view", inboxView);
    } catch {
      // Keep this preference optional when storage is unavailable.
    }
  }, [inboxView]);
  useEffect(() => {
    if (authState !== "ready") return;
    void loadSupportingData();
    const stream = new EventSource("/api/v1/events");
    stream.onmessage = () => scheduleLiveRefresh();
    return () => {
      stream.close();
      if (liveRefreshTimer.current) {
        clearTimeout(liveRefreshTimer.current);
        liveRefreshTimer.current = null;
      }
    };
  }, [authState]);
  useEffect(() => {
    if (authState !== "ready") return;
    void loadActivityPage(activityFilter);
  }, [authState, activityFilter]);
  useEffect(() => {
    if (authState !== "ready") return;
    void loadFailedJobs();
  }, [authState]);
  const hasInboxFilters = Boolean(search || platform || category || topic);
  const activeCategory =
    facets.categories.find((facet) => facet.id === category)?.label ?? null;
  const selectedSort = inboxSortOptions.find((option) => option.key === sort)!;
  const sortValue = `${sort}:${direction}`;
  const applySort = (nextSort: InboxSortKey) => {
    if (nextSort === sort) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(nextSort);
    setDirection(nextSort === "savedAt" ? "desc" : "asc");
  };
  const activeJobCount = activityCounts.active;
  const visibleActivityJobs = useMemo(
    () =>
      [...activityJobs].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      ),
    [activityJobs],
  );
  const inProgressJobs = visibleActivityJobs.filter(
    (job) =>
      job.status !== "queued" &&
      job.status !== "failed" &&
      job.status !== "complete",
  );
  const queuedJobs = visibleActivityJobs.filter(
    (job) => job.status === "queued",
  );
  const newestActiveId = inProgressJobs[0]?.id ?? queuedJobs[0]?.id ?? null;
  const attentionTotal = Math.max(activityCounts.failed, failedTotal);
  useEffect(() => {
    if (activityFilter !== "active") return;
    if (newestActiveId && newestActiveId !== lastNewestActive.current) {
      setExpandedJobId(newestActiveId);
    }
    lastNewestActive.current = newestActiveId;
  }, [activityFilter, newestActiveId]);
  useEffect(() => {
    if (!expandedJobId || tab !== "activity") return;
    const requestId = ++detailsRequest.current;
    setDetailsLoading(true);
    setDetailsError(false);
    void api<ActivityDetails>(`/api/v1/jobs/${expandedJobId}`)
      .then((details) => {
        if (requestId === detailsRequest.current) setJobDetails(details);
      })
      .catch(() => {
        if (requestId === detailsRequest.current) setDetailsError(true);
      })
      .finally(() => {
        if (requestId === detailsRequest.current) setDetailsLoading(false);
      });
    return () => {
      detailsRequest.current += 1;
    };
  }, [expandedJobId, tab, activityJobs.find((job) => job.id === expandedJobId)?.updatedAt]);
  async function retryJob(job: ActivityJob) {
    if (retryPending || retryingIds.includes(job.id)) return;
    setRetryingIds((current) => [...current, job.id]);
    try {
      setMessage("Retrying capture…");
      await api(`/api/v1/jobs/${job.id}/retry`, { method: "POST" });
      setMessage("Capture re-queued successfully.");
      await load();
    } catch {
      setMessage("Retry failed. Check the capture setup and try again.");
    } finally {
      setRetryingIds((current) => current.filter((id) => id !== job.id));
    }
  }
  async function retryAll() {
    if (retryPending || attentionTotal === 0) return;
    setRetryPending(true);
    setMessage("Retrying failed captures…");
    try {
      const result = await api<{ requested: number; retried: number }>(
        "/api/v1/jobs/retry-failed",
        { method: "POST" },
      );
      setMessage(`${result.retried} captures re-queued.`);
      await load();
    } catch {
      setMessage("Retry all failed. Check the capture setup and try again.");
    } finally {
      setRetryPending(false);
    }
  }
  async function copyActivityLogs(events: ActivityEvent[]) {
    const safeEvents = events
      .map(safeActivityEvent)
      .filter((event): event is NonNullable<typeof event> => event !== null);
    const text = safeEvents
      .map((event) =>
        [
          formatEventTime(event.createdAt),
          event.label,
          event.attempt ? `Attempt ${event.attempt}` : null,
          event.message,
          formatEventDuration(event),
        ]
          .filter(Boolean)
          .join(" · "),
      )
      .join("\n");
    if (!text) {
      setCopyFeedback("No safe logs available to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Safe logs copied.");
    } catch {
      setCopyFeedback("Couldn’t copy logs. Select and copy them manually.");
    }
  }
  const profileInitial = user?.username.slice(0, 1).toUpperCase() || "S";
  const navigateTo = (
    nextTab: AppTab,
    historyMode: "push" | "replace" = "push",
  ) => {
    if (nextTab === "capture") {
      setMessage("");
      setCaptureError(false);
      setCaptureSubmitted(false);
    }
    setTab(nextTab);
    setMobileMenuOpen(false);
    const nextUrl = new URL(window.location.href);
    if (nextTab === "inbox") nextUrl.searchParams.delete("tab");
    else nextUrl.searchParams.set("tab", nextTab);
    const path = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    if (
      path !==
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    ) {
      window.history[historyMode === "replace" ? "replaceState" : "pushState"](
        window.history.state,
        "",
        path,
      );
    }
  };
  useEffect(() => {
    const restore = () => {
      const nextTab = tabFromLocation();
      if (nextTab === "capture") {
        setCaptureSubmitted(false);
        setMessage("");
      }
      setTab(nextTab);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (tab !== "capture") return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") navigateTo("inbox", "replace");
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [tab]);
  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    setAuthState("login");
  };
  if (authState === "loading")
    return (
      <main className="auth">
        <p>Loading…</p>
      </main>
    );
  if (authState === "onboarding")
    return <ProviderOnboarding onDone={() => void check()} />;
  if (authState !== "ready")
    return (
      <Auth
        setup={authState === "setup"}
        inviteToken={inviteToken}
        onDone={(created) => {
          if (created) {
            setAuthState("onboarding");
            return;
          }
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
    setCaptureError(false);
    setMessage("Submitting…");
    try {
      const result = await api<{
        created: boolean;
        retried?: boolean;
        job: ActivityJob;
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
      setCaptureSubmitted(true);
      await load();
    } catch (e) {
      const errorCode = (e as { body?: { error?: string } }).body?.error;
      const providerRequired = [
        "ai_provider_required",
        "analysis_provider_required",
        "transcription_required",
      ].includes(errorCode ?? "");
      setCaptureError(true);
      setMessage(
        errorCode === "transcription_required"
          ? "Choose a connected OpenAI transcription model in Settings before capturing."
          : errorCode === "analysis_provider_required"
            ? "Choose a connected analysis provider in Settings before capturing."
            : providerRequired
              ? "Finish AI processing setup before capturing."
              : errorCode === "invalid_url" || errorCode === "invalid_request"
                ? "Enter a valid Facebook or Instagram post URL."
                : e instanceof Error
                  ? e.message
                  : "Submission failed",
      );
      if (providerRequired) navigateTo("settings", "replace");
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <span className="app-wordmark">social knowledge</span>
          <span className="app-workspace-label">Private archive</span>
        </div>
        <AppNavigation
          tab={tab}
          activeCount={activeJobCount}
          onNavigate={navigateTo}
        />
        <div className="app-profile">
          <button
            type="button"
            className="app-account-trigger"
            aria-label="Open account menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="app-avatar" aria-hidden="true">{profileInitial}</span>
            <span className="app-profile-copy">
              <strong>{user?.username || "Personal archive"}</strong>
              <small>Personal workspace</small>
            </span>
            <ChevronDown aria-hidden="true" />
          </button>
          <button
            type="button"
            className="app-profile-settings"
            aria-label="Open Settings"
            onClick={() => navigateTo("settings")}
          >
            <SettingsIcon aria-hidden="true" />
          </button>
        </div>
      </aside>
      <section className="app-workspace">
        <header className="app-topbar">
          <button
            type="button"
            className="app-menu-trigger"
            aria-label="Open account menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="app-avatar" aria-hidden="true">{profileInitial}</span>
            <ChevronRight aria-hidden="true" />
          </button>
          <span className="app-mobile-wordmark">social knowledge</span>
          {(tab === "inbox" || tab === "capture") && <button
            type="button"
            className="app-capture"
            aria-label="Capture a post"
            onClick={() => navigateTo("capture")}
          >
            <Plus aria-hidden="true" />
            <span>Capture link</span>
          </button>}
        </header>
        <main className="shell">
          {(tab === "inbox" || tab === "capture") && (
            <section className="inbox-page" aria-labelledby="inbox-title">
              <div className="inbox-hero">
                <div className="eyebrow">Your archive</div>
                <h1 id="inbox-title">Inbox</h1>
                <p>The posts you chose to keep, ready when you need them.</p>
                <button
                  type="button"
                  className="inbox-mobile-capture"
                  aria-label="Capture a post"
                  onClick={() => navigateTo("capture")}
                >
                  <Plus aria-hidden="true" /> Capture
                </button>
              </div>
              <section
                className="inbox-collection"
                aria-labelledby="captures-heading"
              >
                <header className="inbox-collection-heading">
                  <div>
                    <h2 id="captures-heading">Captures</h2>
                  </div>
                </header>
                <div className="inbox-filter-panel">
                  <div className="inbox-toolbar">
                    <label className="filter-search">
                      <Search aria-hidden="true" />
                      <span className="sr-only">Search your archive</span>
                      <input
                        placeholder="Search titles, notes, or creators"
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
                    <div className="inbox-toolbar-actions">
                      <button
                        type="button"
                        className="inbox-filter-trigger"
                        aria-expanded={filterBuilderOpen}
                        aria-controls="inbox-filter-builder"
                        onClick={() => setFilterBuilderOpen(true)}
                      >
                        + Add filter
                      </button>
                      <label className="inbox-sort-control">
                        <span className="sr-only">Sort captures</span>
                        <select
                          aria-label="Sort captures"
                          value={sortValue}
                          onChange={(event) => {
                            const [nextSort, nextDirection] =
                              event.target.value.split(":") as [
                                InboxSortKey,
                                "asc" | "desc",
                              ];
                            setSort(nextSort);
                            setDirection(nextDirection);
                          }}
                        >
                          {inboxSortOptions.flatMap((option) => [
                            <option
                              key={`${option.key}:desc`}
                              value={`${option.key}:desc`}
                            >
                              {option.descending}
                            </option>,
                            <option
                              key={`${option.key}:asc`}
                              value={`${option.key}:asc`}
                            >
                              {option.ascending}
                            </option>,
                          ])}
                        </select>
                      </label>
                      <div
                        className="inbox-view-toggle"
                        role="group"
                        aria-label="Capture view"
                      >
                        <button
                          type="button"
                          className={inboxView === "tiles" ? "active" : ""}
                          aria-pressed={inboxView === "tiles"}
                          onClick={() => setInboxView("tiles")}
                        >
                          <span aria-hidden="true">▦</span>
                          <span>Tiles</span>
                        </button>
                        <button
                          type="button"
                          className={inboxView === "table" ? "active" : ""}
                          aria-pressed={inboxView === "table"}
                          onClick={() => setInboxView("table")}
                        >
                          <span aria-hidden="true">☷</span>
                          <span>Table</span>
                        </button>
                      </div>
                    </div>
                    {filterBuilderOpen && (
                      <div
                        className="inbox-filter-scrim"
                        onMouseDown={(event) => {
                          if (event.target === event.currentTarget)
                            setFilterBuilderOpen(false);
                        }}
                      >
                        <section
                          className="inbox-filter-builder"
                          id="inbox-filter-builder"
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby="inbox-filter-heading"
                        >
                          <header>
                            <div>
                              <span className="eyebrow">Filter captures</span>
                              <h3 id="inbox-filter-heading">Add filter</h3>
                            </div>
                            <button
                              type="button"
                              aria-label="Close filters"
                              onClick={() => setFilterBuilderOpen(false)}
                            >
                              <X aria-hidden="true" />
                            </button>
                          </header>
                          <div className="inbox-filter-fields">
                            <label>
                              <span>Platform</span>
                              <select
                                value={platform}
                                onChange={(event) =>
                                  setPlatform(event.target.value)
                                }
                              >
                                <option value="">Any platform</option>
                                <option value="facebook">Facebook</option>
                                <option value="instagram">Instagram</option>
                              </select>
                            </label>
                            <label>
                              <span>Category</span>
                              <select
                                value={category}
                                onChange={(event) =>
                                  setCategory(event.target.value)
                                }
                              >
                                <option value="">Any category</option>
                                {facets.categories.map((facet) => (
                                  <option value={facet.id} key={facet.id}>
                                    {facet.label} ({facet.count})
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Topic</span>
                              <select
                                value={topic}
                                onChange={(event) =>
                                  setTopic(event.target.value)
                                }
                              >
                                <option value="">Any topic</option>
                                {facets.topics.map((facet) => (
                                  <option value={facet.label} key={facet.label}>
                                    {facet.label} ({facet.count})
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          {hasInboxFilters && (
                            <button
                              type="button"
                              className="inbox-clear-builder"
                              onClick={() => {
                                setSearch("");
                                setPlatform("");
                                setCategory("");
                                setTopic("");
                              }}
                            >
                              Clear filters
                            </button>
                          )}
                        </section>
                      </div>
                    )}
                  </div>
                </div>
                {hasInboxFilters && (
                  <div
                    className="inbox-active-filters"
                    aria-label="Active filters"
                  >
                    {platform && (
                      <button type="button" onClick={() => setPlatform("")}>
                        Platform: {platform.slice(0, 1).toUpperCase()}
                        {platform.slice(1)} <X aria-hidden="true" />
                      </button>
                    )}
                    {activeCategory && (
                      <button type="button" onClick={() => setCategory("")}>
                        Category: {activeCategory} <X aria-hidden="true" />
                      </button>
                    )}
                    {topic && (
                      <button type="button" onClick={() => setTopic("")}>
                        Topic: {topic} <X aria-hidden="true" />
                      </button>
                    )}
                    {search && (
                      <button type="button" onClick={() => setSearch("")}>
                        Search: {search} <X aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="inbox-clear-all"
                      onClick={() => {
                        setSearch("");
                        setPlatform("");
                        setCategory("");
                        setTopic("");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
                {!loadingInbox && !inboxError && (
                  <p className="capture-count-context" aria-live="polite">
                    {captures.length.toLocaleString()} capture
                    {captures.length === 1 ? "" : "s"} loaded ·{" "}
                    {selectedSort.label}{" "}
                    {direction === "asc" ? "ascending" : "descending"}
                  </p>
                )}
                {loadingInbox ? (
                  <InboxLoadingCards />
                ) : captures.length > 0 ? (
                  inboxView === "tiles" ? (
                    <div className="inbox-tile-grid">
                      {captures.map((capture) => (
                        <CaptureCard
                          capture={capture}
                          categoryLabel={capture.categoryLabel ?? null}
                          onOpen={setDetail}
                          key={capture.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="inbox-table-wrap">
                        <table className="inbox-capture-table">
                          <caption className="sr-only">
                            Captures sorted by{" "}
                            {selectedSort.label.toLowerCase()}. Select a title
                            to open its details.
                          </caption>
                          <thead>
                            <tr>
                              {inboxSortOptions.map((option) => (
                                <th scope="col" key={option.key}>
                                  <button
                                    type="button"
                                    className={
                                      sort === option.key ? "active" : ""
                                    }
                                    onClick={() => applySort(option.key)}
                                  >
                                    {option.label}
                                    <span aria-hidden="true">
                                      {sort === option.key
                                        ? direction === "asc"
                                          ? "↑"
                                          : "↓"
                                        : "↕"}
                                    </span>
                                  </button>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {captures.map((capture) => (
                              <CaptureTableRow
                                capture={capture}
                                categoryLabel={capture.categoryLabel ?? null}
                                onOpen={setDetail}
                                key={capture.id}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div
                        className="inbox-mobile-rows"
                        aria-label="Capture table rows"
                      >
                        {captures.map((capture) => (
                          <CaptureMobileRow
                            capture={capture}
                            categoryLabel={capture.categoryLabel ?? null}
                            onOpen={setDetail}
                            key={capture.id}
                          />
                        ))}
                      </div>
                    </>
                  )
                ) : null}
                {inboxError && (
                  <div className="pagination-feedback" role="alert">
                    <span>{inboxError}</span>
                    <button
                      type="button"
                      onClick={() => void loadInboxPage(Boolean(nextCursor))}
                      disabled={loadingInbox || loadingMore}
                    >
                      Retry
                    </button>
                  </div>
                )}
                {nextCursor && !inboxError && (
                  <div className="pagination-controls">
                    <button
                      type="button"
                      className="load-more"
                      onClick={() => void loadInboxPage(true)}
                      disabled={loadingMore}
                    >
                      {loadingMore ? "Loading more…" : "Load more"}
                    </button>
                  </div>
                )}
                {!loadingInbox && !captures.length && (
                  <div className="empty">
                    <h2>
                      {hasInboxFilters
                        ? "No captures found"
                        : "Your inbox is ready"}
                    </h2>
                    <p>
                      {hasInboxFilters
                        ? "Try another search or clear your filters."
                        : "Completed captures will appear here."}
                    </p>
                    {hasInboxFilters && (
                      <button
                        type="button"
                        className="inbox-empty-clear"
                        onClick={() => {
                          setSearch("");
                          setPlatform("");
                          setCategory("");
                          setTopic("");
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </section>
            </section>
          )}
          {tab === "activity" && (
            <div className="activity-view">
              <header className="activity-heading">
                <span className="activity-eyebrow">Activity</span>
                <h1>Capture activity</h1>
                <p>Live progress across every source.</p>
              </header>
              <section className="activity-summary" aria-label="Activity summary">
                {[
                  ["active", activityCounts.active, "Active"],
                  ["queued", activityCounts.queued, "Queued"],
                  ["attention", activityCounts.failed, "Attention"],
                  ["saved", activityCounts.savedToday, "Saved today"],
                ].map(([kind, value, label]) => (
                  <div className={`activity-kpi ${kind}`} key={kind}>
                    <span aria-hidden="true" />
                    <strong>{value}</strong>
                    <small>{label}</small>
                  </div>
                ))}
                <p>{activityCounts.recentEvents} events in the last 10 minutes</p>
              </section>
              {message && <p className="activity-feedback" role="status">{message}</p>}
              <section className="activity-table" aria-label="Capture activity">
                <div className="activity-table-heading">
                  <div>
                    <h2>Captures</h2>
                    <span>Click a row to inspect logs</span>
                  </div>
                  <div className="activity-filters" role="group" aria-label="Activity filter">
                    <button type="button" aria-pressed={activityFilter === "active"} onClick={() => setActivityFilter("active")}>Active</button>
                    <button type="button" aria-pressed={activityFilter === "all"} onClick={() => setActivityFilter("all")}>All</button>
                  </div>
                </div>
                <div className="activity-table-columns" aria-hidden="true">
                  <span>Capture</span><span>Progress</span><span>Status</span><span>Updated</span><span />
                </div>
                {activityLoading && visibleActivityJobs.length === 0 ? (
                  <p className="activity-empty">Loading capture activity…</p>
                ) : activityError ? (
                  <p className="activity-empty" role="alert">{activityError}</p>
                ) : visibleActivityJobs.length === 0 ? (
                  <p className="activity-empty">{activityFilter === "active" ? "No captures processing now." : "No captures yet."}</p>
                ) : (
                  <div className="activity-list">
                    {visibleActivityJobs.map((job) => {
                      const expanded = expandedJobId === job.id;
                      const events = expanded && jobDetails?.job.id === job.id ? jobDetails.events : [];
                      const safeEvents = events
                        .map(safeActivityEvent)
                        .filter((event): event is ActivityEvent => event !== null);
                      return (
                        <article className={`activity-card ${expanded ? "expanded" : ""} ${highlightedJob === job.id ? "highlighted" : ""}`} key={job.id}>
                          <button type="button" className="activity-row-trigger" aria-expanded={expanded} aria-controls={`activity-log-${job.id}`} onClick={() => setExpandedJobId(expanded ? null : job.id)}>
                            <span className="activity-row-copy"><span className={`activity-source-dot ${platformFor(job.normalizedUrl)}`} aria-hidden="true" /><span><strong>{job.displayTitle || sourceReference(job.normalizedUrl)}</strong><small>{sourceLabel(job.normalizedUrl)}</small></span></span>
                            <span className="activity-stages" aria-label="Processing stages">
                              {activityStages.map((stage) => {
                                const stageState = job.stages.find((item) => item.name === stage);
                                const state = stageState?.state ?? "queued";
                                const duration = formatStageDuration(stageState);
                                return <span className={`activity-stage ${state}`} title={`${activityStageCopy[stage]} · ${duration}`} aria-label={`${activityStageCopy[stage]}: ${state}, ${duration}`} key={stage}><span className="activity-stage-marker" /><span className="activity-stage-label">{activityStageCopy[stage]}</span></span>;
                              })}
                            </span>
                            <span className={`activity-status ${job.status === "failed" ? "failed" : ""}`}>{job.status === "failed" ? failureFor(job).title : activityStatusCopy[job.status] || "Processing"}</span>
                            <time className="activity-updated" dateTime={job.updatedAt}>{formatActivityTime(job.updatedAt)}</time>
                            <ChevronDown className="activity-row-chevron" aria-hidden="true" />
                          </button>
                          {expanded && (
                            <div className="activity-inline-log" id={`activity-log-${job.id}`}>
                              <div className="activity-inline-log-heading"><div><strong>Processing logs</strong><span>{(job.attempts > 0 || (job.status !== "failed" && safeEvents.some((event) => event.state === "failed"))) ? "Includes previous attempts" : "Current capture"}</span></div><button type="button" onClick={() => void copyActivityLogs(events)}><Copy aria-hidden="true" /> Copy logs</button></div>
                              {copyFeedback && <p className="activity-copy-feedback" role="status">{copyFeedback}</p>}
                              {detailsLoading && events.length === 0 ? <p>Loading logs…</p> : detailsError ? <p role="alert">Logs are unavailable. Close and reopen this capture to retry.</p> : safeEvents.length > 0 ? (
                                <ol tabIndex={0} aria-label="Processing log entries">
                                  {safeEvents.map((event) => <li key={event.id}><span className={`activity-log-dot ${event.state}`} aria-hidden="true" /><time className="activity-log-time" dateTime={event.createdAt}>{formatEventTime(event.createdAt)}</time><strong>{event.label}{event.attempt && <small className="activity-log-attempt">Attempt {event.attempt}</small>}</strong><span className="activity-log-message">{event.message || "—"}</span><span className="activity-log-duration">{formatEventDuration(event)}</span></li>)}
                                </ol>
                              ) : <p>Safe processing events will appear here.</p>}
                              <div className="activity-stage-durations" aria-label="Stage durations">
                                {activityStages.map((stage) => {
                                  const stageState = job.stages.find((item) => item.name === stage);
                                  const duration = formatStageDuration(stageState);
                                  return <span key={stage}><strong>{activityStageCopy[stage]}</strong> {duration}</span>;
                                })}
                              </div>
                              <p className="activity-log-touch-hint">Stage durations are shown here for touch access.</p>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
                {activityNextCursor && <button type="button" className="activity-load-more" disabled={activityLoadingMore} onClick={() => void loadActivityPage(activityFilter, true)}>{activityLoadingMore ? "Loading…" : "Load more captures"}</button>}
              </section>
              <section className="activity-attention" aria-labelledby="attention-title">
                <div className="activity-attention-heading">
                  <div><h2 id="attention-title">Needs attention</h2><span>{attentionTotal} {attentionTotal === 1 ? "item" : "items"}</span><small>Highest priority first</small></div>
                  <button type="button" onClick={() => void retryAll()} disabled={retryPending || attentionTotal === 0}><RotateCw aria-hidden="true" />{retryPending ? "Retrying…" : "Retry all"}</button>
                </div>
                <div className="activity-attention-list" role="list">
                  {failedError ? <p role="alert">Unable to load failures. <button type="button" onClick={() => void loadFailedJobs()}>Retry list</button></p> : failedJobs.length === 0 ? <p>Nothing needs attention.</p> : failedJobs.map((job) => (
                    <div className="activity-attention-item" role="listitem" key={job.id}>
                      <span className="activity-attention-dot" aria-hidden="true" />
                      <div><strong>{job.displayTitle || sourceReference(job.normalizedUrl)}</strong><small>{sourceLabel(job.normalizedUrl)} · {failureFor(job).message}</small></div>
                      <span className="activity-retry-count">{job.attempts} manual {job.attempts === 1 ? "retry" : "retries"}</span>
                      <button type="button" disabled={retryPending || retryingIds.includes(job.id)} onClick={() => void retryJob(job)}>{retryingIds.includes(job.id) ? "Retrying…" : "Retry"}</button>
                    </div>
                  ))}
                  {failedNextCursor && <button type="button" className="activity-failed-more" disabled={failedLoadingMore} onClick={() => void loadFailedJobs(true)}>{failedLoadingMore ? "Loading…" : "Load more"}</button>}
                </div>
              </section>
            </div>
          )}
          {tab === "library" && <Library onOpen={setDetail} />}
          {tab === "ask" && <AskAI onOpen={setDetail} />}
          {tab === "capture" && (
            <div
              className="capture-overlay"
              role="presentation"
              onClick={() => navigateTo("inbox", "replace")}
            >
              <section
                className="capture-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="capture-title"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="capture-close"
                  aria-label="Close capture"
                  onClick={() => navigateTo("inbox", "replace")}
                >
                  ×
                </button>
                <div className="capture-eyebrow">New capture</div>
                <div className="capture-intro">
                  <h1 id="capture-title">
                    {captureSubmitted ? "Post submitted" : "Capture a post"}
                  </h1>
                  <p>
                    {captureSubmitted
                      ? "Your post is in the processing queue."
                      : "Paste a post link to save it in your archive."}
                  </p>
                </div>
                {captureSubmitted ? (
                  <div className="capture-success">
                    <p role="status">{message}</p>
                    <button
                      type="button"
                      onClick={() => navigateTo("activity", "replace")}
                    >
                      View activity
                    </button>
                  </div>
                ) : (
                  <form onSubmit={submit}>
                    <label>
                      Post URL
                      <input
                        type="url"
                        required
                        value={captureUrl}
                        onChange={(e) => setCaptureUrl(e.target.value)}
                        placeholder="https://www.instagram.com/reel/..."
                        autoFocus
                      />
                      <small>
                        Supports public and connected-account posts.
                      </small>
                    </label>
                    <label>
                      <span>
                        Why are you saving it?{" "}
                        <span className="capture-optional">Optional</span>
                      </span>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add a note for your future self"
                      />
                    </label>
                    <p className="capture-hint">
                      We'll show progress in Activity.
                    </p>
                    <div className="capture-actions">
                      <button
                        type="button"
                        className="capture-cancel"
                        onClick={() => navigateTo("inbox", "replace")}
                      >
                        Cancel
                      </button>
                      <button disabled={submitting}>
                        {submitting ? "Submitting…" : "Capture post"}
                      </button>
                    </div>
                    {message && (
                      <p
                        className={`capture-feedback ${captureError ? "error" : ""}`}
                        role={captureError ? "alert" : "status"}
                      >
                        {message}
                      </p>
                    )}
                  </form>
                )}
              </section>
            </div>
          )}
          {tab === "settings" && <Settings user={user} />}
        </main>
      </section>
      {mobileMenuOpen && (
        <div
          className="app-account-menu-layer"
          role="presentation"
          onClick={() => setMobileMenuOpen(false)}
        >
          <section
            className="app-account-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-menu-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="app-account-menu-heading">
              <div>
                <span className="app-avatar" aria-hidden="true">
                  {profileInitial}
                </span>
                <span>
                  <strong id="account-menu-title">
                    {user?.username || "Personal archive"}
                  </strong>
                  <small>Personal workspace</small>
                </span>
              </div>
            </div>
            <button
              type="button"
              className="app-account-menu-item"
              onClick={() => navigateTo("settings")}
            >
              <UserRound aria-hidden="true" />
              Profile
            </button>
            <button
              type="button"
              className="app-account-menu-item"
              onClick={() => navigateTo("settings")}
            >
              <SettingsIcon aria-hidden="true" />
              Settings
            </button>
            <button
              type="button"
              className="app-account-menu-item account-menu-signout"
              onClick={() => void signOut()}
            >
              <LogOut aria-hidden="true" />
              Log out
            </button>
          </section>
        </div>
      )}
      {detail && <Detail id={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
