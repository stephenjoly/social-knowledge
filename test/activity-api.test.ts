import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import type { AnalysisResult } from "../src/types.js";
import { testConfig } from "./helpers.js";

const analysis: AnalysisResult = {
  title: "Test capture",
  synopsis: "Test synopsis",
  whyUseful: null,
  takeaways: [],
  topics: [],
  entities: [],
  recommendations: [],
  claimsNeedingVerification: [],
  evidence: [],
  classification: {
    primaryDomain: "Travel",
    country: null,
    city: null,
    subcategory: "Guides" as const,
    secondaryTopics: [],
    confidence: 0.9,
  },
};

function createJob(store: JobStore, ownerUserId: string, suffix: string) {
  return store.createOrGet({
    ownerUserId,
    sourceUrl: `https://www.instagram.com/reel/activity-${suffix}`,
    normalizedUrl: `https://www.instagram.com/reel/activity-${suffix}`,
    sourceHash: `activity-${ownerUserId}-${suffix}`,
  }).job;
}

function addCapture(
  store: JobStore,
  ownerUserId: string,
  suffix: string,
  createdAt: string,
) {
  const job = createJob(store, ownerUserId, `capture-${suffix}`);
  const capture = store.createCapture({
    job,
    sourceType: "video",
    sourceId: `activity-capture-${suffix}`,
    platform: "instagram",
    title: "Saved activity capture",
    creator: null,
    creatorUrl: null,
    description: null,
    transcript: "Transcript",
    sourceLanguage: "en",
    translatedTranscript: null,
    translationLanguage: null,
    comments: [],
    analysis,
    publishedAt: null,
    durationSeconds: null,
    notePath: "private/never-returned.md",
    assets: [],
  })!;
  store.database
    .prepare("UPDATE captures SET created_at=? WHERE id=?")
    .run(createdAt, capture.id);
}

