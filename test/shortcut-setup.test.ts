import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthService } from "../src/auth.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "./helpers.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

it("limits Shortcut keys, checks configuration without jobs, and respects revocation and suspension", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shortcut-setup-"));
  await mkdir(path.join(root, "data"));
  const config = testConfig(root), store = new JobStore(config.databasePath);
  const owner = store.createUser("owner", "unused");
  const other = store.createUser("other", "unused");
  const auth = new AuthService(store, config);
  const cookie = `sk_session=unused`;
  const session = auth.issueSession(owner)!;
  const { SESSION_COOKIE } = await import("../src/auth.js");
  const headers = { cookie: `${SESSION_COOKIE}=${session.token}` };
  const app = buildApp(config, store, new EventHub());
  cleanups.push(async () => { await app.close(); store.close(); await rm(root, { recursive: true, force: true }); });
  const made = await app.inject({ method: "POST", url: "/api/v1/api-keys", headers, payload: { name: "iPhone Shortcut", scope: "capture" } });
  expect(made.statusCode).toBe(201);
  expect(made.headers["cache-control"]).toBe("no-store");
  const { token, apiKey } = made.json();
  expect(apiKey.scope).toBe("capture");
  const bearer = { authorization: `Bearer ${token}` };
  const check = () => app.inject({ url: "/api/v1/shortcut/connection", headers: { ...headers, ...bearer } });
  expect((await check()).json()).toEqual({ ok: true, scope: "capture", captureReady: false });
  expect(store.list(owner.id)).toEqual([]);
  expect((await app.inject({ url: "/api/v1/shortcut/connection", headers })).statusCode).toBe(401);
  expect((await app.inject({ url: "/api/v1/shortcut/connection", headers: { cookie } })).statusCode).toBe(401);
  store.saveAiProviderConnection(owner.id, "openai", "test", "test-key");
  store.saveAiTaskSelections(owner.id, { transcriptionProvider: "openai", transcriptionModel: config.transcriptionModel, analysisProvider: "openai", analysisModel: config.analysisModel });
  expect((await check()).json().captureReady).toBe(true);
  expect(store.list(owner.id)).toEqual([]);
  for (const url of ["/api/v1/knowledge/topics", "/api/v1/knowledge/captures/any", "/api/v1/knowledge/exports/any"]) {
    expect((await app.inject({ url, headers: bearer })).statusCode).toBe(403);
  }
  expect((await app.inject({ method: "POST", url: "/api/v1/knowledge/exports", headers: bearer, payload: {} })).statusCode).toBe(403);
  expect((await app.inject({ method: "POST", url: "/mcp", headers: bearer, payload: {} })).statusCode).toBe(401);
  const submit = await app.inject({ method: "POST", url: "/api/v1/jobs", headers: bearer, payload: { url: "https://www.instagram.com/reel/setup-test" } });
  expect(submit.statusCode).toBe(202);
  const receiptUrl = `/api/v1/shortcut/jobs/${submit.json().job.id}`;
  expect((await app.inject({ url: receiptUrl, headers: bearer })).statusCode).toBe(200);
  store.createApiKey(other.id, "other", AuthService.hashToken("other"), "other", "capture");
  expect((await app.inject({ url: receiptUrl, headers: { authorization: "Bearer other" } })).statusCode).toBe(404);
  expect(store.deleteApiKey(other.id, apiKey.id)).toBe(false);
  store.database.prepare("UPDATE users SET suspended_at=? WHERE id=?").run(new Date().toISOString(), owner.id);
  expect((await check()).statusCode).toBe(401);
  store.database.prepare("UPDATE users SET suspended_at=NULL WHERE id=?").run(owner.id);
  store.deleteApiKey(owner.id, apiKey.id);
  expect((await check()).statusCode).toBe(401);
  expect((await app.inject({ url: receiptUrl, headers: bearer })).statusCode).toBe(401);
  const invalid = await app.inject({ method: "POST", url: "/api/v1/api-keys", headers, payload: { name: "bad", scope: "admin" } });
  expect(invalid.statusCode).toBe(400);
  const full = await app.inject({ method: "POST", url: "/api/v1/api-keys", headers, payload: { name: "existing client" } });
  expect(full.json().apiKey.scope).toBe("full");
  expect((await app.inject({ url: "/api/v1/knowledge/topics", headers: { authorization: `Bearer ${full.json().token}` } })).statusCode).toBe(200);
});

it("migrates pre-scope API keys in place and can reopen safely", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shortcut-migrate-"));
  const filename = path.join(root, "old.sqlite");
  let store = new JobStore(filename);
  const owner = store.createUser("owner", "unused");
  const key = store.createApiKey(owner.id, "legacy", AuthService.hashToken("legacy"), "legacy");
  store.close();
  const old = new Database(filename);
  old.exec("ALTER TABLE api_keys DROP COLUMN scope");
  old.close();
  store = new JobStore(filename);
  try {
    expect(store.useApiKey(AuthService.hashToken("legacy"))).toMatchObject({ userId: owner.id, keyId: key.id, scope: "full" });
    store.close();
    store = new JobStore(filename);
    expect(store.listApiKeys(owner.id)).toHaveLength(1);
  } finally { store.close(); await rm(root, { recursive: true, force: true }); }
});
