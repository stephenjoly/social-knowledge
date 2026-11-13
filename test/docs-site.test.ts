import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "./helpers.js";

describe("public built documentation routes", () => {
  let root: string;
  let app: ReturnType<typeof buildApp>;
  let store: JobStore;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "docs-routing-"));
    await mkdir(path.join(root, "data"));
    const ui = path.join(root, "built-ui");
    for (const dir of ["docs/start", "docs/assets", "landing"])
      await mkdir(path.join(ui, dir), { recursive: true });
    for (const [name, text] of Object.entries({
      "index.html":
        '<html><div id="root">Private application shell</div></html>',
      "landing/index.html": "Public landing fixture",
      "docs/index.html": "<h1>Public docs fixture</h1>",
      "docs/start/index.html": "<h1>Getting started fixture</h1>",
      "docs/assets/docs.css": "body { color: black }",
      "docs/assets/docs.js": "console.log('fixture')",
      "docs/assets/logo.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
      "docs/search-index.json":
        '[{"title":"Overview","href":"/docs/","description":"Guide","text":"MCP"}]',
    }))
      await writeFile(path.join(ui, name), text);
    const config = { ...testConfig(root), uiDir: ui };
    store = new JobStore(config.databasePath);
    app = buildApp(config, store, new EventHub());
  });
  afterEach(async () => {
    await app.close();
    store.close();
    await rm(root, { recursive: true, force: true });
  });

  it("serves docs, nested pages, assets and search anonymously from the built directory", async () => {
    for (const [url, contentType, content] of [
      ["/docs/", "text/html", "Public docs fixture"],
      ["/docs/start/", "text/html", "Getting started fixture"],
      ["/docs/assets/docs.css", "text/css", "body"],
      ["/docs/assets/docs.js", "javascript", "fixture"],
      ["/docs/assets/logo.svg", "image/svg+xml", "<svg"],
      ["/docs/search-index.json", "application/json", "MCP"],
    ]) {
      const response = await app.inject(url!);
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain(contentType);
      expect(response.body).toContain(content);
      expect(response.body).not.toContain("Private application shell");
      expect(response.headers.location).toBeUndefined();
    }
    expect(
      (await app.inject({ method: "HEAD", url: "/docs/start/" })).statusCode,
    ).toBe(200);
  });

  it("canonicalizes docs URLs and preserves query parameters", async () => {
    for (const [url, destination] of [
      ["/docs", "/docs/"],
      ["/docs?search=mcp", "/docs/?search=mcp"],
      ["/docs/start?search=mcp", "/docs/start/?search=mcp"],
    ]) {
      const response = await app.inject(url!);
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(destination);
    }
  });

  it("returns 404 for missing docs without SPA fallback or repository exposure", async () => {
    for (const url of [
      "/docs/missing",
      "/docs/missing/",
      "/docs/assets/missing.js",
      "/docs/exec-plans/active/readme-docs-site.md",
      "/docs/%2e%2e%2findex.html",
      "/docs/%5c..%5cindex.html",
    ]) {
      const response = await app.inject(url);
      expect(response.statusCode, url).toBe(404);
      expect(response.body).not.toMatch(
        /Private application shell|Public docs fixture/,
      );
    }
  });

  it("preserves anonymous app/login/API protections and authenticated sessions", async () => {
    expect((await app.inject("/")).body).toBe("Public landing fixture");
    const privatePage = await app.inject("/app/detail?job=example");
    expect(privatePage.statusCode).toBe(302);
    const target = new URL(
      privatePage.headers.location!,
      "http://local.invalid",
    );
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("returnTo")).toBe("/app/detail?job=example");
    expect((await app.inject("/login")).body).toContain(
      "Private application shell",
    );
    expect((await app.inject("/api/v1/captures")).statusCode).toBe(401);
    expect((await app.inject("/api/auth/session")).json()).toEqual({
      authenticated: false,
    });
    const setup = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: {
        username: "docs-admin",
        password: "synthetic-docs-test-password",
        administratorAcknowledged: true,
      },
    });
    expect(setup.statusCode).toBe(201);
    const cookie = String(setup.headers["set-cookie"]).split(";")[0]!;
    const request = (url: string) => app.inject({ url, headers: { cookie } });
    expect((await request("/app")).body).toContain("Private application shell");
    expect((await request("/login")).headers.location).toBe("/app");
    expect((await request("/docs/start/")).body).toContain(
      "Getting started fixture",
    );
    expect((await request("/api/auth/session")).json()).toEqual({
      authenticated: true,
    });
  });
});
