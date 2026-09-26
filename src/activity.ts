import {
  failureCodes,
  failureCopy,
  type FailureCode,
} from "./failures.js";
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
  /** One-indexed when the persisted history proves an attempt boundary. */
  attempt: number | null;
  createdAt: string;
  label: string;
  message: string | null;
  /** Controlled code for this event; null means history does not prove one. */
  failureCode: FailureCode | null;
  durationMs: number | null;
  state: ActivityEventState;
};

export type JobEventRecord = {
  id: string;
  status: string;
  message: string | null;
  failureCode: string | null;
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
  downloading: "media",
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
  "Retry scheduled",
  "AI title ready; extracting detailed knowledge",
]);

const retryQueueMessages = new Set([
  "Manual retry requested",
  "Retry scheduled",
]);

const safeHosts = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.watch",
  "instagram.com",
  "www.instagram.com",
]);
const displayQueryFields = new Set(["id", "story_fbid", "v"]);

function isJobStatus(value: string): value is JobStatus {
  return (jobStatuses as readonly string[]).includes(value);
}

function safeStatus(value: string): JobStatus {
  return isJobStatus(value) ? value : "failed";
}

function safeErrorCode(value: string | null, status: JobStatus) {
  if (status !== "failed") return null;
  return safeFailureCode(value) ?? "unknown";
}

function safeFailureCode(value: string | null): FailureCode | null {
  return (failureCodes as readonly string[]).includes(value ?? "")
    ? (value as FailureCode)
    : null;
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
      if (!displayQueryFields.has(key))
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
  return startAt === null || !Number.isFinite(end)
    ? null
    : Math.max(0, end - startAt);
}

type TimelineEvent = {
  id: string;
  status: JobStatus;
  message: string | null;
  failureCode: FailureCode | null;
  createdAt: string;
  attempt: number | null;
};

function legacyFailureCode(event: JobEventRecord): FailureCode | null {
  if (event.status !== "queued" || !event.message) return null;
  for (const code of failureCodes)
    if (event.message.startsWith(`${failureCopy(code).title}: `)) return code;
  return null;
}

function projectTimeline(events: JobEventRecord[]): TimelineEvent[] {
  const timeline: TimelineEvent[] = [];
  let attempt = 1;
  let attemptKnown = true;

  for (const event of events) {
    if (!isJobStatus(event.status)) {
      attemptKnown = false;
      continue;
    }
    const legacyCode = legacyFailureCode(event);
    const status = legacyCode ? "failed" : event.status;
    const prior = timeline.at(-1);
    const startsAttempt = Boolean(
      prior &&
        (prior.status === "failed" && status !== "failed" ||
          (status === "queued" && retryQueueMessages.has(event.message ?? ""))),
    );
    if (startsAttempt && attemptKnown) attempt += 1;

    // Pre-Activity retryable failures were stored as queued events whose
    // message contained a raw diagnostic. Only a known server-generated
    // failure prefix is safe to interpret. Keep every other event redacted
    // and decline to invent later attempt boundaries or timings.
    if (
      (!legacyCode &&
        status === "queued" &&
        event.message !== null &&
        !safeMessages.has(event.message)) ||
      timestamp(event.createdAt) === null
    )
      attemptKnown = false;

    timeline.push({
      id: event.id,
      status,
      message: event.message,
      failureCode:
        status === "failed"
          ? safeFailureCode(event.failureCode) ?? legacyCode
          : null,
      createdAt: event.createdAt,
      attempt: attemptKnown ? attempt : null,
    });
  }
  return timeline;
}

function projectEvents(
  job: JobRecord,
  events: JobEventRecord[],
  now: number,
): ActivityEvent[] {
  const status = safeStatus(job.status);
  const terminalAt = timestamp(job.updatedAt) ?? now;
  const timeline = projectTimeline(events);
  return timeline.map((event, index) => {
    const eventStatus = event.status;
    const next = timeline[index + 1];
    const nextInAttempt = event.attempt === null
      ? undefined
      : next?.attempt === event.attempt
        ? next
        : undefined;
    const nextAt = nextInAttempt ? timestamp(nextInAttempt.createdAt) : null;
    const isFinal = !nextInAttempt;
    const state: ActivityEventState = eventStatus === "failed"
      ? "failed"
      : !isFinal
      ? "completed"
      : status === "failed"
        ? "completed"
        : status === "complete"
          ? "completed"
          : eventStatus === "queued"
            ? "pending"
            : "running";
    const durationMs = event.attempt === null
      ? null
      : eventStatus === "failed"
      ? timestamp(event.createdAt) === null ? null : 0
      : state === "pending"
      ? null
      : elapsed(
          event.createdAt,
          nextAt ?? (isFinal && state === "running" ? now : terminalAt),
        );
    return {
      id: event.id,
      status: eventStatus,
      attempt: event.attempt,
      createdAt: event.createdAt,
      label: labels[eventStatus],
      message: safeMessages.has(event.message ?? "") ? event.message : null,
      failureCode: event.failureCode,
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
  const timeline = projectTimeline(events);
  const currentAttempt = timeline.at(-1)?.attempt;
  const currentEvents = currentAttempt === null
    ? timeline.filter((event) => event.attempt === null)
    : timeline.filter((event) => event.attempt === currentAttempt);
  const terminalAt = timestamp(updatedAt) ?? now;
  const durations = new Map<ActivityStageName, number>();
  const incompleteDurations = new Set<ActivityStageName>();
  const reached: ActivityStageName[] = [];
  let lastStage: ActivityStageName | null = null;

  currentEvents.forEach((event, index) => {
    const eventStatus = event.status;
    const stage = statusStages[eventStatus];
    if (!stage) return;
    if (stage !== "added" && !reached.includes("added")) {
      reached.push("added");
      incompleteDurations.add("added");
    }
    if (stage === "media" && !reached.includes("found")) {
      reached.push("found");
      durations.set("found", 0);
    }
    if (!reached.includes(stage)) reached.push(stage);
    lastStage = stage;
    const nextAt = currentEvents[index + 1]
      ? timestamp(currentEvents[index + 1]!.createdAt)
      : null;
    const end = nextAt ?? (status === "complete" || status === "failed" ? terminalAt : now);
    const duration = currentAttempt === null ? null : elapsed(event.createdAt, end);
    if (duration === null) incompleteDurations.add(stage);
    else durations.set(stage, (durations.get(stage) ?? 0) + duration);
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
      durationMs: incompleteDurations.has(name) ? null : durations.get(name) ?? null,
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
