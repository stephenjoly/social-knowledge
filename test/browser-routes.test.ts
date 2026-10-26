import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { safeReturnTo } from "../src/browser-routes.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "./helpers.js";
import { api } from "../web/shared/api.js";

describe("expired browser sessions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["/app", "/app/detail"])("returns %s to login with its query and fragment", async (pathname) => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { pathname, search: "?tab=activity&job=old", hash: "#source", replace } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })));
    await expect(api("/api/v1/jobs")).rejects.toMatchObject({ status: 401, body: { error: "unauthorized" }, message: "unauthorized" });
    expect(replace).toHaveBeenCalledExactlyOnceWith(`/login?${new URLSearchParams({ returnTo: `${pathname}?tab=activity&job=old#source` })}`);
  });

  it.each(["/login", "/", "/application"])("does not create a login redirect loop from %s", async (pathname) => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { pathname, replace } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401 })));
    await expect(api("/api/auth/login")).rejects.toMatchObject({ status: 401, message: "invalid_credentials" });
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([403, 500])("keeps non-session error %s on the current app page", async (status) => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/app", replace } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "fixture_failure" }), { status })));
    await expect(api("/api/v1/jobs")).rejects.toMatchObject({ status, message: "fixture_failure" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps a rejected provider key in its Settings dialog", async () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/app", search: "?tab=settings", replace } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_api_key" }), { status: 401 })));
    await expect(api("/api/v1/ai-providers/openai", { method: "PUT" })).rejects.toMatchObject({ status: 401, message: "invalid_api_key" });
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("authentication return destinations", () => {
  it.each([
    "/app", "/app?tab=settings&job=example", "/app/detail?job=example#source",
    "/oauth/authorize?client_id=example&state=example",
  ])("preserves local app/OAuth destination %s", (value) => {
    expect(safeReturnTo(value)).toBe(value);
  });
  it.each([
    null, undefined, ["/app"], "https://evil.example/app", "//evil.example/app",
    "/\\evil.example/app", "/app\n/evil", "/login", "/api/auth/logout",
    "/application", "/app/../../login", "/oauth/authorize", "javascript:alert(1)",
  ])("rejects untrusted destination %s", (value) => {
    expect(safeReturnTo(value)).toBe("/app");
  });
});

describe("public landing and private browser routes", () => {
  let root: string;
  let app: ReturnType<typeof buildApp>;
  let store: JobStore;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-routing-"));
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    config.appUrl = "https://share.example.test";
    store = new JobStore(config.databasePath);
    app = buildApp(config, store, new EventHub());
  });
  afterEach(async () => {
    await app.close();
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  async function signIn() {
    const setup = await app.inject({ method: "POST", url: "/api/auth/setup", payload: {
      username: "routing-admin", password: "synthetic-routing-password",
      administratorAcknowledged: true,
    } });
    expect(setup.statusCode).toBe(201);
    return String(setup.headers["set-cookie"]).split(";")[0];
  }
  it("serves the packaged public page and assets without exposing the app", async () => {
    const landing = await app.inject("/");
    expect(landing.statusCode).toBe(200);
    expect(landing.headers["cache-control"]).toBe("no-store");
    expect(landing.body).toContain("You saved it");
    expect(landing.body).toContain('content="https://share.example.test/brand/social-preview.png"');
    expect(landing.body).not.toContain("__PUBLIC_ORIGIN__");
    expect(landing.body).not.toContain("stephenjoly.github.io");
    const preview = await app.inject("/brand/social-preview.png");
    expect(preview.statusCode).toBe(200);
    expect(preview.headers["content-type"]).toContain("image/png");
    expect(preview.rawPayload.readUInt32BE(16)).toBe(1200);
    expect(preview.rawPayload.readUInt32BE(20)).toBe(630);
    const touch = await app.inject("/brand/apple-touch-icon.png");
    expect(touch.rawPayload.readUInt32BE(16)).toBe(180);
    expect(touch.rawPayload.readUInt32BE(20)).toBe(180);
    expect((await app.inject("/brand/favicon.svg")).headers["content-type"]).toContain("image/svg+xml");
    expect((await app.inject("/brand/favicon.ico")).rawPayload.readUInt16LE(2)).toBe(1);

    expect(landing.body).toContain('href="/login" data-session-link');
    expect(landing.body).toContain('/landing/session.js');
    const footer = landing.body.slice(landing.body.indexOf("<footer"));
    expect(footer).toContain('href="/login" data-session-link');
    expect(footer).not.toContain("data-footer-session-slot");
    for (const url of ["/landing/landing.css", "/landing/data.js", "/landing/landing.js", "/landing/session.js", "/landing/assets/inter-latin-wght-normal.woff2"]) {
      expect((await app.inject(url)).statusCode).toBe(200);
    }
    expect((await app.inject("/api/v1/captures")).statusCode).toBe(401);
    const session = await app.inject("/api/auth/session");
    expect(session.json()).toEqual({ authenticated: false });
    expect(session.headers["cache-control"]).toBe("no-store");
    expect((await app.inject("/unknown-page")).statusCode).toBe(404);
  });
  it("requires a session and preserves private deep links", async () => {
    for (const url of ["/app", "/app?tab=activity&job=example", "/app/detail?job=example"]) {
      const response = await app.inject(url);
      expect(response.statusCode).toBe(302);
      expect(response.headers["cache-control"]).toBe("no-store");
      const target = new URL(response.headers.location!, "http://local.invalid");
      expect(target.pathname).toBe("/login");
      expect(target.searchParams.get("returnTo")).toBe(url);
    }
    expect((await app.inject("/index.html")).headers.location).toBe("/app");
    const login = await app.inject("/login");
    expect(login.statusCode).toBe(200);
    expect(login.headers["cache-control"]).toBe("no-store");
    expect(login.body).toContain('id="root"');
    expect(login.body).toContain('href="/brand/favicon.svg"');
    expect(login.body).toContain('content="https://share.example.test/brand/social-preview.png"');
    expect(login.body).not.toContain("__PUBLIC_ORIGIN__");
    const setup = await app.inject("/api/auth/me");
    expect(setup.json().setupRequired).toBe(true);
  });
  it("keeps the root public and routes signed-in visitors away from login", async () => {
    const cookie = await signIn();
    const request = (url: string) => app.inject({ url, headers: { cookie } });
    expect((await request("/api/auth/session")).json()).toEqual({ authenticated: true });
    expect((await request("/")).body).toContain("You saved it");
    expect((await request("/app")).body).toContain('id="root"');
    expect((await request("/app")).body).toContain('content="https://share.example.test/brand/social-preview.png"');
    expect((await request("/app")).headers["cache-control"]).toBe("no-store");
    expect((await request("/login")).headers.location).toBe("/app");
    const destination = "/app?tab=settings";
    expect((await request(`/login?returnTo=${encodeURIComponent(destination)}`)).headers.location).toBe(destination);
    expect((await request("/login?returnTo=https%3A%2F%2Fevil.example")).headers.location).toBe("/app");
    const oauth = "/oauth/authorize?client_id=example&state=example";
    expect((await request(`/login?returnTo=${encodeURIComponent(oauth)}`)).headers.location).toBe(oauth);
    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    expect((await request("/app")).statusCode).toBe(302);
  });
  it("preserves old root bookmarks and creates login-based invitations", async () => {
    expect((await app.inject("/?job=example")).headers.location).toBe("/app?job=example");
    expect((await app.inject("/?tab=settings&job=example")).headers.location).toBe("/app?tab=settings&job=example");
    expect((await app.inject("/?capture=1")).headers.location).toBe("/app?capture=1");
    expect((await app.inject("/?returnTo=%2Foauth%2Fauthorize%3Fstate%3Dx")).headers.location).toBe("/login?returnTo=%2Foauth%2Fauthorize%3Fstate%3Dx");
    const cookie = await signIn();
    const invite = await app.inject({ method: "POST", url: "/api/v1/admin/invitations", headers: { cookie }, payload: {} });
    expect(invite.statusCode).toBe(201);
    expect(new URL(invite.json().invitationUrl).pathname).toBe("/login");
    expect(new URL(invite.json().invitationUrl).search).toBe("");
    expect(new URL(invite.json().invitationUrl).hash).toMatch(/^#invite=/);
  });
  it("canonicalizes trailing login slash without losing the return destination", async () => {
    const query = new URLSearchParams({ returnTo: "/app?tab=activity&job=example" }).toString();
    const response = await app.inject(`/login/?${query}`);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`/login?${query}`);
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
