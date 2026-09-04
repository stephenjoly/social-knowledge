import { createHash, randomBytes } from "node:crypto";
const base = process.env.E2E_BASE_URL || "http://localhost:8787";
const username = process.env.E2E_USERNAME,
  password = process.env.E2E_PASSWORD;
if (!username || !password) throw new Error("E2E credentials required");
const registration = await fetch(`${base}/oauth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    client_name: "Deployment OAuth Smoke",
    redirect_uris: ["https://client.example/callback"],
    token_endpoint_auth_method: "none",
  }),
});
if (!registration.ok)
  throw new Error(`OAuth registration failed: ${registration.status}`);
const { client_id } = await registration.json();
const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username, password }),
});
if (!login.ok) throw new Error("OAuth smoke login failed");
const cookie = login.headers.get("set-cookie")?.split(";")[0];
const verifier = randomBytes(48).toString("base64url"),
  challenge = createHash("sha256").update(verifier).digest("base64url"),
  resource = `${base}/mcp`;
const consent = await fetch(`${base}/oauth/authorize`, {
  method: "POST",
  redirect: "manual",
  headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    response_type: "code",
    client_id,
    redirect_uri: "https://client.example/callback",
    scope: "knowledge:read",
    state: "smoke",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource,
  }),
});
const code = new URL(consent.headers.get("location")).searchParams.get("code");
if (!code) throw new Error("OAuth consent failed");
const exchange = await fetch(`${base}/oauth/token`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id,
    redirect_uri: "https://client.example/callback",
    code_verifier: verifier,
    resource,
  }),
});
if (!exchange.ok)
  throw new Error(`OAuth token exchange failed: ${exchange.status}`);
const tokens = await exchange.json();
const mcp = await fetch(`${base}/mcp`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${tokens.access_token}`,
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  }),
});
if (!mcp.ok || !(await mcp.json()).result?.tools?.length)
  throw new Error("OAuth MCP access failed");
await fetch(`${base}/oauth/revoke`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ token: tokens.access_token }),
});
console.log("OAuth smoke passed");
