import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Folder,
  Play,
  Search,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  ActionButton,
  Avatar,
  Chip,
  Input,
  cx,
} from "../components/ui/primitives";
import { useDialogFocus } from "../components/use-dialog-focus";
import type {
  AppTab,
  Capture,
  LibraryNode,
  LibraryNodeDetail,
  NoteOpeningContext,
} from "../shared/types";
import { api, assetUrl } from "../shared/api";
import {
  creatorHandle,
  libraryChangedEvent,
  platformName,
  sentenceCase,
} from "./knowledge-shared";
import "../knowledge.css";
import "../note-viewer.css";

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
type NoteTab = "note" | "transcript" | "details";
const tabs: Array<{ id: NoteTab; label: string }> = [
  { id: "note", label: "Note" },
  { id: "transcript", label: "Transcript" },
  { id: "details", label: "Details" },
];
function languageName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
function formatDuration(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
function savedLabel(iso: string, now = new Date()) {
  const saved = new Date(iso);
  const time = saved.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(saved)) / 86_400_000);
  if (days === 0) return `saved today at ${time}`;
  if (days === 1) return `saved yesterday at ${time}`;
  return `saved ${saved.toLocaleDateString(undefined, { month: "short", day: "numeric", year: saved.getFullYear() === now.getFullYear() ? undefined : "numeric" })}`;
}
function sourceKind(capture: CaptureNote) {
  const platform = platformName(capture.platform);
  return capture.sourceType === "video"
    ? capture.platform === "instagram"
      ? `${platform} reel`
      : `${platform} video`
    : `${platform} post`;
}
async function findFiling(capture: CaptureNote): Promise<Filing> {
  const tree = await api<{ nodes: LibraryNode[] }>("/api/v1/library/tree");
  const roots = tree.nodes.filter(
    (node) => node.parentId === null && node.captureCount > 0,
  );
  const hint =
    capture.analysis.classification?.primaryDomain?.toLocaleLowerCase();
  roots.sort(
    (a, b) =>
      Number(b.label.toLocaleLowerCase() === hint) -
      Number(a.label.toLocaleLowerCase() === hint),
  );
  for (const root of roots) {
    const { node } = await api<{ node: LibraryNodeDetail }>(
      `/api/v1/library/nodes/${root.id}`,
    );
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

/** B's centered viewer. Its collection is supplied by the mounted originating page. */
export function Detail({
  id,
  onClose,
  from = "inbox",
  context,
  onSelect,
}: {
  id: string;
  onClose: () => void;
  from?: AppTab;
  context?: NoteOpeningContext;
  onSelect?: (id: string) => void;
  /** Retained for existing callers; all modal closes restore without scrolling. */
  restoreFocus?: boolean;
}) {
  const [capture, setCapture] = useState<CaptureNote | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filing, setFiling] = useState<Filing>({ state: "loading" });
  const [tab, setTab] = useState<NoteTab>("note");
  const [moveOpen, setMoveOpen] = useState(false);
  const [showAllMentions, setShowAllMentions] = useState(false);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [photo, setPhoto] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  useDialogFocus(dialogRef, onClose);

  useEffect(() => {
    // Inert the shell, while retaining its layout, filters and scroll containers.
    const layer = layerRef.current;
    const siblings = Array.from(layer?.parentElement?.children ?? []).filter(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node !== layer,
    );
    const previous = siblings.map((node) => ({ node, inert: node.inert }));
    previous.forEach(({ node }) => {
      node.inert = true;
    });
    const page = document.documentElement;
    const overflow = page.style.overflow;
    const gutter = page.style.scrollbarGutter;
    page.style.scrollbarGutter = "stable";
    page.style.overflow = "hidden";
    return () => {
      previous.forEach(({ node, inert }) => {
        node.inert = inert;
      });
      page.style.overflow = overflow;
      page.style.scrollbarGutter = gutter;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setCapture(null);
    setLoadError(false);
    setFiling({ state: "loading" });
    setTab("note");
    setPlaying(false);
    setMoveOpen(false);
    setShowAllMentions(false);
    setDimensions(null);
    setPhoto(0);
    setMediaError(false);
    pendingSeek.current = null;
    if (readerRef.current) readerRef.current.scrollTop = 0;
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
    const media = videoRef.current;
    return () => {
      if (media) {
        media.pause();
        media.currentTime = 0;
      }
    };
  }, [capture?.id]);

  const order = context?.captureIds.includes(id) ? context.captureIds : [id];
  const index = order.indexOf(id);
  function step(direction: number) {
    const next = order[index + direction];
    if (next) onSelect?.(next);
  }
  function selectTab(next: NoteTab) {
    setTab(next);
    if (readerRef.current) readerRef.current.scrollTop = 0;
    // On phones keep the selected pane below the reachable sticky toolbar.
    const dialog = dialogRef.current;
    const tabbar = dialog?.querySelector<HTMLElement>(".nv-tabs");
    if (dialog && tabbar && matchMedia("(max-width: 760px)").matches) {
      const top = tabbar.offsetTop - dialog.offsetTop - 52;
      if (dialog.scrollTop > top) dialog.scrollTop = Math.max(0, top);
    }
  }
  function play(seconds?: number) {
    const media = videoRef.current;
    if (!media) return;
    if (seconds !== undefined) {
      if (media.readyState >= 1)
        media.currentTime = Math.min(
          seconds,
          Number.isFinite(media.duration) ? media.duration : seconds,
        );
      else pendingSeek.current = seconds;
    }
    setPlaying(true);
    void media.play().catch(() => {
      setPlaying(false);
    });
    media.focus({ preventScroll: true });
  }
  const video = capture?.assets.find((asset) => asset.kind === "video");
  const thumbnail = capture?.assets.find((asset) => asset.kind === "thumbnail");
  const images =
    capture?.assets.filter((asset) => asset.kind === "image") ?? [];
  const missingVideo = Boolean(capture?.sourceType === "video" && !video);
  const hasMedia = Boolean(
    video || images.length || (missingVideo && thumbnail),
  );
  const landscape = Boolean(
    video && dimensions && dimensions.width > dimensions.height,
  );
  const kind = !hasMedia
    ? "none"
    : images.length
      ? "images"
      : landscape
        ? "landscape"
        : "portrait";
  const platform = capture ? platformName(capture.platform) : "source";
  const source = capture ? (
    <div className="nv-src">
      <div className="nv-who">
        <Avatar
          name={capture.creator?.replace(/^@/, "") || platform}
          size={30}
        />
        <div>
          <b>{capture.creator || platform}</b>
          <small>
            {creatorHandle(capture.creator)} · {sourceKind(capture)}
          </small>
        </div>
      </div>
      {capture.description && (
        <p className="nv-cap" title="Original caption">
          {capture.description}
        </p>
      )}
      <a
        className="ui-btn ui-btn-default"
        href={capture.sourceUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open original post on ${platform}`}
      >
        Open original <ExternalLink aria-hidden="true" />
      </a>
    </div>
  ) : null;
  const takeaways = capture?.analysis.takeaways?.length
    ? capture.analysis.takeaways
    : (capture?.analysis.recommendations ?? []);
  const actions = capture?.analysis.takeaways?.length
    ? capture.analysis.recommendations
    : [];
  const claims = capture?.analysis.claimsNeedingVerification ?? [];
  const entities = capture?.analysis.entities ?? [];
  const canMove = filing.state === "filed" || filing.state === "unfiled";
  const filedLabel =
    filing.state === "filed"
      ? filing.path.join(" / ")
      : filing.state === "unfiled"
        ? "Not filed yet"
        : filing.state === "loading"
          ? "Loading…"
          : "Unavailable";
  const filingButton = (
    <button
      type="button"
      className="nv-filed"
      disabled={!canMove}
      onClick={() => setMoveOpen(true)}
      aria-label={`Filed in ${filedLabel}. ${filing.state === "filed" ? "Move" : "File"}`}
    >
      <Folder aria-hidden="true" />
      {filedLabel}
    </button>
  );

  return (
    <div
      className="nvm-layer"
      ref={layerRef}
      onClick={(event) => {
        if (event.target === event.currentTarget && !moveOpen) onClose();
      }}
    >
      <article
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-note-title"
        tabIndex={-1}
        className={cx("capture-note nv nvm", `k-${kind}`)}
        ref={dialogRef}
        style={
          dimensions
            ? ({
                "--ar": `${dimensions.width} / ${dimensions.height}`,
                "--arn": dimensions.width / dimensions.height,
              } as CSSProperties)
            : undefined
        }
        onKeyDown={(event) => {
          if (
            moveOpen ||
            event.defaultPrevented ||
            event.metaKey ||
            event.ctrlKey ||
            event.altKey
          )
            return;
          const target = event.target as HTMLElement;
          if (
            target.closest(
              'input, textarea, select, video, [role="tablist"], .nv-car',
            )
          )
            return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            step(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        <div className="nv-bar">
          <span className="nv-ctx">
            {context?.label ??
              `From ${from === "library" ? "Knowledge base" : from === "ask" ? "Ask" : "Inbox"}`}
          </span>
          {order.length > 1 && (
            <div className="nv-pager" role="group" aria-label="Browse notes">
              <button
                type="button"
                className="nv-iconbtn"
                aria-label="Previous note"
                disabled={index <= 0}
                onClick={() => step(-1)}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <span>
                {index + 1} of {order.length}
              </span>
              <button
                type="button"
                className="nv-iconbtn"
                aria-label="Next note"
                disabled={index >= order.length - 1}
                onClick={() => step(1)}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          )}
          <button
            type="button"
            className="nv-iconbtn"
            data-autofocus
            aria-label="Close note"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        {capture ? (
          <>
            {hasMedia && (
              <section className="nv-media" aria-label="Original post">
                <div className={cx("nv-stage", !landscape && "nv-fit")}>
                  <div
                    className={cx(
                      "nv-frame",
                      images.length > 0 && "images",
                      !dimensions && "is-loading",
                    )}
                  >
                    {mediaError ? (
                      <p className="nv-media-error" role="alert">
                        Media unavailable.{" "}
                        <a
                          href={capture.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open original
                        </a>
                      </p>
                    ) : video ? (
                      <>
                        <video
                          key={capture.id}
                          ref={videoRef}
                          className="note-video"
                          controls={playing}
                          playsInline
                          preload="metadata"
                          tabIndex={playing ? 0 : -1}
                          poster={
                            thumbnail
                              ? assetUrl(capture.id, thumbnail.id)
                              : undefined
                          }
                          src={assetUrl(capture.id, video.id)}
                          aria-label={`Video from ${capture.creator || platform}`}
                          onLoadedMetadata={(event) => {
                            const media = event.currentTarget;
                            if (media.videoWidth && media.videoHeight)
                              setDimensions({
                                width: media.videoWidth,
                                height: media.videoHeight,
                              });
                            if (pendingSeek.current !== null) {
                              media.currentTime = Math.min(
                                pendingSeek.current,
                                media.duration,
                              );
                              pendingSeek.current = null;
                            }
                          }}
                          onError={() => setMediaError(true)}
                        />
                        {!playing && (
                          <button
                            type="button"
                            className="nv-poster"
                            aria-label="Play video"
                            onClick={() => play()}
                          >
                            {thumbnail && (
                              <img
                                src={assetUrl(capture.id, thumbnail.id)}
                                alt=""
                                onLoad={(event) => {
                                  if (
                                    !videoRef.current?.videoWidth &&
                                    event.currentTarget.naturalWidth
                                  )
                                    setDimensions({
                                      width: event.currentTarget.naturalWidth,
                                      height: event.currentTarget.naturalHeight,
                                    });
                                }}
                              />
                            )}
                            <span className="nv-play">
                              <Play aria-hidden="true" />
                            </span>
                            {capture.durationSeconds ? (
                              <span className="nv-len">
                                {formatDuration(capture.durationSeconds)}
                              </span>
                            ) : null}
                          </button>
                        )}
                      </>
                    ) : (
                      images[photo] && (
                        <>
                          <img
                            key={images[photo].id}
                            src={assetUrl(capture.id, images[photo].id)}
                            alt={`Photo ${photo + 1} of ${images.length} from ${capture.creator || platform}`}
                            onError={() => setMediaError(true)}
                            onLoad={(event) => {
                              const img = event.currentTarget;
                              if (img.naturalWidth)
                                setDimensions({
                                  width: img.naturalWidth,
                                  height: img.naturalHeight,
                                });
                            }}
                          />
                          {images.length > 1 && (
                            <>
                              <span className="nv-count">
                                {photo + 1} / {images.length}
                              </span>
                              <button
                                className="nv-car prev"
                                type="button"
                                aria-label="Previous photo"
                                disabled={photo === 0}
                                onClick={() => setPhoto(photo - 1)}
                              >
                                <ChevronLeft aria-hidden="true" />
                              </button>
                              <button
                                className="nv-car next"
                                type="button"
                                aria-label="Next photo"
                                disabled={photo === images.length - 1}
                                onClick={() => setPhoto(photo + 1)}
                              >
                                <ChevronRight aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </>
                      )
                    )}
                    {!video && images.length === 0 && thumbnail && (
                      <img
                        src={assetUrl(capture.id, thumbnail.id)}
                        alt="Saved video thumbnail"
                        onError={() => setMediaError(true)}
                        onLoad={(event) => {
                          const img = event.currentTarget;
                          if (img.naturalWidth)
                            setDimensions({
                              width: img.naturalWidth,
                              height: img.naturalHeight,
                            });
                        }}
                      />
                    )}
                  </div>
                </div>
                {source}
                {missingVideo && (
                  <p className="nv-note">
                    Saved video unavailable. Use Open original to watch on{" "}
                    {platform}.
                  </p>
                )}
                <div className="nv-foot">
                  <kbd>Esc</kbd> to close · <kbd>←</kbd>
                  <kbd>→</kbd> {from === "ask" ? "sources" : "captures"}
                </div>
              </section>
            )}
            <header className="nv-head">
              <h1 id="capture-note-title">{capture.title}</h1>
              <div className="nv-meta">
                <span>{creatorHandle(capture.creator)}</span>
                <span className="dot">{sourceKind(capture)}</span>
                {capture.durationSeconds ? (
                  <span className="dot">
                    {formatDuration(capture.durationSeconds)}
                  </span>
                ) : null}
                <span className="dot">{savedLabel(capture.createdAt)}</span>
                <span className="dot">{filingButton}</span>
              </div>
            </header>
            <div className="nv-tabs">
              <div
                role="tablist"
                aria-label="Note sections"
                onKeyDown={(event) => {
                  const current = tabs.findIndex((item) => item.id === tab);
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : event.key === "ArrowRight"
                          ? (current + 1) % tabs.length
                          : event.key === "ArrowLeft"
                            ? (current + tabs.length - 1) % tabs.length
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const target = tabs[next]!;
                  selectTab(target.id);
                  dialogRef.current
                    ?.querySelector<HTMLElement>(`#tab-${target.id}`)
                    ?.focus({ preventScroll: true });
                }}
              >
                {tabs.map((item) => (
                  <button
                    type="button"
                    role="tab"
                    id={`tab-${item.id}`}
                    aria-controls={`pane-${item.id}`}
                    aria-selected={tab === item.id}
                    tabIndex={tab === item.id ? 0 : -1}
                    key={item.id}
                    onClick={() => selectTab(item.id)}
                  >
                    {item.label}
                    {item.id === "details" && (
                      <small>{capture.topics.length + entities.length}</small>
                    )}
                  </button>
                ))}
              </div>
              <a
                className="ui-btn ui-btn-default ask"
                href={`/app?tab=ask&q=${encodeURIComponent(`What does "${capture.title}" say?`)}`}
                aria-label="Ask about this capture"
              >
                <Sparkles aria-hidden="true" />
                <span>Ask about this</span>
              </a>
            </div>
            <div className="nv-body" ref={readerRef}>
              <div
                className="nv-pane"
                role="tabpanel"
                id="pane-note"
                aria-labelledby="tab-note"
                tabIndex={0}
                hidden={tab !== "note"}
              >
                {!hasMedia && <div className="nv-textonly">{source}</div>}
                {missingVideo && !hasMedia && (
                  <p className="nv-note">
                    Saved video unavailable. Use Open original to watch on{" "}
                    {platform}.
                  </p>
                )}
                {(capture.synopsis || capture.whyUseful) && (
                  <section className="nv-sec">
                    <h2>Bottom line</h2>
                    <p className="nv-prose">
                      {[capture.synopsis, capture.whyUseful]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                  </section>
                )}
                {claims.length > 0 && (
                  <details className="nv-claims">
                    <summary>
                      <TriangleAlert aria-hidden="true" />
                      <span>
                        {claims.length}{" "}
                        {claims.length === 1 ? "claim" : "claims"} to verify
                      </span>
                      <ChevronDown className="chev" aria-hidden="true" />
                    </summary>
                    <ul>
                      {claims.map((claim) => (
                        <li key={claim}>{claim}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {takeaways.length > 0 && (
                  <section className="nv-sec">
                    <h2>Key takeaways</h2>
                    <ul className="nv-takeaways">
                      {takeaways.map((takeaway) => (
                        <li key={takeaway}>{takeaway}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {actions.length > 0 && (
                  <section className="nv-sec">
                    <h2>Actions &amp; recommendations</h2>
                    <ul className="nv-actions">
                      {actions.map((action) => (
                        <li key={action}>
                          <span className="note-marker" aria-hidden="true" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {capture.analysis.evidence.length > 0 && (
                  <section className="nv-sec">
                    <h2>Evidence</h2>
                    <ul className="nv-evidence">
                      {capture.analysis.evidence.map((item, index) => {
                        const time = item.timestampSeconds;
                        const hasTime =
                          typeof time === "number" &&
                          Number.isFinite(time) &&
                          time >= 0;
                        return (
                          <li key={index}>
                            {hasTime &&
                              (video && !mediaError ? (
                                <button
                                  type="button"
                                  className="ts"
                                  aria-label={`Play from ${formatDuration(time)}`}
                                  onClick={() => play(time)}
                                >
                                  {formatDuration(time)}
                                </button>
                              ) : (
                                <span className="ts">
                                  {formatDuration(time)}
                                </span>
                              ))}
                            <span>
                              {item.claim} <em>({item.source})</em>
                              {item.quote ? ` — “${item.quote}”` : ""}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </div>
              <div
                className="nv-pane"
                role="tabpanel"
                id="pane-transcript"
                aria-labelledby="tab-transcript"
                tabIndex={0}
                hidden={tab !== "transcript"}
              >
                {capture.translatedTranscript && (
                  <>
                    <h2>
                      Translation ·{" "}
                      {languageName(capture.sourceLanguage || "und")} →{" "}
                      {languageName(capture.translationLanguage || "en")}
                    </h2>
                    <p className="note-preserve">
                      {capture.translatedTranscript}
                    </p>
                    <h2>Original</h2>
                  </>
                )}
                <p className="note-preserve">
                  {capture.transcript || "Unavailable"}
                </p>
              </div>
              <div
                className="nv-pane"
                role="tabpanel"
                id="pane-details"
                aria-labelledby="tab-details"
                tabIndex={0}
                hidden={tab !== "details"}
              >
                <dl className="nv-dl">
                  <div>
                    <dt>Filed in</dt>
                    <dd>
                      <span>{filedLabel}</span>
                      {canMove && (
                        <button
                          type="button"
                          className="nv-linkbtn"
                          onClick={() => setMoveOpen(true)}
                        >
                          {filing.state === "filed" ? "Move" : "File"}
                        </button>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Topics</dt>
                    <dd>
                      {capture.topics.length
                        ? capture.topics.map((topic) => (
                            <Chip key={topic}>{sentenceCase(topic)}</Chip>
                          ))
                        : "None recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      <a
                        className="url"
                        href={capture.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {capture.sourceUrl}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Source description</dt>
                    <dd className="note-preserve">
                      {capture.description || "Unavailable"}
                    </dd>
                  </div>
                  <div>
                    <dt>Creator</dt>
                    <dd>{creatorHandle(capture.creator)}</dd>
                  </div>
                  <div>
                    <dt>Saved</dt>
                    <dd>{savedLabel(capture.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Language</dt>
                    <dd>
                      {capture.sourceLanguage
                        ? languageName(capture.sourceLanguage)
                        : "Unavailable"}
                      {capture.translationLanguage &&
                      capture.translationLanguage !== capture.sourceLanguage
                        ? ` · translated to ${languageName(capture.translationLanguage)}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Also mentioned</dt>
                    <dd>
                      <div className="nv-mentions">
                        {entities.length
                          ? entities
                              .slice(0, showAllMentions ? undefined : 6)
                              .map((entity, index) => (
                                <span key={index}>
                                  <b>{entity.name}</b>
                                  <small>
                                    {sentenceCase(entity.type)}
                                    {entity.location
                                      ? ` · ${entity.location}`
                                      : ""}
                                  </small>
                                  {entity.description && (
                                    <span className="nv-entity-description">
                                      {entity.description}
                                    </span>
                                  )}
                                </span>
                              ))
                          : "None recorded"}
                      </div>
                      {entities.length > 6 && (
                        <button
                          type="button"
                          className="nv-linkbtn"
                          aria-expanded={showAllMentions}
                          onClick={() => setShowAllMentions(!showAllMentions)}
                        >
                          {showAllMentions
                            ? "Show fewer"
                            : `Show all ${entities.length}`}
                        </button>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Comments</dt>
                    <dd>
                      {capture.comments.length ? (
                        <details>
                          <summary>{capture.comments.length} comments</summary>
                          <ul className="nv-comments">
                            {capture.comments.map((comment, index) => (
                              <li key={index}>
                                <b>
                                  {comment.author || "Unknown"}
                                  {comment.isPinned ? " · Pinned" : ""}
                                </b>
                                <p>{comment.text}</p>
                                {comment.likeCount !== null && (
                                  <small>
                                    {comment.likeCount.toLocaleString()} likes
                                  </small>
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        "No comments were available from the platform."
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </>
        ) : (
          <>
            <header className="nv-head">
              <h1 id="capture-note-title">
                {loadError ? "Capture unavailable" : "Loading capture…"}
              </h1>
            </header>
            <div className="nv-body" aria-busy={!loadError}>
              {loadError ? (
                <div className="note-feedback" role="alert">
                  This capture could not be loaded.
                  <ActionButton
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    Retry
                  </ActionButton>
                </div>
              ) : (
                <p role="status">Loading capture…</p>
              )}
            </div>
          </>
        )}
        {moveOpen && capture && (
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
    </div>
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
      .filter(
        (option) =>
          !query || option.path.join(" / ").toLocaleLowerCase().includes(query),
      )
      .sort((a, b) => a.path.join(" / ").localeCompare(b.path.join(" / ")));
  }, [nodes, filter]);

  useDialogFocus(dialogRef, onClose);

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
          data-autofocus
          onChange={(event) => setFilter(event.target.value)}
        />
        <div
          className="note-move-list"
          role="radiogroup"
          aria-label="Categories"
        >
          {loadError ? (
            <p role="alert">Categories could not be loaded.</p>
          ) : nodes === null ? (
            <p role="status">Loading categories…</p>
          ) : options.length ? (
            options.map((option) => (
              <label
                key={option.id}
                className={cx(
                  "note-move-option",
                  selected === option.id && "is-selected",
                )}
              >
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
        {error && (
          <p className="note-dialog-error" role="alert">
            {error}
          </p>
        )}
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
