import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hash } from "@node-rs/argon2";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "./helpers.js";

describe("OAuth and MCP", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

  it("discovers OAuth, completes PKCE, and exposes only read tools", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-mcp-")); await mkdir(path.join(root, "data"));
    const config = testConfig(root), store = new JobStore(config.databasePath), app = buildApp(config, store, new EventHub());
    store.createUser("demo", await hash("a-strong-test-password"));
    cleanups.push(async () => { await app.close(); store.close(); await rm(root, { recursive: true, force: true }); });

    const metadata = await app.inject({ method: "GET", url: "/.well-known/oauth-protected-resource" });
    expect(metadata.json().resource).toBe(`${config.appUrl}/mcp`);
    const unauthorized = await app.inject({ method: "POST", url: "/mcp", payload: {} });
    expect(unauthorized.statusCode).toBe(401); expect(unauthorized.headers["www-authenticate"]).toContain("oauth-protected-resource");

    const registration = await app.inject({ method: "POST", url: "/oauth/register", payload: { client_name: "Test AI", redirect_uris: ["https://client.example/callback"], token_endpoint_auth_method: "none" } });
    expect(registration.statusCode).toBe(201); const clientId = registration.json().client_id;
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "demo", password: "a-strong-test-password" } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const verifier = "v".repeat(64), challenge = createHash("sha256").update(verifier).digest("base64url");
    const authBody = { response_type: "code", client_id: clientId, redirect_uri: "https://client.example/callback", scope: "knowledge:read", state: "state-1", code_challenge: challenge, code_challenge_method: "S256", resource: `${config.appUrl}/mcp` };
    const consent = await app.inject({ method: "POST", url: "/oauth/authorize", headers: { cookie }, payload: authBody });
    expect(consent.statusCode).toBe(302); const code = new URL(consent.headers.location!).searchParams.get("code")!;
    const exchanged = await app.inject({ method: "POST", url: "/oauth/token", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: authBody.redirect_uri, code_verifier: verifier, resource: authBody.resource }).toString() });
    expect(exchanged.statusCode).toBe(200); const access = exchanged.json().access_token;
    const mcp = await app.inject({ method: "POST", url: "/mcp", headers: { authorization: `Bearer ${access}`, accept: "application/json, text/event-stream", "content-type": "application/json" }, payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} } });
    expect(mcp.statusCode).toBe(200);
    expect(mcp.json().result.tools.map((tool: { name: string }) => tool.name)).toEqual(["search_knowledge", "get_capture", "list_topics", "browse_category"]);
    expect(mcp.json().result.tools.every((tool: any) => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint)).toBe(true);
    const replay = await app.inject({ method: "POST", url: "/oauth/token", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: authBody.redirect_uri, code_verifier: verifier, resource: authBody.resource }).toString() });
    expect(replay.json().error).toBe("invalid_grant");
  });
});
