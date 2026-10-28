import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ActivityView,
  failureFor,
  formatStageDuration,
  safeActivityEvent,
  sourceLabel,
  sourceReference,
  type ActivityViewProps,
} from "../web/pages/activity";
import type {
  ActivityEvent,
  ActivityJob,
  ActivityStageName,
} from "../web/shared/types";

const names: ActivityStageName[] = ["added", "found", "media", "text", "saved"];

function job(
  id: string,
  status: string,
  options: { active?: ActivityStageName; failedAt?: ActivityStageName; errorCode?: string; url?: string; title?: string | null } = {},
): ActivityJob {
  const pivot = options.failedAt ?? options.active ?? (status === "complete" ? null : "added");
  return {
    id,
    status,
    normalizedUrl: options.url ?? `https://www.instagram.com/reel/${id}/`,
    displayTitle: options.title === undefined ? `Title ${id}` : options.title,
    attempts: 0,
    errorCode: options.errorCode ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reachedStages: [],
    stages: names.map((name) => ({
      name,
      state: pivot === null || names.indexOf(name) < names.indexOf(pivot)
        ? "completed"
        : name === pivot
          ? options.failedAt ? "failed" : "active"
          : "queued",
      durationMs: name === pivot ? 42_000 : 2_100,
    })),
  };
}

const event = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
  id: "event",
  status: "queued",
  createdAt: "2026-10-18T14:02:11.000Z",
  label: "Queued",
  message: null,
  durationMs: 100,
  state: "completed",
  ...overrides,
});

function render(overrides: Partial<ActivityViewProps> = {}) {
  const noop = () => undefined;
  const props: ActivityViewProps = {
    jobs: [],
    counts: { active: 0, queued: 0, failed: 0, savedToday: 0, recentEvents: 0 },
    loading: false,
    loadingMore: false,
    error: null,
    nextCursor: null,
    onLoadMore: noop,
    filter: "all",
    onFilterChange: noop,
    failedJobs: [],
    attentionTotal: 0,
    failedError: false,
    failedNextCursor: null,
    failedLoadingMore: false,
    onLoadMoreFailed: noop,
    onReloadFailed: noop,
    selectedJobId: null,
    onSelectJob: noop,
    jobDetails: null,
    detailsLoading: false,
    detailsError: false,
    highlightedJobId: null,
    notice: null,
    retryPending: false,
    retryingIds: [],
    archivingIds: [],
    connections: [],
    onRetry: noop,
    onRetryAll: noop,
    onFixConnection: noop,
    onSetUpAi: noop,
    onArchive: noop,
    onRestore: noop,
    ...overrides,
  };
  return renderToStaticMarkup(<ActivityView {...props} />);
}

describe("Activity page", () => {
  it("shows the four live counts from ActivityCounts", () => {
    const html = render({
      counts: { active: 2, queued: 1, failed: 1, savedToday: 6, recentEvents: 9 },
      attentionTotal: 3,
    });
    for (const [label, value] of [["Processing", 2], ["Queued", 1], ["Needs attention", 3], ["Saved today", 6]])
      expect(html).toMatch(new RegExp(`${label}</span><strong>${value}</strong>`));
  });

  it("offers Fix connection only for expired sessions and never retries unsupported URLs", () => {
    const session = job("session", "failed", { failedAt: "media", errorCode: "authentication_required", url: "https://www.facebook.com/share/r/abc/" });
    const bookmark = job("bookmark", "failed", { failedAt: "added", errorCode: "unsupported_platform", url: "https://www.tiktok.com/@a/video/1", title: null });
    const html = render({ failedJobs: [session, bookmark], attentionTotal: 2 });
    expect(html).toContain("Facebook session expired");
    expect(html).toContain("Reconnect Facebook first, then retry.");
    expect(html.match(/>Reconnect Facebook</g)).toHaveLength(1);
    expect(html.match(/>Retry</g)).toHaveLength(1);
    expect(html).toContain("tiktok.com/@a/video/1");
  });

  it("hides the attention panel when nothing failed and disables Retry all failed", () => {
    const html = render();
    expect(html).not.toContain("activity-attention");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Retry all failed/);
  });

  it("drives the inspector from the selected row and only prints safe log lines", () => {
    const running = job("running", "transcribing", { active: "text" });
    const html = render({
      jobs: [running, job("saved", "complete")],
      selectedJobId: "running",
      highlightedJobId: "saved",
      jobDetails: {
        job: running,
        events: [
          event({ id: "a", message: "Capture accepted" }),
          event({ id: "b", status: "processing", message: "secret=value /private/internal/cookie.txt" }),
          event({ id: "c", status: "not-a-status", message: "Capture accepted" }),
        ],
      },
    });
    expect(html).toMatch(/class="activity-row selected"[^>]*aria-pressed="true"/);
    expect(html).toContain('class="activity-row highlighted"');
    expect(html).toContain("Transcribing. No action needed; it appears in Inbox when saved.");
    expect(html).toContain("Show timing and logs");
    expect(html).toMatch(/id="activity-troubleshooting"[^>]*hidden=""/);
    expect(html).toContain("Downloaded media");
    expect(html).toContain("Queued · Capture accepted");
    expect(html).toContain("Processing media");
    expect(html).not.toContain("secret=value");
    expect(html).not.toContain("/private/internal");
    expect(html).not.toContain("not-a-status");
    expect(html).toContain("Copy safe logs");
  });

  it("keeps empty, loading, and error states for the captures list", () => {
    expect(render({ loading: true })).toContain("Loading capture activity…");
    expect(render({ error: "Unable to load capture activity. Try again." })).toContain('role="alert"');
    expect(render({ filter: "active" })).toContain("No captures processing now.");
    expect(render({ failedError: true })).toContain("Retry list");
  });
});

describe("Activity helpers", () => {
  it("labels sources without exposing more than host and path", () => {
    expect(sourceLabel("https://www.instagram.com/reel/abc/")).toBe("Instagram reel");
    expect(sourceLabel("https://www.facebook.com/share/r/abc/")).toBe("Facebook");
    expect(sourceLabel("https://www.tiktok.com/@a/video/1")).toBe("www.tiktok.com");
    expect(sourceReference("https://www.instagram.com/p/DA7kq2/?igsh=token")).toBe("instagram.com/p/DA7kq2");
  });

  it("formats finished stages compactly and running stages as a clock", () => {
    expect(formatStageDuration({ name: "added", state: "completed", durationMs: 200 })).toBe("0.2s");
    expect(formatStageDuration({ name: "media", state: "completed", durationMs: 72_000 })).toBe("1m 12s");
    expect(formatStageDuration({ name: "text", state: "active", durationMs: 42_000 })).toBe("0:42");
    expect(formatStageDuration({ name: "saved", state: "queued", durationMs: null })).toBe("");
  });

  it("replaces failure details with fixed copy", () => {
    expect(safeActivityEvent(event({ status: "failed", failureCode: "processing_failed", message: "/srv/data/x" }))?.message)
      .toBe("Media processing failed. The post downloaded, but its video or audio could not be processed.");
    expect(failureFor(job("x", "failed", { errorCode: "made_up" })).title).toBe("Capture failed");
  });
});
