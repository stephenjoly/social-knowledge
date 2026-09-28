import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthService } from "../src/auth.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "./helpers.js";

describe("account management", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  it("updates profile and password without exposing the password hash", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-account-"));
    await mkdir(path.join(root, "data"));
    const config = testConfig(root), store = new JobStore(config.databasePath);
    const app = buildApp(config, store, new EventHub());
    cleanups.push(async () => { await app.close(); store.close(); await rm(root, { recursive: true, force: true }); });
    const setup = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { username: "owner", password: "old-password-strong", administratorAcknowledged: true } });
    const cookie = String(setup.headers["set-cookie"]).split(";")[0];
    const other = store.createUser("occupied", await hash("occupied-password-strong"), "member");
    expect((await app.inject({ method: "PATCH", url: "/api/v1/account/profile", headers: { cookie }, payload: { username: "occupied" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "PATCH", url: "/api/v1/account/profile", headers: { cookie }, payload: { username: "x" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: "/api/v1/account/profile", headers: { cookie }, payload: { displayName: "Attack", userId: other.id } })).statusCode).toBe(400);
    expect(store.getUserById(other.id)?.displayName).toBeNull();
    const profile = await app.inject({ method: "PATCH", url: "/api/v1/account/profile", headers: { cookie }, payload: { displayName: "Archive Owner", username: "renamed", avatarColor: "#12abEF" } });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().user).toMatchObject({ displayName: "Archive Owner", username: "renamed", avatarColor: "#12abEF", suspendedAt: null });
    expect(profile.body).not.toContain("passwordHash");
    expect((await app.inject({ method: "POST", url: "/api/v1/account/password", headers: { cookie }, payload: { currentPassword: "wrong", newPassword: "new-password-strong" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/v1/account/password", headers: { cookie }, payload: { currentPassword: "old-password-strong", newPassword: "new-password-strong" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/auth/login", remoteAddress: "10.1.1.1", payload: { username: "renamed", password: "new-password-strong" } })).statusCode).toBe(200);
  });

  it("protects administrators and blocks every credential path while suspended", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-suspend-"));
    await mkdir(path.join(root, "data"));
    const config = testConfig(root), store = new JobStore(config.databasePath);
    const admin = store.createInitialUser("admin", await hash("admin-password-strong"))!;
    const member = store.createUser("member", await hash("member-password-strong"), "member");
    const adminToken = "admin-session", memberToken = "member-session", apiToken = "member-api-token";
    store.createSession(admin.id, AuthService.hashToken(adminToken), new Date(Date.now() + 60_000).toISOString());
    store.createSession(member.id, AuthService.hashToken(memberToken), new Date(Date.now() + 60_000).toISOString());
    store.createApiKey(member.id, "test", AuthService.hashToken(apiToken), "test");
    const oauthAccess = "oauth-access", oauthRefresh = "oauth-refresh", clientId = "00000000-0000-4000-8000-000000000123";
    store.registerOAuthClient({ clientId, name: "test", redirectUris: ["http://localhost/callback"] });
    store.createOAuthGrant({ userId: member.id, clientId, scope: "knowledge:read" });
    store.createOAuthTokens({ userId: member.id, clientId, accessHash: AuthService.hashToken(oauthAccess), refreshHash: AuthService.hashToken(oauthRefresh), scope: "knowledge:read", resource: `${config.appUrl}/mcp`, accessExpiresAt: new Date(Date.now() + 60_000).toISOString(), refreshExpiresAt: new Date(Date.now() + 60_000).toISOString() });
    const app = buildApp(config, store, new EventHub());
    cleanups.push(async () => { await app.close(); store.close(); await rm(root, { recursive: true, force: true }); });
    const adminCookie = `social_knowledge_session=${adminToken}`;
    expect((await app.inject({ method: "PATCH", url: `/api/v1/admin/users/${member.id}`, payload: { role: "admin" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "PATCH", url: `/api/v1/admin/users/${admin.id}`, headers: { cookie: `social_knowledge_session=${memberToken}` }, payload: { role: "member" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "PATCH", url: `/api/v1/admin/users/${admin.id}`, headers: { cookie: adminCookie }, payload: { role: "member" } })).json()).toEqual({ error: "cannot_modify_self" });
    expect((await app.inject({ method: "PATCH", url: `/api/v1/admin/users/${admin.id}`, headers: { cookie: adminCookie }, payload: { suspended: true } })).json()).toEqual({ error: "cannot_modify_self" });
    const suspended = await app.inject({ method: "PATCH", url: `/api/v1/admin/users/${member.id}`, headers: { cookie: adminCookie }, payload: { role: "admin", suspended: true } });
    expect(suspended.statusCode).toBe(200);
    expect(suspended.json().user).toMatchObject({ role: "admin", suspendedAt: expect.any(String) });
    expect((await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: `social_knowledge_session=${memberToken}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/auth/login", remoteAddress: "10.2.2.2", payload: { username: "member", password: "member-password-strong" } })).statusCode).toBe(401);
    expect(store.useApiKey(AuthService.hashToken(apiToken))).toBeNull();
    expect(store.useOAuthAccessToken(AuthService.hashToken(oauthAccess))).toBeNull();
    expect(store.rotateOAuthRefreshToken(AuthService.hashToken(oauthRefresh), "new-access", "new-refresh", new Date(Date.now() + 60_000).toISOString(), new Date(Date.now() + 60_000).toISOString())).toBeNull();
    expect(store.defaultUserId()).toBe(admin.id);
    expect((await app.inject({ method: "POST", url: "/mcp", headers: { authorization: `Bearer ${oauthAccess}` }, payload: {} })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/v1/jobs", headers: { authorization: `Bearer ${apiToken}` }, payload: { url: "https://www.instagram.com/p/blocked/" } })).statusCode).toBe(401);
    const verifier = "a".repeat(43), rawCode = "oauth-code";
    store.createOAuthCode({ codeHash: AuthService.hashToken(rawCode), userId: member.id, clientId, redirectUri: "http://localhost/callback", codeChallenge: createHash("sha256").update(verifier).digest("base64url"), resource: `${config.appUrl}/mcp`, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const deniedExchange = await app.inject({ method: "POST", url: "/oauth/token", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams({ grant_type: "authorization_code", code: rawCode, client_id: clientId, redirect_uri: "http://localhost/callback", code_verifier: verifier, resource: `${config.appUrl}/mcp` }).toString() });
    expect(deniedExchange.statusCode).toBe(400);
    expect(deniedExchange.json().error).toBe("invalid_grant");
    expect((await app.inject({ method: "PATCH", url: `/api/v1/admin/users/${member.id}`, headers: { cookie: adminCookie }, payload: { suspended: false } })).statusCode).toBe(200);
    expect(store.useApiKey(AuthService.hashToken(apiToken))).toMatchObject({ userId: member.id });
    expect(store.useOAuthAccessToken(AuthService.hashToken(oauthAccess))).toMatchObject({ userId: member.id });
    const restoredCode = "restored-code";
    store.createOAuthCode({ codeHash: AuthService.hashToken(restoredCode), userId: member.id, clientId, redirectUri: "http://localhost/callback", codeChallenge: createHash("sha256").update(verifier).digest("base64url"), resource: `${config.appUrl}/mcp`, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect((await app.inject({ method: "POST", url: "/oauth/token", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams({ grant_type: "authorization_code", code: restoredCode, client_id: clientId, redirect_uri: "http://localhost/callback", code_verifier: verifier, resource: `${config.appUrl}/mcp` }).toString() })).statusCode).toBe(200);
    store.database.prepare("UPDATE users SET suspended_at=? WHERE id=?").run(new Date().toISOString(), admin.id);
    expect(store.defaultUserId()).toBeNull();
  });

  it("migrates and reopens a pre-change users table without changing records or hashes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-user-migration-"));
    const filename = path.join(root, "legacy.sqlite3"), passwordHash = "preserved-password-hash";
    const legacy = new Database(filename);
    legacy.exec("CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);");
    legacy.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run("00000000-0000-4000-8000-000000000001", "legacy", passwordHash, "admin", "2026-01-01T00:00:00.000Z");
    legacy.close();
    const migrated = new JobStore(filename);
    expect(migrated.getUserByUsername("legacy")).toMatchObject({ passwordHash, displayName: null, avatarColor: null, suspendedAt: null, createdAt: "2026-01-01T00:00:00.000Z" });
    migrated.close();
    const reopened = new JobStore(filename);
    expect(reopened.listUsers()).toEqual([expect.objectContaining({ username: "legacy", createdAt: "2026-01-01T00:00:00.000Z" })]);
    expect(reopened.getUserByUsername("legacy")?.passwordHash).toBe(passwordHash);
    reopened.close();
    await rm(root, { recursive: true, force: true });
  });

  it("rate limits repeated current-password guesses", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-password-limit-"));
    await mkdir(path.join(root, "data"));
    const config = testConfig(root), store = new JobStore(config.databasePath), app = buildApp(config, store, new EventHub());
    cleanups.push(async () => { await app.close(); store.close(); await rm(root, { recursive: true, force: true }); });
    const setup = await app.inject({ method: "POST", url: "/api/auth/setup", payload: { username: "limited", password: "limited-password-strong", administratorAcknowledged: true } });
    const cookie = String(setup.headers["set-cookie"]).split(";")[0];
    const attempts = [];
    for (let index = 0; index < 6; index++) attempts.push(await app.inject({ method: "POST", url: "/api/v1/account/password", headers: { cookie }, payload: { currentPassword: `wrong-${index}`, newPassword: "replacement-password-strong" } }));
    expect(attempts.slice(0, 5).every((response) => response.statusCode === 403)).toBe(true);
    expect(attempts[5]?.statusCode).toBe(429);
  });
});
