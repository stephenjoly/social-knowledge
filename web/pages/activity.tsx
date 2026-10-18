import {
  Circle,
  CircleCheck,
  CircleX,
  Copy,
  Hourglass,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import type {
  ActivityStageName,
  ActivityStage,
  ActivityJob,
  ActivityEvent,
  ActivityDetails,
  ActivityCounts,
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

function rowStatus(job: ActivityJob): { text: string; tone: "live" | "done" | "warn" } {
  if (job.status === "failed") {
    const stage = failedStage(job);
    return {
      text: stage ? `Failed at ${activityStageCopy[stage]}` : failureFor(job).title,
      tone: "warn",
    };
  }
  if (job.status === "complete") {
    const total = job.stages.reduce((sum, stage) => sum + (stage.durationMs ?? 0), 0);
    return { text: total >= 1000 ? `Saved · ${formatCompactDuration(total)}` : "Saved", tone: "done" };
  }
  const label = activityStatusCopy[job.status] || "Processing";
  const active = job.stages.find((stage) => stage.state === "active");
  return {
    text: active?.durationMs && active.durationMs >= 1000
      ? `${label} · ${formatRunningClock(active.durationMs)}`
      : label,
    tone: "live",
  };
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
  return null;
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

export type ActivityFilter = "active" | "all";

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
  message: string;
  retryPending: boolean;
  retryingIds: string[];
  onRetry: (job: ActivityJob) => void;
  onRetryAll: () => void;
  onFixConnection: () => void;
};

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
  message,
  retryPending,
  retryingIds,
  onRetry,
  onRetryAll,
  onFixConnection,
}: ActivityViewProps) {
  const [copyFeedback, setCopyFeedback] = useState("");
  useEffect(() => {
    if (!selectedJobId && jobs[0]) onSelectJob(jobs[0].id);
  }, [selectedJobId, jobs[0]?.id]);
  useEffect(() => setCopyFeedback(""), [selectedJobId]);

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
  const inspect = (id: string) => {
    onSelectJob(id);
    if (window.matchMedia("(max-width: 1100px)").matches)
      document.getElementById("activity-inspector")?.scrollIntoView({ block: "start" });
  };

  return (
    <div className="activity-page">
      <div className="activity-header">
        <div className="activity-header-text">
          <span className="activity-kicker">Live progress</span>
          <h1>Activity</h1>
          <p>Every capture, from link to filed note.</p>
        </div>
        {message && (
          <p className="activity-feedback" role="status">
            {message}
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
          {showAttention && (
            <Card className="activity-attention" role="region" aria-labelledby="activity-attention-title">
              <div className="activity-card-head">
                <div>
                  <h2 id="activity-attention-title">Needs attention</h2>
                  <p>
                    {attentionTotal} {attentionTotal === 1 ? "capture" : "captures"} failed
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
                  {failedJobs.map((job) => {
                    const failure = failureFor(job);
                    const stage = failedStage(job);
                    const retrying = retryingIds.includes(job.id);
                    return (
                      <li className="activity-attention-item" key={job.id}>
                        <span className="activity-thumb large" aria-hidden="true">
                          <PlatformGlyph platform={sourcePlatform(job.normalizedUrl)} size={14} />
                        </span>
                        <button
                          type="button"
                          className="activity-attention-copy"
                          aria-pressed={selectedJobId === job.id}
                          onClick={() => inspect(job.id)}
                        >
                          <strong>{failure.title}</strong>
                          <span>
                            {[
                              sourceReference(job.normalizedUrl),
                              stage ? `failed at ${activityStageCopy[stage]}` : null,
                              `attempt ${job.attempts + 1}`,
                              formatActivityTime(job.updatedAt),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </button>
                        {job.errorCode === "authentication_required" && (
                          <ActionButton variant="ghost" onClick={onFixConnection}>
                            Fix connection
                          </ActionButton>
                        )}
                        {job.errorCode !== "unsupported_platform" && (
                          <ActionButton
                            icon={RotateCcw}
                            disabled={retryPending || retrying}
                            onClick={() => onRetry(job)}
                          >
                            {retrying ? "Retrying…" : "Retry"}
                          </ActionButton>
                        )}
                      </li>
                    );
                  })}
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
                <h2 id="activity-captures-title">Captures</h2>
                <p>Click a row to inspect its stages</p>
              </div>
              <Select
                className="activity-filter"
                aria-label="Filter captures"
                value={filter}
                onChange={(event) => onFilterChange(event.target.value as ActivityFilter)}
              >
                <option value="all">All statuses</option>
                <option value="active">In progress</option>
              </Select>
            </div>
            {loading && jobs.length === 0 ? (
              <p className="activity-empty">Loading capture activity…</p>
            ) : error ? (
              <p className="activity-empty" role="alert">{error}</p>
            ) : jobs.length === 0 ? (
              <p className="activity-empty">
                {filter === "active" ? "No captures processing now." : "No captures yet."}
              </p>
            ) : (
              <ul className="activity-rows">
                {jobs.map((job) => {
                  const status = rowStatus(job);
                  const selected = selectedJobId === job.id;
                  return (
                    <li key={job.id}>
                      <button
                        type="button"
                        className={cx(
                          "activity-row",
                          selected && "selected",
                          highlightedJobId === job.id && "highlighted",
                        )}
                        aria-pressed={selected}
                        aria-controls="activity-inspector"
                        onClick={() => inspect(job.id)}
                      >
                        <span
                          className="activity-thumb"
                          style={{ "--thumb": thumbTint(job) } as CSSProperties}
                          aria-hidden="true"
                        />
                        <span className="activity-row-text">
                          <strong>{job.displayTitle || sourceReference(job.normalizedUrl)}</strong>
                          <span>
                            {sourceLabel(job.normalizedUrl)} · {formatActivityTime(job.createdAt)}
                          </span>
                        </span>
                        <span className="activity-row-progress">
                          <Tracker job={job} />
                          <span className={`activity-row-status ${status.tone}`}>{status.text}</span>
                        </span>
                      </button>
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
                {loadingMore ? "Loading…" : "Load more captures"}
              </button>
            )}
          </Card>
        </div>

        <Card className="activity-inspector" id="activity-inspector" role="region" aria-label="Capture details">
          {!selectedJob ? (
            <p className="activity-empty">Select a capture to see its stages and logs.</p>
          ) : (
            <>
              <div className="activity-inspector-head">
                <h2>{selectedJob.displayTitle || sourceReference(selectedJob.normalizedUrl)}</h2>
                <p>
                  {sourceLabel(selectedJob.normalizedUrl)} · {formatActivityTime(selectedJob.createdAt)}
                </p>
                {selectedJob.status === "failed" && (
                  <p className="activity-inspector-failure">
                    <strong>{failureFor(selectedJob).title}.</strong> {failureFor(selectedJob).message}
                  </p>
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
                  const duration = formatStageDuration(stage);
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
              <div className="activity-log">
                <div className="activity-log-head">
                  <h3>Processing log</h3>
                  {showAttempts && <span>Includes previous attempts</span>}
                </div>
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
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
