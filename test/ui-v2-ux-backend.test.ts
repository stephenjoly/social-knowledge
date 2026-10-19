import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthService, SESSION_COOKIE } from "../src/auth.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import type { JobStatus } from "../src/types.js";
import { testConfig } from "./helpers.js";

// Independent contract tests: seed state directly, exercise HTTP, then inspect
// durable records so response-only changes cannot conceal destructive behavior.
describe("UI v2 item08 archive contract", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  });

  async function fixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), "sk-archive-qa-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    cleanups.push(async () => store.close());
    const owner = store.createInitialUser("archive-owner", "hash")!;
    const member = store.createUser("archive-member", "hash", "member");
    function session(userId: string) {
      const token = randomUUID();
      store.createSession(userId, AuthService.hashToken(token), new Date(Date.now() + 3_600_000).toISOString());
      return `${SESSION_COOKIE}=${token}`;
    }
    const cookie = session(owner.id);
    const memberCookie = session(member.id);
    const app = buildApp(config, store, new EventHub());
    cleanups.push(() => app.close());
    store.saveAiProviderConnection(owner.id, "openai", "synthetic-encrypted-key", "test…key");
    store.saveAiTaskSelections(owner.id, {
      transcriptionProvider: "openai", transcriptionModel: config.transcriptionModel,
      analysisProvider: "openai", analysisModel: config.analysisModel,
    });
    function job(userId = owner.id, status: JobStatus = "failed", code: string | null = "unsupported_platform") {
      const suffix = randomUUID();
      const result = store.createOrGet({
        ownerUserId: userId, sourceUrl: `https://example.org/bookmark/${suffix}`,
        normalizedUrl: `https://example.org/bookmark/${suffix}`, sourceHash: suffix,
      }).job;
      store.database.prepare("UPDATE jobs SET status=?,error_code=?,attempts=3,updated_at='2026-01-01T00:00:00.000Z',next_attempt_at='2026-01-02T00:00:00.000Z' WHERE id=?").run(status, code, result.id);
      store.addEvent(result.id, status, null, code === "unsupported_platform" ? "unsupported_platform" : null);
      return result;
    }
    function request(action: "archive" | "restore", id: string, viewer = cookie) {
      return app.inject({ method: "POST", url: `/api/v1/jobs/${id}/${action}`, headers: { cookie: viewer } });
    }
    function row(id: string) {
      return store.database.prepare("SELECT * FROM jobs WHERE id=?").get(id) as Record<string, unknown>;
    }
    return { app, store, owner, member, cookie, memberCookie, job, request, row };
  }

  it.each([true, false])("migrates an old on-disk schema (already owned: %s) and persists archive state across reopen", async (alreadyOwned) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "sk-archive-migration-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const filename = path.join(root, "legacy.sqlite3");
    const legacy = new Database(filename);
    legacy.exec(`
      CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE jobs(id TEXT PRIMARY KEY,${alreadyOwned ? "owner_user_id TEXT NOT NULL REFERENCES users(id)," : ""}source_url TEXT NOT NULL,normalized_url TEXT NOT NULL,source_hash TEXT NOT NULL,user_note TEXT,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,error TEXT,result_note_path TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,next_attempt_at TEXT NOT NULL,error_code TEXT,error_detail TEXT,display_title TEXT,ai_provider TEXT,${alreadyOwned ? "UNIQUE(owner_user_id,source_hash)" : "UNIQUE(source_hash)"});
      CREATE TABLE job_events(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,status TEXT NOT NULL,message TEXT,created_at TEXT NOT NULL);
      INSERT INTO users VALUES('legacy-owner','legacy','hash','admin','2026-01-01T00:00:00.000Z');
      INSERT INTO jobs VALUES('legacy-job',${alreadyOwned ? "'legacy-owner'," : ""}'https://example.org/original','https://example.org/original','legacy-hash','retained note','failed',2,'synthetic diagnostic',NULL,'2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z','2026-01-03T00:00:00.000Z','unsupported_platform',NULL,'Retained bookmark',NULL);
      INSERT INTO job_events VALUES('legacy-event','legacy-job','failed','Legacy history','2026-01-02T00:00:00.000Z');
    `);
    const original = legacy.prepare("SELECT * FROM jobs").get() as Record<string, unknown>;
    legacy.close();
    const migrated = new JobStore(filename);
    try {
      expect(migrated.get("legacy-job")).toMatchObject({ ownerUserId: "legacy-owner", archivedAt: null, status: "failed" });
      expect(migrated.database.prepare("SELECT * FROM jobs").get()).toMatchObject(original);
      expect(migrated.events("legacy-job")).toMatchObject([{ id: "legacy-event", message: "Legacy history" }]);
      expect(migrated.setJobArchived("legacy-owner", "legacy-job", true).outcome).toBe("ok");
    } finally { migrated.close(); }
    const reopened = new JobStore(filename);
    try {
      expect(reopened.get("legacy-job")).toMatchObject({ archivedAt: expect.any(String), sourceUrl: original.source_url, attempts: 2 });
      expect(reopened.events("legacy-job")).toHaveLength(1);
      expect(reopened.claimNext()).toBeNull();
    } finally { reopened.close(); }
  });

  it("archives/restores idempotently, preserving every other job field, URL and history", async () => {
    const f = await fixture();
    const job = f.job();
    const before = f.row(job.id);
    const history = f.store.events(job.id);
    const first = await f.request("archive", job.id);
    expect(first.statusCode).toBe(200);
    expect(Object.keys(first.json())).toEqual(["job"]);
    const stamp: unknown = first.json().job.archivedAt;
    expect(stamp).toEqual(expect.any(String));
    expect(new Date(String(stamp)).toISOString()).toBe(stamp);
    expect(first.json().job).toMatchObject({ id: job.id, status: "failed", errorCode: "unsupported_platform" });
    expect(f.row(job.id)).toEqual({ ...before, archived_at: stamp });
    expect(f.store.events(job.id)).toEqual(history);
    const repeated = await f.request("archive", job.id);
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toEqual(first.json());
    const detail = await f.app.inject({ url: `/api/v1/jobs/${job.id}`, headers: { cookie: f.cookie } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().job).toEqual(first.json().job);
    expect(detail.json().events).toHaveLength(history.length);
    expect(f.store.claimNext()).toBeNull();
    const restored = await f.request("restore", job.id);
    expect(restored.statusCode).toBe(200);
    expect(restored.json().job.archivedAt).toBeNull();
    expect(f.row(job.id)).toEqual(before);
    expect((await f.request("restore", job.id)).json()).toEqual(restored.json());
    expect(f.store.events(job.id)).toEqual(history);
    expect(f.store.claimNext()).toBeNull();
  });

  it("paginates archived records without leaking owners, omitting or duplicating timestamp ties", async () => {
    const f = await fixture();
    const ids: string[] = [];
    for (let index = 0; index < 5; index++) {
      const job = f.job();
      f.store.database.prepare("UPDATE jobs SET created_at=? WHERE id=?").run("2026-01-01T00:00:00.000Z", job.id);
      expect((await f.request("archive", job.id)).statusCode).toBe(200);
      ids.push(job.id);
    }
    const other = f.job(f.member.id);
    expect((await f.request("archive", other.id, f.memberCookie)).statusCode).toBe(200);
    f.job(); // unarchived owner's failure must not enter the recovery page
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 4; page++) {
      const result = await f.app.inject({ url: `/api/v1/jobs?filter=archived&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, headers: { cookie: f.cookie } });
      expect(result.statusCode).toBe(200);
      expect(result.headers["cache-control"]).toBe("no-store");
      const body = result.json() as { jobs: Array<{ id: string; archivedAt: string | null }>; nextCursor: string | null };
      expect(body.jobs.length).toBeLessThanOrEqual(2);
      for (const job of body.jobs) { expect(job.archivedAt).toEqual(expect.any(String)); seen.push(job.id); }
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect(cursor).toBeNull();
    expect(seen.sort()).toEqual(ids.sort());
    expect(new Set(seen).size).toBe(5);
  });

  it("removes archives from normal lists, failed attention and counts, then restores visibility", async () => {
    const f = await fixture();
    const hidden = f.job();
    const visible = f.job();
    f.job(f.member.id);
    expect((await f.request("archive", hidden.id)).statusCode).toBe(200);
    for (const query of ["", "?filter=all", "?filter=active"]) {
      const response = await f.app.inject({ url: `/api/v1/jobs${query}`, headers: { cookie: f.cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.json().counts).toMatchObject({ failed: 1, active: 0, queued: 0 });
      expect(response.json().jobs.map((job: { id: string }) => job.id)).toEqual(query.includes("active") ? [] : [visible.id]);
    }
    const attention = await f.app.inject({ url: "/api/v1/jobs/failed?limit=1", headers: { cookie: f.cookie } });
    expect(attention.json()).toMatchObject({ total: 1, nextCursor: null, failures: [{ id: visible.id, archivedAt: null }] });
    expect((await f.request("restore", hidden.id)).statusCode).toBe(200);
    const restored = await f.app.inject({ url: "/api/v1/jobs/failed", headers: { cookie: f.cookie } });
    expect(restored.json().total).toBe(2);
    expect(restored.json().failures.map((job: { id: string }) => job.id).sort()).toEqual([hidden.id, visible.id].sort());
    const archived = await f.app.inject({ url: "/api/v1/jobs?filter=archived", headers: { cookie: f.cookie } });
    expect(archived.json()).toMatchObject({ jobs: [], nextCursor: null });
  });

  it.each<JobStatus>(["queued", "downloading", "processing", "transcribing", "translating", "analyzing", "writing", "complete"])("rejects nonterminal/successful %s targets without writes", async (status) => {
    const f = await fixture();
    const job = f.job(f.owner.id, status);
    const before = f.row(job.id);
    const events = f.store.events(job.id);
    for (const action of ["archive", "restore"] as const) expect((await f.request(action, job.id)).statusCode).toBe(409);
    expect(f.row(job.id)).toEqual(before);
    expect(f.store.events(job.id)).toEqual(events);
  });

  it.each([null, "processing_failed", "authentication_required", "unsupported_format", "unknown"])("rejects supported/unknown failed target %s", async (code) => {
    const f = await fixture();
    const job = f.job(f.owner.id, "failed", code);
    const before = f.row(job.id);
    for (const action of ["archive", "restore"] as const) expect((await f.request(action, job.id)).statusCode).toBe(409);
    expect(f.row(job.id)).toEqual(before);
  });

  it("enforces owner isolation for admin and member reads/writes and validates requests", async () => {
    const f = await fixture();
    const adminJob = f.job();
    const memberJob = f.job(f.member.id);
    for (const [id, cookie] of [[memberJob.id, f.cookie], [adminJob.id, f.memberCookie]] as const) {
      const before = f.row(id);
      for (const action of ["archive", "restore"] as const) {
        const forbidden = await f.request(action, id, cookie);
        expect(forbidden.statusCode).toBe(404);
        expect(forbidden.json()).toEqual({ error: "not_found" });
      }
      expect((await f.app.inject({ url: `/api/v1/jobs/${id}`, headers: { cookie } })).statusCode).toBe(404);
      expect(f.row(id)).toEqual(before);
    }
    for (const action of ["archive", "restore"] as const) {
      expect((await f.request(action, randomUUID())).statusCode).toBe(404);
      expect((await f.request(action, "not-a-uuid")).statusCode).toBe(400);
      const invalid = await f.app.inject({ method: "POST", url: `/api/v1/jobs/${adminJob.id}/${action}`, headers: { cookie: f.cookie }, payload: { ownerUserId: f.member.id } });
      expect(invalid.statusCode).toBe(400);
      expect((await f.app.inject({ method: "POST", url: `/api/v1/jobs/${adminJob.id}/${action}` })).statusCode).toBe(401);
    }
  });

  it("returns only safe Activity data while retaining raw provenance and diagnostics privately", async () => {
    const f = await fixture();
    const job = f.job();
    const secret = "synthetic-qa-secret";
    const rawUrl = `https://example.org/bookmark?id=42&access_token=${secret}`;
    f.store.database.prepare("UPDATE jobs SET source_url=?,normalized_url=?,error=?,error_detail=?,result_note_path=?,user_note=? WHERE id=?").run(rawUrl, rawUrl, secret, `/private/${secret}/cookies.txt`, `/private/${secret}/note.md`, secret, job.id);
    f.store.addEvent(job.id, "failed", secret, "unsupported_platform");
    for (const action of ["archive", "restore"] as const) {
      const response = await f.request(action, job.id);
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain(secret);
      expect(response.body).not.toContain("/private/");
      expect(response.body).not.toContain("access_token");
      expect(Object.keys(response.json().job).sort()).toEqual(["archivedAt", "attempts", "createdAt", "displayTitle", "errorCode", "id", "normalizedUrl", "reachedStages", "stages", "status", "updatedAt"].sort());
      expect(response.json().job.normalizedUrl).toContain("id=42");
      expect(f.row(job.id).source_url).toBe(rawUrl);
      expect(f.row(job.id).error).toBe(secret);
    }
  });

  it("never queues archived unsupported records during individual or bulk retry", async () => {
    const f = await fixture();
    const archived = f.job();
    const unarchived = f.job();
    const retryable = f.job(f.owner.id, "failed", "processing_failed");
    // Imported/inconsistent records must be excluded by archive state itself,
    // rather than relying only on the unsupported-platform retry exclusion.
    const importedArchive = f.job(f.owner.id, "failed", "processing_failed");
    f.store.database.prepare("UPDATE jobs SET archived_at=? WHERE id=?").run("2026-01-01T00:00:00.000Z", importedArchive.id);
    const importedBefore = f.row(importedArchive.id);
    const other = f.job(f.member.id, "failed", "processing_failed");
    expect((await f.request("archive", archived.id)).statusCode).toBe(200);
    const before = f.row(archived.id);
    const events = f.store.events(archived.id);
    const single = await f.app.inject({ method: "POST", url: `/api/v1/jobs/${archived.id}/retry`, headers: { cookie: f.cookie } });
    expect(single.statusCode).toBe(409);
    expect((await f.app.inject({ method: "POST", url: `/api/v1/jobs/${importedArchive.id}/retry`, headers: { cookie: f.cookie } })).statusCode).toBe(409);
    const bulk = await f.app.inject({ method: "POST", url: "/api/v1/jobs/retry-failed", headers: { cookie: f.cookie } });
    expect(bulk.statusCode).toBe(200);
    expect(bulk.json()).toEqual({ requested: 1, retried: 1 });
    expect(f.row(archived.id)).toEqual(before);
    expect(f.row(importedArchive.id)).toEqual(importedBefore);
    expect(f.store.events(archived.id)).toEqual(events);
    expect(f.row(unarchived.id).status).toBe("failed");
    expect(f.row(other.id).status).toBe("failed");
    expect(f.store.claimNext()?.id).toBe(retryable.id);
    expect(f.store.claimNext()).toBeNull();
  });
});
