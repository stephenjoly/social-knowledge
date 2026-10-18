import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  MapPin,
  Play,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { ActionButton, Avatar, Chip, Input, cx } from "../components/ui/primitives";
import type { AppTab, Capture, LibraryNode, LibraryNodeDetail } from "../shared/types";
import { api, assetUrl } from "../shared/api";
import {
  categoryStyle,
  creatorHandle,
  libraryChangedEvent,
  platformName,
  sentenceCase,
} from "./knowledge-shared";
import "../knowledge.css";

type CaptureNote = Capture & {
  durationSeconds?: number | null;
  analysis: Capture["analysis"] & {
    classification?: { primaryDomain?: string | null } | null;
  };
};

type Filing =
  | { state: "loading" }
  | { state: "filed"; nodeId: string; path: string[] }
  | { state: "unfiled" }
  | { state: "error" };

type Panel = "transcript" | "description" | "comments";

const backLabels: Partial<Record<AppTab, string>> = {
  library: "Knowledge base",
  ask: "Ask",
  activity: "Activity",
};

function languageName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function formatDuration(seconds: number) {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

function savedLabel(iso: string, now = new Date()) {
  const saved = new Date(iso);
  const time = saved.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(saved)) / 86_400_000);
  if (days === 0) return `saved today at ${time}`;
  if (days === 1) return `saved yesterday at ${time}`;
  return `saved ${saved.toLocaleDateString(undefined, { month: "short", day: "numeric", year: saved.getFullYear() === now.getFullYear() ? undefined : "numeric" })}`;
}

function sourceKind(capture: CaptureNote) {
  const platform = platformName(capture.platform);
  if (capture.sourceType === "video")
    return capture.platform === "instagram" ? `${platform} reel` : `${platform} video`;
  return `${platform} post`;
}

async function findFiling(capture: CaptureNote): Promise<Filing> {
  const tree = await api<{ nodes: LibraryNode[] }>("/api/v1/library/tree");
  const roots = tree.nodes.filter((node) => node.parentId === null && node.captureCount > 0);
  const hint = capture.analysis.classification?.primaryDomain?.toLocaleLowerCase();
  roots.sort(
    (a, b) =>
      Number(b.label.toLocaleLowerCase() === hint) - Number(a.label.toLocaleLowerCase() === hint),
  );
  for (const root of roots) {
    const { node } = await api<{ node: LibraryNodeDetail }>(`/api/v1/library/nodes/${root.id}`);
    const match = node.captures.find((item) => item.id === capture.id);
    if (match)
      return {
        state: "filed",
        nodeId: match.assignedNode.id,
        path: match.breadcrumb.map((part) => part.label),
      };
  }
  return { state: "unfiled" };
}

