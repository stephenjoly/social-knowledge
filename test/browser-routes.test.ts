import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { safeReturnTo } from "../src/browser-routes.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "./helpers.js";

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
    expect(landing.body).toContain("You saved it");
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
    expect(login.body).toContain('id="root"');
    const setup = await app.inject("/api/auth/me");
    expect(setup.json().setupRequired).toBe(true);
  });
  it("keeps the root public and routes signed-in visitors away from login", async () => {
    const cookie = await signIn();
    const request = (url: string) => app.inject({ url, headers: { cookie } });
    expect((await request("/api/auth/session")).json()).toEqual({ authenticated: true });
    expect((await request("/")).body).toContain("You saved it");
    expect((await request("/app")).body).toContain('id="root"');
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
    expect((await app.inject("/?tab=settings&job=example")).headers.location).toBe("/app?tab=settings&job=example");
    expect((await app.inject("/?returnTo=%2Foauth%2Fauthorize%3Fstate%3Dx")).headers.location).toBe("/login?returnTo=%2Foauth%2Fauthorize%3Fstate%3Dx");
    const cookie = await signIn();
    const invite = await app.inject({ method: "POST", url: "/api/v1/admin/invitations", headers: { cookie }, payload: {} });
    expect(invite.statusCode).toBe(201);
    expect(new URL(invite.json().invitationUrl).pathname).toBe("/login");
    expect(new URL(invite.json().invitationUrl).search).toBe("");
    expect(new URL(invite.json().invitationUrl).hash).toMatch(/^#invite=/);
  });
});
