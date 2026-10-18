import { ChevronDown, Copy, RotateCw } from "lucide-react";
import { useState } from "react";
import type {
  ActivityStageName,
  ActivityStage,
  ActivityJob,
  ActivityEvent,
  ActivityDetails,
  ActivityCounts,
} from "../shared/types";
import { platformFor, formatPreciseDuration } from "../shared/format";

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
    const host = parsed.hostname;
    const platform = ["instagram.com", "www.instagram.com"].includes(host) ? "Instagram" : ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.watch"].includes(host) ? "Facebook" : host;
    return `${platform} · ${parsed.pathname.replace(/\/$/, "").split("/").pop() || "post"}`;
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
};

export function ActivityView({
  jobs: visibleActivityJobs,
  counts: activityCounts,
  loading: activityLoading,
  loadingMore: activityLoadingMore,
  error: activityError,
  nextCursor: activityNextCursor,
  onLoadMore,
  filter: activityFilter,
  onFilterChange: setActivityFilter,
  failedJobs,
  attentionTotal,
  failedError,
  failedNextCursor,
  failedLoadingMore,
  onLoadMoreFailed,
  onReloadFailed,
  selectedJobId: expandedJobId,
  onSelectJob: setExpandedJobId,
  jobDetails,
  detailsLoading,
  detailsError,
  highlightedJobId: highlightedJob,
  message,
  retryPending,
  retryingIds,
  onRetry: retryJob,
  onRetryAll: retryAll,
}: ActivityViewProps) {
  const [copyFeedback, setCopyFeedback] = useState("");
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
  return (
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
                {activityNextCursor && <button type="button" className="activity-load-more" disabled={activityLoadingMore} onClick={onLoadMore}>{activityLoadingMore ? "Loading…" : "Load more captures"}</button>}
              </section>
              <section className="activity-attention" aria-labelledby="attention-title">
                <div className="activity-attention-heading">
                  <div><h2 id="attention-title">Needs attention</h2><span>{attentionTotal} {attentionTotal === 1 ? "item" : "items"}</span><small>Highest priority first</small></div>
                  <button type="button" onClick={retryAll} disabled={retryPending || attentionTotal === 0}><RotateCw aria-hidden="true" />{retryPending ? "Retrying…" : "Retry all"}</button>
                </div>
                <div className="activity-attention-list" role="list">
                  {failedError ? <p role="alert">Unable to load failures. <button type="button" onClick={onReloadFailed}>Retry list</button></p> : failedJobs.length === 0 ? <p>Nothing needs attention.</p> : failedJobs.map((job) => (
                    <div className="activity-attention-item" role="listitem" key={job.id}>
                      <span className="activity-attention-dot" aria-hidden="true" />
                      <div><strong>{job.displayTitle || sourceReference(job.normalizedUrl)}</strong><small>{sourceLabel(job.normalizedUrl)} · {failureFor(job).message}</small></div>
                      <span className="activity-retry-count">{job.attempts} manual {job.attempts === 1 ? "retry" : "retries"}</span>
                      {job.errorCode !== "unsupported_platform" && <button type="button" disabled={retryPending || retryingIds.includes(job.id)} onClick={() => retryJob(job)}>{retryingIds.includes(job.id) ? "Retrying…" : "Retry"}</button>}
                    </div>
                  ))}
                  {failedNextCursor && <button type="button" className="activity-failed-more" disabled={failedLoadingMore} onClick={onLoadMoreFailed}>{failedLoadingMore ? "Loading…" : "Load more"}</button>}
                </div>
              </section>
            </div>
  );
}