export function Detail({
  id,
  onClose,
  from = "inbox",
}: {
  id: string;
  onClose: () => void;
  from?: AppTab;
}) {
  const [capture, setCapture] = useState<CaptureNote | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filing, setFiling] = useState<Filing>({ state: "loading" });
  const [panel, setPanel] = useState<Panel | null>(null);
  const [playing, setPlaying] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const moveOpenRef = useRef(false);
  moveOpenRef.current = moveOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let active = true;
    setCapture(null);
    setLoadError(false);
    setFiling({ state: "loading" });
    setPanel(null);
    setPlaying(false);
    api<{ capture: CaptureNote }>(`/api/v1/captures/${id}`)
      .then(async ({ capture: loaded }) => {
        if (!active) return;
        setCapture(loaded);
        try {
          const result = await findFiling(loaded);
          if (active) setFiling(result);
        } catch {
          if (active) setFiling({ state: "error" });
        }
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    rootRef.current?.scrollIntoView({ block: "start" });
    window.scrollTo({ top: 0 });
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !moveOpenRef.current && !event.defaultPrevented)
        onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      requestAnimationFrame(() => previous?.isConnected && previous.focus());
    };
  }, []);

  useEffect(() => {
    if (capture) backRef.current?.focus({ preventScroll: true });
  }, [capture]);

  const backLabel = backLabels[from] ?? "Inbox";
  const backButton = (
    <button type="button" className="note-back" ref={backRef} onClick={onClose}>
      <ArrowLeft aria-hidden="true" />
      <span>{backLabel}</span>
    </button>
  );

  if (!capture)
    return (
      <article className="capture-note" ref={rootRef} aria-busy={!loadError}>
        <div className="note-topbar">{backButton}</div>
        {loadError ? (
          <div className="note-feedback" role="alert">
            This capture could not be loaded.
            <ActionButton onClick={() => setAttempt((value) => value + 1)}>Retry</ActionButton>
          </div>
        ) : (
          <p className="note-feedback" role="status">Loading capture…</p>
        )}
      </article>
    );

  const rootLabel =
    filing.state === "filed" ? filing.path[0] : capture.analysis.classification?.primaryDomain;
  const accent = filing.state === "unfiled" ? null : categoryStyle(rootLabel).accent;
  const video = capture.assets.find((asset) => asset.kind === "video");
  const thumbnail = capture.assets.find((asset) => asset.kind === "thumbnail");
  const images = capture.assets.filter((asset) => asset.kind === "image");
  const hasStructuredTakeaways = Boolean(capture.analysis.takeaways?.length);
  const takeaways = hasStructuredTakeaways
    ? capture.analysis.takeaways!
    : capture.analysis.recommendations;
  const actions = hasStructuredTakeaways ? capture.analysis.recommendations : [];
  const bottomLine = [capture.synopsis, capture.whyUseful]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const places = capture.analysis.entities.filter(
    (entity) => entity.type === "place" || entity.type === "restaurant",
  );
  const mentioned = capture.analysis.entities.filter(
    (entity) => entity.type !== "place" && entity.type !== "restaurant",
  );
  const claims = capture.analysis.claimsNeedingVerification ?? [];
  const platform = platformName(capture.platform);
  const meta = [
    sourceKind(capture),
    capture.durationSeconds ? formatDuration(capture.durationSeconds) : null,
    savedLabel(capture.createdAt),
  ].filter(Boolean);
  const mediaBackground = accent
    ? `linear-gradient(225deg, ${accent.thumb} 0%, ${accent.deep} 100%)`
    : "linear-gradient(225deg, var(--subtle) 0%, var(--border) 100%)";
  const askQuestion = `What does "${capture.title}" say?`;
  const panels: Array<{ id: Panel; label: string }> = [
    { id: "transcript", label: "Transcript" },
    { id: "description", label: "Source description" },
    {
      id: "comments",
      label: capture.comments.length ? `Comments · ${capture.comments.length}` : "Comments",
    },
  ];

  return (
    <article className="capture-note" ref={rootRef} aria-labelledby="capture-note-title">
      <div className="note-topbar">
        {backButton}
        <a
          className="ui-btn ui-btn-ghost"
          href={`/?tab=ask&q=${encodeURIComponent(askQuestion)}`}
          aria-label="Ask about this capture"
        >
          <Sparkles className="ui-btn-icon" aria-hidden="true" />
          <span>Ask about this</span>
        </a>
        <a
          className="ui-btn ui-btn-default"
          href={capture.sourceUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open original post on ${platform}`}
        >
          <ExternalLink className="ui-btn-icon" aria-hidden="true" />
          <span>Open original</span>
        </a>
      </div>
      <div className="note-body">
        <div className="note-article">
          <h1 id="capture-note-title">{capture.title}</h1>
          <div className="note-attribution">
            <Avatar
              name={capture.creator?.replace(/^@/, "") || platform}
              size={26}
              color={accent?.icon}
            />
            <strong>{creatorHandle(capture.creator)}</strong>
            <span>{meta.join(" · ")}</span>
          </div>
          {video ? (
            playing ? (
              <video
                className="note-video"
                controls
                autoPlay
                preload="metadata"
                poster={thumbnail ? assetUrl(capture.id, thumbnail.id) : undefined}
                src={assetUrl(capture.id, video.id)}
              />
            ) : (
              <button
                type="button"
                className="note-media"
                style={{
                  backgroundImage: thumbnail
                    ? `url("${assetUrl(capture.id, thumbnail.id)}")`
                    : mediaBackground,
                }}
                aria-label="Play video"
                onClick={() => setPlaying(true)}
              >
                <span className="note-play"><Play aria-hidden="true" /></span>
              </button>
            )
          ) : images.length ? (
            <div className="note-gallery">
              {images.map((image) => (
                <img key={image.id} src={assetUrl(capture.id, image.id)} alt="" />
              ))}
            </div>
          ) : capture.sourceType === "video" ? (
            <a
              className="note-media"
              style={{ backgroundImage: mediaBackground }}
              href={capture.sourceUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Watch on ${platform}`}
            >
              <span className="note-play"><Play aria-hidden="true" /></span>
            </a>
          ) : null}
          {bottomLine && (
            <section className="note-section">
              <h2>Bottom line</h2>
              <p className="note-prose">{bottomLine}</p>
            </section>
          )}
          {takeaways.length > 0 && (
            <section className="note-section">
              <h2>Key takeaways</h2>
              <ul className="note-takeaways">
                {takeaways.map((takeaway) => (
                  <li key={takeaway}>{takeaway}</li>
                ))}
              </ul>
            </section>
          )}
          {actions.length > 0 && (
            <section className="note-section">
              <h2>Actions &amp; recommendations</h2>
              <ul className="note-actions">
                {actions.map((action) => (
                  <li key={action}>
                    <span className="note-marker" aria-hidden="true" />
                    {action}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {capture.analysis.evidence.length > 0 && (
            <section className="note-section">
              <h2>Evidence</h2>
              <ul className="note-evidence">
                {capture.analysis.evidence.map((item, index) => (
                  <li key={index}>
                    {item.claim} <em>({item.source})</em>
                    {item.quote ? ` — “${item.quote}”` : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="note-more">
            <div className="note-more-buttons">
              {panels.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={cx("note-more-button", panel === item.id && "is-open")}
                  aria-expanded={panel === item.id}
                  aria-controls={`note-panel-${item.id}`}
                  onClick={() => setPanel(panel === item.id ? null : item.id)}
                >
                  {item.label}
                  <ChevronDown aria-hidden="true" />
                </button>
              ))}
            </div>
            {panel === "transcript" && (
              <div className="note-panel" id="note-panel-transcript">
                {capture.translatedTranscript && (
                  <>
                    <h3>
                      Translation · {languageName(capture.sourceLanguage || "und")} →{" "}
                      {languageName(capture.translationLanguage || "en")}
                    </h3>
                    <p className="note-preserve">{capture.translatedTranscript}</p>
                    <h3>Original</h3>
                  </>
                )}
                <p className="note-preserve">{capture.transcript || "Unavailable"}</p>
              </div>
            )}
            {panel === "description" && (
              <div className="note-panel" id="note-panel-description">
                <p className="note-preserve">{capture.description || "Unavailable"}</p>
              </div>
            )}
            {panel === "comments" && (
              <div className="note-panel" id="note-panel-comments">
                {capture.comments.length ? (
                  <ul className="note-comments">
                    {capture.comments.map((comment, index) => (
                      <li key={`${comment.author ?? "unknown"}-${index}`}>
                        <strong>
                          {comment.author ?? "Unknown"}
                          {comment.isPinned ? <span className="note-pinned">Pinned</span> : null}
                        </strong>
                        <p>{comment.text}</p>
                        {comment.likeCount !== null && (
                          <small>{comment.likeCount.toLocaleString()} likes</small>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No comments were available from the platform.</p>
                )}
              </div>
            )}
          </div>
        </div>
        <aside className="note-rail" aria-label="Capture details">
          <div className="note-details">
            <div className="note-detail">
              <div className="note-detail-label">
                <h2>Filed in</h2>
                {(filing.state === "filed" || filing.state === "unfiled") && (
                  <button type="button" className="note-detail-action" onClick={() => setMoveOpen(true)}>
                    {filing.state === "filed" ? "Move" : "File"}
                  </button>
                )}
              </div>
              <p className="note-detail-value">
                {filing.state === "filed"
                  ? filing.path.join(" / ")
                  : filing.state === "unfiled"
                    ? "Not filed yet"
                    : filing.state === "error"
                      ? "Unavailable"
                      : "Loading…"}
              </p>
            </div>
            {capture.topics.length > 0 && (
              <div className="note-detail">
                <div className="note-detail-label"><h2>Topics</h2></div>
                <div className="note-chips">
                  {capture.topics.map((topic) => (
                    <Chip key={topic} className="kb-chip-small">{sentenceCase(topic)}</Chip>
                  ))}
                </div>
              </div>
            )}
            {capture.sourceLanguage && (
              <div className="note-detail">
                <div className="note-detail-label"><h2>Language</h2></div>
                <p className="note-detail-value">
                  {languageName(capture.sourceLanguage)}
                  {capture.translationLanguage && capture.translationLanguage !== capture.sourceLanguage
                    ? ` · translated to ${languageName(capture.translationLanguage)}`
                    : ""}
                </p>
              </div>
            )}
            {places.length > 0 && (
              <div className="note-detail">
                <div className="note-detail-label"><h2>Places mentioned</h2></div>
                <ul className="note-places">
                  {places.map((place) => (
                    <li key={place.name} title={place.description ?? undefined}>
                      <MapPin aria-hidden="true" />
                      <strong>{place.name}</strong>
                      {place.location && <span>{place.location}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {mentioned.length > 0 && (
              <div className="note-detail">
                <div className="note-detail-label"><h2>Also mentioned</h2></div>
                <ul className="note-places">
                  {mentioned.map((entity) => (
                    <li key={entity.name} title={entity.description ?? undefined}>
                      <strong>{entity.name}</strong>
                      <span>{sentenceCase(entity.type)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {claims.length > 0 && (
            <div className="note-verify">
              <div className="note-verify-head">
                <TriangleAlert aria-hidden="true" />
                <h2>{claims.length === 1 ? "1 claim to verify" : `${claims.length} claims to verify`}</h2>
              </div>
              {claims.map((claim) => (
                <p key={claim}>{claim}</p>
              ))}
            </div>
          )}
        </aside>
      </div>
      {moveOpen && (
        <MoveDialog
          captureId={capture.id}
          currentNodeId={filing.state === "filed" ? filing.nodeId : null}
          onClose={() => setMoveOpen(false)}
          onMoved={(nodeId, path) => {
            setFiling({ state: "filed", nodeId, path });
            setMoveOpen(false);
            window.dispatchEvent(new CustomEvent(libraryChangedEvent));
          }}
        />
      )}
    </article>
  );
}

function MoveDialog({
  captureId,
  currentNodeId,
  onClose,
  onMoved,
}: {
  captureId: string;
  currentNodeId: string | null;
  onClose: () => void;
  onMoved: (nodeId: string, path: string[]) => void;
}) {
  const [nodes, setNodes] = useState<LibraryNode[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(currentNodeId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    api<{ nodes: LibraryNode[] }>("/api/v1/library/tree")
      .then((result) => setNodes(result.nodes))
      .catch(() => setLoadError(true));
  }, []);

  const options = useMemo(() => {
    if (!nodes) return [];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const pathOf = (node: LibraryNode) => {
      const path: string[] = [];
      const seen = new Set<string>();
      let current: LibraryNode | undefined = node;
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        path.unshift(current.label);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return path;
    };
    const query = filter.trim().toLocaleLowerCase();
    return nodes
      .map((node) => ({ id: node.id, path: pathOf(node) }))
      .filter((option) => !query || option.path.join(" / ").toLocaleLowerCase().includes(query))
      .sort((a, b) => a.path.join(" / ").localeCompare(b.path.join(" / ")));
  }, [nodes, filter]);

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = [
      ...dialogRef.current.querySelectorAll<HTMLElement>(
        "input:not([disabled]), button:not([disabled])",
      ),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  async function save() {
    const option = options.find((item) => item.id === selected);
    if (!option) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/v1/captures/${captureId}/classification`, {
        method: "PATCH",
        body: JSON.stringify({ nodeId: option.id }),
      });
      onMoved(option.id, option.path);
    } catch {
      setError("This capture could not be moved. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="note-dialog-scrim" role="presentation" onClick={onClose}>
      <section
        className="note-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-move-title"
        ref={dialogRef}
        onKeyDown={trapFocus}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="note-move-title">Move to a category</h2>
        <p>Choose where this note is filed. The original post is unchanged.</p>
        <Input
          type="search"
          icon={Search}
          placeholder="Filter categories"
          aria-label="Filter categories"
          value={filter}
          autoFocus
          onChange={(event) => setFilter(event.target.value)}
        />
        <div className="note-move-list" role="radiogroup" aria-label="Categories">
          {loadError ? (
            <p role="alert">Categories could not be loaded.</p>
          ) : nodes === null ? (
            <p role="status">Loading categories…</p>
          ) : options.length ? (
            options.map((option) => (
              <label key={option.id} className={cx("note-move-option", selected === option.id && "is-selected")}>
                <input
                  type="radio"
                  name="note-move-target"
                  checked={selected === option.id}
                  onChange={() => setSelected(option.id)}
                />
                <span>{option.path.join(" / ")}</span>
              </label>
            ))
          ) : (
            <p>No categories match.</p>
          )}
        </div>
        {error && <p className="note-dialog-error" role="alert">{error}</p>}
        <div className="note-dialog-actions">
          <ActionButton onClick={onClose}>Cancel</ActionButton>
          <ActionButton
            variant="primary"
            disabled={!selected || selected === currentNodeId || saving}
            onClick={() => void save()}
          >
            {saving ? "Moving…" : "Move"}
          </ActionButton>
        </div>
      </section>
    </div>
  );
}