describe("Activity API", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  async function signedInApp() {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-activity-"));
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    const app = buildApp(config, store, new EventHub());
    cleanups.push(async () => {
      await app.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    });
    const setup = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: {
        username: "activity-owner",
        password: "a-strong-test-password",
        administratorAcknowledged: true,
      },
    });
    const cookie = (Array.isArray(setup.headers["set-cookie"])
      ? setup.headers["set-cookie"][0]
      : setup.headers["set-cookie"]
    )?.split(";")[0];
    const owner = store.getUserByUsername("activity-owner")!;
    store.saveAiProviderConnection(
      owner.id,
      "openai",
      "test-encrypted-payload",
      "test…key",
    );
    store.saveAiTaskSelections(owner.id, {
      transcriptionProvider: "openai",
      transcriptionModel: config.transcriptionModel,
      analysisProvider: "openai",
      analysisModel: config.analysisModel,
    });
    return { app, store, owner, cookie: cookie! };
  }

  it("projects a safe owner-scoped, exact stage timeline and retains retry history", async () => {
    const { app, store, owner, cookie } = await signedInApp();
    const other = store.createUser("activity-other", "hash");
    const job = createJob(store, owner.id, "timeline");
    const otherJob = createJob(store, other.id, "other");
    const secret = "synthetic-secret /private/runtime/cookies.txt";
    store.database
      .prepare(
        "UPDATE jobs SET status='failed',error_code='processing_failed',error=?,error_detail=?,result_note_path=?,display_title=?,updated_at=? WHERE id=?",
      )
      .run(
        secret,
        secret,
        "/private/vault/result.md",
        "A safe title",
        "2026-01-02T12:00:02.625Z",
        job.id,
      );
    store.database.prepare("DELETE FROM job_events WHERE job_id=?").run(job.id);
    const events = [
      ["queued", "Capture accepted", "2026-01-02T12:00:00.000Z"],
      ["downloading", "Download started", "2026-01-02T12:00:00.125Z"],
      ["processing", null, "2026-01-02T12:00:01.125Z"],
      ["transcribing", "unknown event text", "2026-01-02T12:00:01.125Z"],
      ["failed", secret, "2026-01-02T12:00:02.625Z"],
    ] as const;
    for (const [status, message, createdAt] of events)
      store.database
        .prepare(
          "INSERT INTO job_events(id,job_id,status,message,created_at) VALUES(?,?,?,?,?)",
        )
        .run(randomUUID(), job.id, status, message, createdAt);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/jobs/${job.id}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.body).not.toContain(secret);
    expect(detail.body).not.toContain("result_note_path");
    expect(Object.keys(detail.json().job).sort()).toEqual([
      "attempts",
      "createdAt",
      "displayTitle",
      "errorCode",
      "id",
      "normalizedUrl",
      "reachedStages",
      "stages",
      "status",
      "updatedAt",
    ]);
    expect(detail.json().job).toMatchObject({
      status: "failed",
      errorCode: "processing_failed",
      reachedStages: ["added", "found", "media", "text"],
      stages: [
        { name: "added", state: "completed", durationMs: 125 },
        { name: "found", state: "completed", durationMs: 1000 },
        { name: "media", state: "completed", durationMs: 0 },
        { name: "text", state: "failed", durationMs: 1500 },
        { name: "saved", state: "queued", durationMs: null },
      ],
    });
    expect(detail.json().events.map((event: { status: string }) => event.status)).toEqual([
      "queued", "downloading", "processing", "transcribing", "failed",
    ]);
    expect(detail.json().events.map((event: { durationMs: number | null }) => event.durationMs)).toEqual([
      125, 1000, 0, 1500, 0,
    ]);
    expect(detail.json().events[3]).toMatchObject({
      label: "Transcribing",
      message: null,
      state: "completed",
    });
    expect(detail.json().events[4]).toMatchObject({
      label: "Capture failed",
      message: null,
      state: "failed",
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/jobs/${otherJob.id}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(404);

    const retry = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${job.id}/retry`,
      headers: { cookie },
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.body).not.toContain(secret);
    expect(retry.json().job.attempts).toBe(1);
    expect(retry.json().job.stages.slice(0, 2)).toEqual([
      { name: "added", state: "active", durationMs: 0 },
      { name: "found", state: "queued", durationMs: null },
    ]);
    const afterRetry = await app.inject({
      method: "GET",
      url: `/api/v1/jobs/${job.id}`,
      headers: { cookie },
    });
    expect(afterRetry.json().events.at(-1)).toMatchObject({
      status: "queued",
      message: "Manual retry requested",
      state: "pending",
      durationMs: null,
    });
  });

  it("counts with the viewer timezone and paginates every owner failure before retrying all", async () => {
    const { app, store, owner, cookie } = await signedInApp();
    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse("2026-01-02T02:00:00.000Z"),
    );
    const other = store.createUser("activity-pagination-other", "hash");
    addCapture(store, owner.id, "day", "2026-01-01T23:30:00.000Z");
    for (let index = 0; index < 101; index++) {
      const job = createJob(store, owner.id, `failed-${index}`);
      const code = index === 0 ? "processing_failed" : index === 1 ? "authentication_required" : "unknown";
      store.database
        .prepare("UPDATE jobs SET status='failed',error_code=?,updated_at=? WHERE id=?")
        .run(code, `2026-01-01T${String(23 - Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00.000Z`, job.id);
    }
    const otherFailure = createJob(store, other.id, "failed");
    store.database
      .prepare("UPDATE jobs SET status='failed',error_code='authentication_required' WHERE id=?")
      .run(otherFailure.id);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/jobs?filter=all&limit=100&timeZone=America%2FToronto",
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().jobs).toHaveLength(100);
    expect(list.json()).toMatchObject({
      nextCursor: expect.any(String),
      counts: {
        active: 0,
        queued: 1,
        failed: 101,
        savedToday: 1,
        recentEvents: 0,
      },
    });
    const utcList = await app.inject({
      method: "GET",
      url: "/api/v1/jobs?filter=all&timeZone=UTC",
      headers: { cookie },
    });
    expect(utcList.json().counts.savedToday).toBe(0);

    const first = await app.inject({
      method: "GET",
      url: "/api/v1/jobs/failed?limit=50",
      headers: { cookie },
    });
    expect(first.json()).toMatchObject({ total: 101, nextCursor: expect.any(String) });
    expect(first.json().failures).toHaveLength(50);
    expect(first.json().failures[0].errorCode).toBe("authentication_required");
    const ids = new Set<string>();
    let page = first.json() as { failures: Array<{ id: string }>; nextCursor: string | null };
    for (;;) {
      page.failures.forEach((failure) => ids.add(failure.id));
      if (!page.nextCursor) break;
      const next = await app.inject({
        method: "GET",
        url: `/api/v1/jobs/failed?limit=50&cursor=${encodeURIComponent(page.nextCursor)}`,
        headers: { cookie },
      });
      expect(next.statusCode).toBe(200);
      page = next.json();
    }
    expect(ids).toHaveLength(101);
    expect(ids.has(otherFailure.id)).toBe(false);

    const retry = await app.inject({
      method: "POST",
      url: "/api/v1/jobs/retry-failed",
      headers: { cookie },
    });
    expect(retry.json()).toEqual({ requested: 101, retried: 101 });
    expect(store.listFailed(owner.id)).toHaveLength(0);
    expect(store.listFailed(other.id)).toHaveLength(1);
  });
});
