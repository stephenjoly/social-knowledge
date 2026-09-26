import { failureCodes } from "./failures.js";
import { jobStatuses, type JobRecord, type JobStatus } from "./types.js";

export const activityStageNames = [
  "added",
  "found",
  "media",
  "text",
  "saved",
] as const;

export type ActivityStageName = (typeof activityStageNames)[number];
export type ActivityStageState =
  | "queued"
  | "active"
  | "completed"
  | "failed";
export type ActivityEventState =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export type ActivityStage = {
  name: ActivityStageName;
  state: ActivityStageState;
  durationMs: number | null;
};

export type ActivityJob = {
  id: string;
  status: JobStatus;
  normalizedUrl: string;
  displayTitle: string | null;
  attempts: number;
  errorCode: (typeof failureCodes)[number] | null;
  createdAt: string;
  updatedAt: string;
  reachedStages: ActivityStageName[];
  stages: ActivityStage[];
};

export type ActivityEvent = {
  id: string;
  status: JobStatus;
  createdAt: string;
  label: string;
  message: string | null;
  durationMs: number | null;
  state: ActivityEventState;
};

export type JobEventRecord = {
  id: string;
  status: string;
  message: string | null;
  createdAt: string;
};

const activeStatuses = new Set<JobStatus>([
  "downloading",
  "processing",
  "transcribing",
  "translating",
  "analyzing",
  "writing",
]);

const statusStages: Record<JobStatus, ActivityStageName | null> = {
  queued: "added",
  downloading: "found",
  processing: "media",
  transcribing: "text",
  translating: "text",
  analyzing: "text",
  writing: "saved",
  complete: "saved",
  failed: null,
};

const labels: Record<JobStatus, string> = {
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

const safeMessages = new Set([
  "Capture accepted",
  "Download started",
  "Capture archived",
  "Manual retry requested",
  "AI title ready; extracting detailed knowledge",
]);

const safeHosts = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.watch",
  "instagram.com",
  "www.instagram.com",
]);

function isJobStatus(value: string): value is JobStatus {
  return (jobStatuses as readonly string[]).includes(value);
}

function safeStatus(value: string): JobStatus {
  return isJobStatus(value) ? value : "failed";
}

function safeErrorCode(value: string | null, status: JobStatus) {
  if (status !== "failed") return null;
  return (failureCodes as readonly string[]).includes(value ?? "")
    ? (value as (typeof failureCodes)[number])
    : "unknown";
}

function safeNormalizedUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !safeHosts.has(url.hostname.toLowerCase()))
      throw new Error("unsafe_url");
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/(auth|cookie|key|password|secret|session|token)/i.test(key))
        url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return "https://www.facebook.com/";
  }
}

function safeTitle(value: string | null) {
  if (!value) return null;
  const title = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return title ? title.slice(0, 240) : null;
}

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function elapsed(start: string, end: number) {
  const startAt = timestamp(start);
  return startAt === null ? 0 : Math.max(0, end - startAt);
}

function currentAttemptStart(events: JobEventRecord[]) {
  let start = 0;
  for (let index = 1; index < events.length; index++) {
    if (events[index]!.status === "queued" && events[index - 1]!.status !== "queued")
      start = index;
  }
  return start;
}

function projectEvents(
  job: JobRecord,
  events: JobEventRecord[],
  now: number,
): ActivityEvent[] {
  const status = safeStatus(job.status);
  const terminalAt = timestamp(job.updatedAt) ?? now;
  const known = events.filter((event) => isJobStatus(event.status));
  return known.map((event, index) => {
    const eventStatus = event.status as JobStatus;
    const next = known[index + 1];
    const nextAt = next ? timestamp(next.createdAt) : null;
    const isFinal = !next;
    const state: ActivityEventState = !isFinal
      ? "completed"
      : status === "failed"
        ? "failed"
        : status === "complete"
          ? "completed"
          : eventStatus === "queued"
            ? "pending"
            : "running";
    const durationMs = state === "pending"
      ? null
      : elapsed(event.createdAt, nextAt ?? (isFinal ? terminalAt : now));
    return {
      id: event.id,
      status: eventStatus,
      createdAt: event.createdAt,
      label: labels[eventStatus],
      message: safeMessages.has(event.message ?? "") ? event.message : null,
      durationMs,
      state,
    };
  });
}

function projectStages(
  status: JobStatus,
  events: JobEventRecord[],
  updatedAt: string,
  now: number,
): { reachedStages: ActivityStageName[]; stages: ActivityStage[] } {
  const knownEvents = events.filter((event) => isJobStatus(event.status));
  const currentEvents = knownEvents.slice(currentAttemptStart(knownEvents));
  const terminalAt = timestamp(updatedAt) ?? now;
  const durations = new Map<ActivityStageName, number>();
  const reached: ActivityStageName[] = [];
  let lastStage: ActivityStageName | null = null;

  currentEvents.forEach((event, index) => {
    const eventStatus = event.status as JobStatus;
    const stage = statusStages[eventStatus];
    if (!stage) return;
    if (!reached.includes(stage)) reached.push(stage);
    lastStage = stage;
    const nextAt = currentEvents[index + 1]
      ? timestamp(currentEvents[index + 1]!.createdAt)
      : null;
    const end = nextAt ?? (status === "complete" || status === "failed" ? terminalAt : now);
    durations.set(stage, (durations.get(stage) ?? 0) + elapsed(event.createdAt, end));
  });

  const activeStage = activeStatuses.has(status) || status === "queued"
    ? statusStages[status]
    : null;
  const failedStage = status === "failed" ? lastStage : null;
  const stages = activityStageNames.map((name) => {
    const wasReached = reached.includes(name);
    const state: ActivityStageState = name === failedStage
      ? "failed"
      : name === activeStage
        ? "active"
      : wasReached
          ? "completed"
          : "queued";
    return {
      name,
      state,
      durationMs: durations.get(name) ?? null,
    };
  });
  return { reachedStages: reached, stages };
}

export function activityJob(
  job: JobRecord,
  events: JobEventRecord[],
  now = Date.now(),
): ActivityJob {
  const status = safeStatus(job.status);
  const stages = projectStages(status, events, job.updatedAt, now);
  const retryCount = events.filter(
    (event) => event.message === "Manual retry requested",
  ).length;
  return {
    id: job.id,
    status,
    normalizedUrl: safeNormalizedUrl(job.normalizedUrl),
    displayTitle: safeTitle(job.displayTitle),
    attempts: retryCount,
    errorCode: safeErrorCode(job.errorCode, status),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...stages,
  };
}

export function activityEvents(
  job: JobRecord,
  events: JobEventRecord[],
  now = Date.now(),
) {
  return projectEvents(job, events, now);
}
