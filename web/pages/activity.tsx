import {
  Archive,
  ArchiveRestore,
  ArrowUp,
  Bookmark,
  ChevronDown,
  Circle,
  CircleCheck,
  CircleX,
  Copy,
  ExternalLink,
  Hourglass,
  LoaderCircle,
  PlugZap,
  RotateCcw,
  Settings2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type {
  ActivityStageName,
  ActivityStage,
  ActivityJob,
  ActivityEvent,
  ActivityDetails,
  ActivityCounts,
  PlatformConnection,
} from "../shared/types";
import { formatPreciseDuration } from "../shared/format";
import { ActionButton, Card, Select, cx } from "../components/ui/primitives";
import "../activity.css";

export const activityStages: ActivityStageName[] = [
  "added",
  "found",
  "media",
  "text",
  "saved",
];
export const activityStageCopy: Record<ActivityStageName, string> = {
  added: "Added",
  found: "Found",
  media: "Media",
  text: "Text",
  saved: "Saved",
};
const stageChecklistCopy: Record<
  ActivityStageName,
  { done: string; active: string }
> = {
  added: { done: "Added", active: "Adding" },
  found: { done: "Found post", active: "Finding post" },
  media: { done: "Downloaded media", active: "Downloading media" },
  text: { done: "Transcribed", active: "Transcribing" },
  saved: { done: "Filed in knowledge base", active: "Filing in knowledge base" },
};
export const activityStatusCopy: Record<string, string> = {
  queued: "Queued",
  downloading: "Downloading media",
  processing: "Preparing media",
  transcribing: "Transcribing",
  translating: "Translating",
  analyzing: "Extracting knowledge",
  writing: "Filing in knowledge base",
  complete: "Saved",
  failed: "Needs attention",
};
const failureCopy: Record<string, { title: string; message: string }> = {
  unsupported_platform: {
    title: "URL saved; platform not supported",
    message: "Your URL is retained here. Media capture for this platform is not supported yet.",
  },
  ai_setup_required: {
    title: "URL saved; AI setup required",
    message: "Configure transcription and analysis in Settings, then retry this saved URL.",
  },
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

type SourcePlatform = "instagram" | "facebook" | null;

function sourcePlatform(url: string): SourcePlatform {
  try {
    const host = new URL(url).hostname;
    if (["instagram.com", "www.instagram.com"].includes(host)) return "instagram";
    if (["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch"].includes(host))
      return "facebook";
    return null;
  } catch {
    return null;
  }
}

export function failureFor(job: ActivityJob) {
  if (job.errorCode === "authentication_required") {
    const platform = sourcePlatform(job.normalizedUrl);
    if (platform) {
      const name = platform === "instagram" ? "Instagram" : "Facebook";
      return {
        title: `${name} session expired`,
        message: `Reconnect ${name} in Settings, then retry this capture.`,
      };
    }
  }
  if (job.errorCode && Object.hasOwn(failureCopy, job.errorCode))
    return failureCopy[job.errorCode]!;
  return {
    title: "Capture failed",
    message: "Retry this capture. If it fails again, check your capture setup.",
  };
}

/** "Instagram reel", "Facebook", or the bare host for unsupported sources. */
export function sourceLabel(url: string) {
  try {
    const parsed = new URL(url);
    const platform = sourcePlatform(url);
    if (platform === "instagram")
      return /^\/(reel|reels)\//.test(parsed.pathname) ? "Instagram reel" : "Instagram";
    if (platform === "facebook")
      return /^\/(reel|reels)\//.test(parsed.pathname) ? "Facebook reel" : "Facebook";
    return parsed.hostname;
  } catch {
    return "Social post";
  }
}

/** Host and path without the scheme, for captures that have no title yet. */
export function sourceReference(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    return `${host}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return "Social post";
  }
}

export function formatEventDuration(event: ActivityEvent) {
  if (event.state === "running") return "running";
  if (event.state === "pending") return "pending";
  return event.durationMs === null ? "—" : formatPreciseDuration(event.durationMs);
}

/** Finished work reads as "0.2s", "58s", or "1m 12s". */
function formatCompactDuration(durationMs: number) {
  if (durationMs < 100) return "<0.1s";
  if (durationMs < 10_000) return `${(durationMs / 1000).toFixed(1)}s`;
  if (durationMs < 60_000) return `${Math.round(durationMs / 1000)}s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** Running work reads as a clock: "0:42", "12:05". */
function formatRunningClock(durationMs: number) {
  const total = Math.floor(durationMs / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function formatStageDuration(stage: ActivityStage | undefined) {
  if (!stage || stage.state === "queued") return "";
  if (stage.state === "failed") return "Failed";
  if (stage.durationMs === null) return stage.state === "active" ? "running" : "—";
  return stage.state === "active"
    ? formatRunningClock(stage.durationMs)
    : formatCompactDuration(stage.durationMs);
}

export function formatActivityTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

export function formatEventTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
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

export function safeActivityEvent(event: ActivityEvent): ActivityEvent | null {
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

function stageFor(job: ActivityJob, name: ActivityStageName) {
  return job.stages.find((stage) => stage.name === name);
}

function failedStage(job: ActivityJob) {
  return job.stages.find((stage) => stage.state === "failed")?.name ?? null;
}

/** One name for a capture everywhere it appears: its title, else its link. */
export function jobIdentity(job: ActivityJob) {
  return job.displayTitle || sourceReference(job.normalizedUrl);
}

export function canArchive(job: ActivityJob) {
  return job.status === "failed" && job.errorCode === "unsupported_platform" && !job.archivedAt;
}

function platformLabel(platform: SourcePlatform) {
  return platform === "instagram" ? "Instagram" : platform === "facebook" ? "Facebook" : null;
}

type RowStatus = { text: string; next: string; tone: "live" | "done" | "warn" };

/** The routine view: what state the capture is in and whether anything is needed from you. */
export function rowStatus(job: ActivityJob): RowStatus {
  if (job.archivedAt) return { text: "Archived", next: "Link kept", tone: "done" };
  if (job.status === "failed")
    return {
      text: job.errorCode === "unsupported_platform" ? "Bookmark" : "Needs attention",
      next: "See Needs attention",
      tone: "warn",
    };
  if (job.status === "complete") return { text: "Saved", next: "Ready in Inbox", tone: "done" };
  if (job.status === "queued") return { text: "Queued", next: "No action needed", tone: "live" };
  return {
    text: activityStatusCopy[job.status] || "Processing",
    next: "No action needed",
    tone: "live",
  };
}

function inspectorSummary(job: ActivityJob) {
  if (job.archivedAt)
    return `Archived ${formatActivityTime(job.archivedAt)}. The link and its history are kept; restore it to show it in Needs attention again.`;
  if (job.status === "complete") return "Saved to your archive. Find it in Inbox.";
  if (job.status === "queued")
    return "Waiting to start. No action needed; it appears in Inbox when saved.";
  return `${activityStatusCopy[job.status] || "Processing"}. No action needed; it appears in Inbox when saved.`;
}

function safeSourceHref(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}


const thumbTints = ["#f1e6d6", "#e1e7f0", "#e6e9df", "#f0e1e1", "#e3ebe5"];

function thumbTint(job: ActivityJob) {
  if (!job.displayTitle) return "var(--subtle)";
  let hash = 0;
  for (const char of job.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return thumbTints[hash % thumbTints.length];
}

function PlatformGlyph({ platform, size }: { platform: SourcePlatform; size: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
  if (platform === "facebook")
    return (
      <svg {...common}>
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    );
  if (platform === "instagram")
    return (
      <svg {...common}>
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    );
  return <Bookmark width={size} height={size} aria-hidden="true" focusable="false" />;
}

function Tracker({ job }: { job: ActivityJob }) {
  return (
    <span className="activity-tracker" aria-hidden="true">
      {activityStages.map((name) => (
        <span
          key={name}
          className={`activity-tracker-step ${stageFor(job, name)?.state ?? "queued"}`}
        />
      ))}
    </span>
  );
}

const stageIcons: Record<ActivityStage["state"], LucideIcon> = {
  completed: CircleCheck,
  active: LoaderCircle,
  failed: CircleX,
  queued: Circle,
};

export type ActivityFilter = "active" | "all" | "archived";

export type ActivityNotice = { text: string; undo?: () => void };

export type ActivityViewProps = {
  jobs: ActivityJob[];
  counts: ActivityCounts;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  nextCursor: string | null;
  onLoadMore: () => void;
  filter: ActivityFilter;
  onFilterChange: (filter: ActivityFilter) => void;
  failedJobs: ActivityJob[];
  attentionTotal: number;
  failedError: boolean;
  failedNextCursor: string | null;
  failedLoadingMore: boolean;
  onLoadMoreFailed: () => void;
  onReloadFailed: () => void;
  selectedJobId: string | null;
  onSelectJob: (id: string | null) => void;
  jobDetails: ActivityDetails | null;
  detailsLoading: boolean;
  detailsError: boolean;
  highlightedJobId: string | null;
  notice: ActivityNotice | null;
  retryPending: boolean;
  retryingIds: string[];
  archivingIds: string[];
  connections: PlatformConnection[];
  onRetry: (job: ActivityJob) => void;
  onRetryAll: () => void;
  onFixConnection: (job: ActivityJob) => void;
  onSetUpAi: (job: ActivityJob) => void;
  onArchive: (job: ActivityJob) => void;
  onRestore: (job: ActivityJob) => void;
};

/** The fixes a failure offers, in the order a user should try them. */
function FailureActions({
  job,
  connections,
  retryPending,
  retrying,
  archiving,
  onRetry,
  onFixConnection,
  onSetUpAi,
  onArchive,
}: {
  job: ActivityJob;
  connections: PlatformConnection[];
  retryPending: boolean;
  retrying: boolean;
  archiving: boolean;
  onRetry: (job: ActivityJob) => void;
  onFixConnection: (job: ActivityJob) => void;
  onSetUpAi: (job: ActivityJob) => void;
  onArchive: (job: ActivityJob) => void;
}) {
  const identity = jobIdentity(job);
  const retryButton = (variant: "default" | "ghost") => (
    <ActionButton
      icon={RotateCcw}
      variant={variant}
      disabled={retryPending || retrying}
      aria-label={`Retry ${identity}`}
      onClick={() => onRetry(job)}
    >
      {retrying ? "Retrying…" : "Retry"}
    </ActionButton>
  );
  if (job.errorCode === "unsupported_platform")
    return job.archivedAt ? null : (
      <ActionButton
        icon={Archive}
        disabled={archiving}
        aria-label={`Archive bookmark ${identity}`}
        onClick={() => onArchive(job)}
      >
        {archiving ? "Archiving…" : "Archive"}
      </ActionButton>
    );
  if (job.errorCode === "authentication_required") {
    const platform = sourcePlatform(job.normalizedUrl);
    const name = platformLabel(platform) ?? "account";
    const healthy = connections.find((item) => item.platform === platform)?.status === "connected";
    return (
      <>
        <ActionButton variant={healthy ? "ghost" : "default"} icon={PlugZap} onClick={() => onFixConnection(job)}>
          {`Reconnect ${name}`}
        </ActionButton>
        {retryButton(healthy ? "default" : "ghost")}
      </>
    );
  }
  if (job.errorCode === "ai_setup_required")
    return (
      <>
        <ActionButton icon={Settings2} onClick={() => onSetUpAi(job)}>
          Set up AI
        </ActionButton>
        {retryButton("ghost")}
      </>
    );
  return retryButton("default");
}

/** Short next-step line under an attention item; the full explanation lives in the inspector. */
function attentionNext(job: ActivityJob, connections: PlatformConnection[]) {
  if (job.errorCode === "authentication_required") {
    const platform = sourcePlatform(job.normalizedUrl);
    const name = platformLabel(platform);
    if (name) {
      const healthy = connections.find((item) => item.platform === platform)?.status === "connected";
      return healthy
        ? `${name} is reconnected. Retry this capture.`
        : `Reconnect ${name} first, then retry.`;
    }
  }
  if (job.errorCode === "unsupported_platform")
    return "Link kept as a bookmark. Archive it to clear it from here.";
  if (job.errorCode === "ai_setup_required") return "Set up AI, then retry this saved link.";
  return failureFor(job).message;
}

export function ActivityView({
  jobs,
  counts,
  loading,
  loadingMore,
  error,
  nextCursor,
  onLoadMore,
  filter,
  onFilterChange,
  failedJobs,
  attentionTotal,
  failedError,
  failedNextCursor,
  failedLoadingMore,
  onLoadMoreFailed,
  onReloadFailed,
  selectedJobId,
  onSelectJob,
  jobDetails,
  detailsLoading,
  detailsError,
  highlightedJobId,
  notice,
  retryPending,
  retryingIds,
  archivingIds,
  connections,
  onRetry,
  onRetryAll,
  onFixConnection,
  onSetUpAi,
  onArchive,
  onRestore,
}: ActivityViewProps) {
  const [copyFeedback, setCopyFeedback] = useState("");
  const [troubleshooting, setTroubleshooting] = useState(false);
  const inspectorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedJobId && jobs[0]) onSelectJob(jobs[0].id);
  }, [selectedJobId, jobs[0]?.id]);
  useEffect(() => setCopyFeedback(""), [selectedJobId]);
  const listed = jobs.some((job) => job.id === highlightedJobId) || failedJobs.some((job) => job.id === highlightedJobId);
  useEffect(() => {
    if (!highlightedJobId || !listed) return;
    // Returning from a fix lands on the affected item, preferring its attention entry and actions.
    const frame = window.requestAnimationFrame(() => {
      const id = CSS.escape(highlightedJobId);
      const target = window.matchMedia("(max-width: 1100px)").matches
        ? inspectorRef.current
        : document.querySelector<HTMLElement>(`[data-job-id="${id}"] .activity-attention-copy`) ??
          document.querySelector<HTMLElement>(`[data-job-row="${id}"]`);
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedJobId, listed]);

  const selectedJob =
    jobs.find((job) => job.id === selectedJobId) ??
    failedJobs.find((job) => job.id === selectedJobId) ??
    (jobDetails?.job.id === selectedJobId ? jobDetails.job : null);
  const events =
    selectedJob && jobDetails?.job.id === selectedJob.id ? jobDetails.events : [];
  const safeEvents = events
    .map(safeActivityEvent)
    .filter((event): event is ActivityEvent => event !== null);
  const showAttempts = new Set(safeEvents.map((event) => event.attempt ?? 0)).size > 1;

  async function copyActivityLogs() {
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

  const stats: Array<[string, number, LucideIcon, string]> = [
    ["Processing", counts.active, LoaderCircle, "processing"],
    ["Queued", counts.queued, Hourglass, "queued"],
    ["Needs attention", attentionTotal, TriangleAlert, "attention"],
    ["Saved today", counts.savedToday, CircleCheck, "saved"],
  ];
  const showAttention = attentionTotal > 0 || failedError || failedJobs.length > 0;
  const stacked = () => window.matchMedia("(max-width: 1100px)").matches;
  const inspect = (id: string) => {
    onSelectJob(id);
    if (!stacked()) return;
    const inspector = inspectorRef.current;
    inspector?.scrollIntoView({ block: "start" });
    inspector?.focus({ preventScroll: true });
  };
  const backToCaptures = () => {
    const row =
      (selectedJobId &&
        document.querySelector<HTMLElement>(`[data-job-row="${CSS.escape(selectedJobId)}"]`)) ||
      document.getElementById("activity-captures-title");
    row?.scrollIntoView({ block: "center" });
    row?.focus({ preventScroll: true });
  };

  return (
    <div className="activity-page">
      <div className="activity-header">
        <div className="activity-header-text">
          <span className="activity-kicker">Live progress</span>
          <h1>Activity</h1>
          <p>Every capture, from link to filed note.</p>
        </div>
        {notice && (
          <p className="activity-feedback" role="status">
            {notice.text}
            {notice.undo && (
              <>
                {" "}
                <button type="button" className="activity-inline-action" onClick={notice.undo}>
                  Undo
                </button>
              </>
            )}
          </p>
        )}
        <ActionButton
          icon={RotateCcw}
          onClick={onRetryAll}
          disabled={retryPending || attentionTotal === 0}
        >
          {retryPending ? "Retrying…" : "Retry all failed"}
        </ActionButton>
      </div>

      <section className="activity-stats" aria-label="Activity summary">
        {stats.map(([label, value, Icon, kind]) => (
          <Card className={`activity-stat ${kind}`} key={kind}>
            <span className="activity-stat-label">
              <Icon size={14} aria-hidden="true" focusable="false" />
              {label}
            </span>
            <strong>{value}</strong>
          </Card>
        ))}
      </section>

      <div className="activity-body">
        <div className="activity-main">
          {showAttention && filter !== "archived" && (
            <Card className="activity-attention" role="region" aria-labelledby="activity-attention-title">
              <div className="activity-card-head">
                <div>
                  <h2 id="activity-attention-title">Needs attention</h2>
                  <p>
                    {attentionTotal} {attentionTotal === 1 ? "capture needs" : "captures need"} a decision from you
                  </p>
                </div>
              </div>
              {failedError ? (
                <p className="activity-empty" role="alert">
                  Unable to load failures.{" "}
                  <button type="button" className="activity-inline-action" onClick={onReloadFailed}>
                    Retry list
                  </button>
                </p>
              ) : (
                <ul className="activity-attention-list">
                  {failedJobs.map((job) => (
                    <li className="activity-attention-item" key={job.id} data-job-id={job.id}>
                      <span className="activity-thumb large" aria-hidden="true">
                        <PlatformGlyph platform={sourcePlatform(job.normalizedUrl)} size={14} />
                      </span>
                      <button
                        type="button"
                        className="activity-attention-copy"
                        aria-pressed={selectedJobId === job.id}
                        aria-controls="activity-inspector"
                        onClick={() => inspect(job.id)}
                      >
                        <strong>{jobIdentity(job)}</strong>
                        <span className="activity-attention-reason">
                          {failureFor(job).title} · {formatActivityTime(job.updatedAt)}
                        </span>
                        <span>{attentionNext(job, connections)}</span>
                      </button>
                      <span className="activity-attention-actions">
                        <FailureActions
                          job={job}
                          connections={connections}
                          retryPending={retryPending}
                          retrying={retryingIds.includes(job.id)}
                          archiving={archivingIds.includes(job.id)}
                          onRetry={onRetry}
                          onFixConnection={onFixConnection}
                          onSetUpAi={onSetUpAi}
                          onArchive={onArchive}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {failedNextCursor && (
                <button
                  type="button"
                  className="activity-more"
                  disabled={failedLoadingMore}
                  onClick={onLoadMoreFailed}
                >
                  {failedLoadingMore ? "Loading…" : "Load more failures"}
                </button>
              )}
            </Card>
          )}

          <Card className="activity-captures" role="region" aria-labelledby="activity-captures-title">
            <div className="activity-card-head">
              <div>
                <h2 id="activity-captures-title" tabIndex={-1}>
                  {filter === "archived" ? "Archived bookmarks" : "Captures"}
                </h2>
                <p>
                  {filter === "archived"
                    ? "Links kept out of Needs attention. Restore one to show it again."
                    : "Select a capture to see its details"}
                </p>
              </div>
              <Select
                className="activity-filter"
                aria-label="Filter captures"
                value={filter}
                onChange={(event) => onFilterChange(event.target.value as ActivityFilter)}
              >
                <option value="all">All statuses</option>
                <option value="active">In progress</option>
                <option value="archived">Archived</option>
              </Select>
            </div>
            {loading && jobs.length === 0 ? (
              <p className="activity-empty">Loading capture activity…</p>
            ) : error ? (
              <p className="activity-empty" role="alert">{error}</p>
            ) : jobs.length === 0 ? (
              <p className="activity-empty">
                {filter === "active"
                  ? "No captures processing now."
                  : filter === "archived"
                    ? "No archived bookmarks."
                    : "No captures yet."}
              </p>
            ) : (
              <ul className="activity-rows">
                {jobs.map((job) => {
                  const status = rowStatus(job);
                  const selected = selectedJobId === job.id;
                  const restoring = archivingIds.includes(job.id);
                  return (
                    <li key={job.id} className={cx(job.archivedAt && "has-action")}>
                      <button
                        type="button"
                        className={cx(
                          "activity-row",
                          selected && "selected",
                          highlightedJobId === job.id && "highlighted",
                        )}
                        data-job-row={job.id}
                        aria-pressed={selected}
                        aria-controls="activity-inspector"
                        onClick={() => inspect(job.id)}
                      >
                        <span
                          className="activity-thumb"
                          style={{ "--thumb": thumbTint(job) } as CSSProperties}
                          aria-hidden="true"
                        >
                          {!job.displayTitle && (
                            <PlatformGlyph platform={sourcePlatform(job.normalizedUrl)} size={13} />
                          )}
                        </span>
                        <span className="activity-row-text">
                          <strong>{jobIdentity(job)}</strong>
                          <span>
                            {sourceLabel(job.normalizedUrl)} · {formatActivityTime(job.createdAt)}
                          </span>
                        </span>
                        <span className="activity-row-progress">
                          <span className={`activity-row-status ${status.tone}`}>{status.text}</span>
                          {!job.archivedAt && <Tracker job={job} />}
                          <span className="activity-row-next">{status.next}</span>
                        </span>
                      </button>
                      {job.archivedAt && (
                        <ActionButton
                          className="activity-row-action"
                          icon={ArchiveRestore}
                          disabled={restoring}
                          aria-label={`Restore bookmark ${jobIdentity(job)}`}
                          onClick={() => onRestore(job)}
                        >
                          {restoring ? "Restoring…" : "Restore"}
                        </ActionButton>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {nextCursor && (
              <button
                type="button"
                className="activity-more"
                disabled={loadingMore}
                onClick={onLoadMore}
              >
                {loadingMore ? "Loading…" : filter === "archived" ? "Load more archived" : "Load more captures"}
              </button>
            )}
          </Card>
        </div>

        <Card
          className="activity-inspector"
          id="activity-inspector"
          role="region"
          aria-label="Capture details"
          ref={inspectorRef}
          tabIndex={-1}
        >
          {!selectedJob ? (
            <p className="activity-empty">Select a capture to see its details.</p>
          ) : (
            <>
              <div className="activity-inspector-head">
                <button type="button" className="activity-inspector-back" onClick={backToCaptures}>
                  <ArrowUp size={13} aria-hidden="true" />
                  Back to captures
                </button>
                <h2>{jobIdentity(selectedJob)}</h2>
                <p>
                  {sourceLabel(selectedJob.normalizedUrl)} · {formatActivityTime(selectedJob.createdAt)}
                </p>
                {selectedJob.status === "failed" && !selectedJob.archivedAt ? (
                  <p className="activity-inspector-failure">
                    <strong>{failureFor(selectedJob).title}.</strong> {failureFor(selectedJob).message}
                  </p>
                ) : (
                  <p className={cx("activity-inspector-summary", rowStatus(selectedJob).tone)}>
                    {inspectorSummary(selectedJob)}
                  </p>
                )}
                {(selectedJob.status === "failed" || selectedJob.archivedAt) && (
                  <div className="activity-inspector-actions">
                    {selectedJob.archivedAt ? (
                      <ActionButton
                        icon={ArchiveRestore}
                        disabled={archivingIds.includes(selectedJob.id)}
                        onClick={() => onRestore(selectedJob)}
                      >
                        {archivingIds.includes(selectedJob.id) ? "Restoring…" : "Restore"}
                      </ActionButton>
                    ) : (
                      <FailureActions
                        job={selectedJob}
                        connections={connections}
                        retryPending={retryPending}
                        retrying={retryingIds.includes(selectedJob.id)}
                        archiving={archivingIds.includes(selectedJob.id)}
                        onRetry={onRetry}
                        onFixConnection={onFixConnection}
                        onSetUpAi={onSetUpAi}
                        onArchive={onArchive}
                      />
                    )}
                  </div>
                )}
                {safeSourceHref(selectedJob.normalizedUrl) && (
                  <a
                    className="activity-inspector-source"
                    href={safeSourceHref(selectedJob.normalizedUrl)!}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Open original link
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </div>
              <ol className="activity-checklist" aria-label="Stages">
                {activityStages.map((name) => {
                  const stage = stageFor(selectedJob, name);
                  const state = stage?.state ?? "queued";
                  const Icon = stageIcons[state];
                  const label =
                    state === "active"
                      ? stageChecklistCopy[name].active
                      : stageChecklistCopy[name].done;
                  const duration = troubleshooting ? formatStageDuration(stage) : "";
                  return (
                    <li className={`activity-check ${state}`} key={name}>
                      <Icon size={16} aria-hidden="true" focusable="false" />
                      <span className="activity-check-label">{label}</span>
                      <span className="activity-check-duration">
                        {duration}
                        <span className="activity-visually-hidden">
                          {state === "queued" ? "Not started" : state === "completed" ? "" : ` ${state}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                className="activity-disclosure"
                aria-expanded={troubleshooting}
                aria-controls="activity-troubleshooting"
                onClick={() => setTroubleshooting((open) => !open)}
              >
                <ChevronDown size={14} aria-hidden="true" />
                {troubleshooting ? "Hide timing and logs" : "Show timing and logs"}
              </button>
              <div id="activity-troubleshooting" className="activity-troubleshooting" hidden={!troubleshooting}>
                <div className="activity-log">
                  <div className="activity-log-head">
                    <h3>Processing log</h3>
                    {showAttempts && <span>Includes previous attempts</span>}
                  </div>
                  {failedStage(selectedJob) && (
                    <p className="activity-attempts">
                      Stopped at: {activityStageCopy[failedStage(selectedJob)!]}
                    </p>
                  )}
                  {selectedJob.attempts > 0 && (
                    <p className="activity-attempts">
                      Download attempts this run: {selectedJob.attempts}
                    </p>
                  )}
                  {detailsLoading && events.length === 0 ? (
                    <p>Loading logs…</p>
                  ) : detailsError ? (
                    <p role="alert">Logs are unavailable. Select the capture again to retry.</p>
                  ) : safeEvents.length > 0 ? (
                    <ol tabIndex={0} aria-label="Processing log entries">
                      {safeEvents.map((event) => (
                        <li className={event.state} key={event.id}>
                          <time dateTime={event.createdAt}>{formatEventTime(event.createdAt)}</time>
                          <span>
                            {event.label}
                            {event.message && ` · ${event.message}`}
                            {showAttempts && event.attempt && ` · attempt ${event.attempt}`}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>Safe processing events will appear here.</p>
                  )}
                </div>
                <div className="activity-inspector-foot">
                  <ActionButton icon={Copy} onClick={() => void copyActivityLogs()}>
                    Copy safe logs
                  </ActionButton>
                  {copyFeedback && (
                    <span className="activity-copy-feedback" role="status">
                      {copyFeedback}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
