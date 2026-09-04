import { createHash, randomBytes, randomUUID } from "node:crypto";
import formbody from "@fastify/formbody";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthService } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { JobStore } from "./db.js";

const scope = "knowledge:read";
const token = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const validRedirect = (value: string) => {
  const url = new URL(value);
  return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
};

export function registerOAuth(app: FastifyInstance, config: AppConfig, store: JobStore, auth: AuthService) {
  const issuer = config.appUrl;
  const resource = `${issuer}/mcp`;
  app.register(async (oauth) => {
    await oauth.register(formbody);
    oauth.get("/.well-known/oauth-protected-resource", async () => ({
      resource, authorization_servers: [issuer], scopes_supported: [scope], bearer_methods_supported: ["header"],
    }));
    oauth.get("/.well-known/oauth-authorization-server", async () => ({
      issuer, authorization_endpoint: `${issuer}/oauth/authorize`, token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`, revocation_endpoint: `${issuer}/oauth/revoke`,
      response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: [scope],
    }));
    oauth.post("/oauth/register", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (request, reply) => {
      const parsed = z.object({
        client_name: z.string().trim().min(1).max(100).default("AI client"),
        redirect_uris: z.array(z.string().url()).min(1).max(10),
        token_endpoint_auth_method: z.literal("none").optional(),
      }).safeParse(request.body);
      if (!parsed.success || !parsed.data.redirect_uris.every(validRedirect)) return reply.code(400).send({ error: "invalid_client_metadata" });
      const clientId = randomUUID();
      store.registerOAuthClient({ clientId, name: parsed.data.client_name, redirectUris: parsed.data.redirect_uris });
      return reply.code(201).send({ client_id: clientId, client_name: parsed.data.client_name, redirect_uris: parsed.data.redirect_uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] });
    });

    const authorizeSchema = z.object({
      response_type: z.literal("code"), client_id: z.string().uuid(), redirect_uri: z.string().url(),
      scope: z.literal(scope), state: z.string().max(2048).optional(), code_challenge: z.string().min(43).max(128),
      code_challenge_method: z.literal("S256"), resource: z.string().url(),
    });
    oauth.get("/oauth/authorize", async (request, reply) => {
      const parsed = authorizeSchema.safeParse(request.query);
      if (!parsed.success || parsed.data.resource !== resource) return reply.code(400).type("text/plain").send("Invalid authorization request");
      const client = store.oauthClient(parsed.data.client_id);
      if (!client || !client.redirectUris.includes(parsed.data.redirect_uri)) return reply.code(400).type("text/plain").send("Unknown client or redirect URI");
      const user = auth.user(request);
      if (!user) {
        const returnTo = `/oauth/authorize?${new URLSearchParams(request.query as Record<string, string>).toString()}`;
        return reply.redirect(`/?returnTo=${encodeURIComponent(returnTo)}`);
      }
      const fields = Object.entries(parsed.data).map(([name, value]) => value === undefined ? "" : `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(String(value))}">`).join("");
      return reply.type("text/html; charset=utf-8").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Connect ${escapeHtml(client.name)}</title><style>body{font:16px system-ui;background:#0b1113;color:#eaf2ef;display:grid;place-items:center;min-height:100vh}.card{max-width:520px;padding:32px;border:1px solid #29403b;border-radius:18px;background:#10191b}button{background:#64d4ad;border:0;border-radius:10px;padding:12px 18px;font-weight:700}</style></head><body><main class="card"><p>Social Knowledge</p><h1>Connect ${escapeHtml(client.name)}?</h1><p>This application will be able to search and read your saved knowledge. It cannot add, edit, or delete anything.</p><form method="post" action="/oauth/authorize">${fields}<button type="submit">Allow read-only access</button></form></main></body></html>`);
    });
    oauth.post("/oauth/authorize", async (request, reply) => {
      const parsed = authorizeSchema.safeParse(request.body), user = auth.user(request);
      if (!user) return reply.code(401).send({ error: "login_required" });
      if (!parsed.success || parsed.data.resource !== resource) return reply.code(400).send({ error: "invalid_request" });
      const client = store.oauthClient(parsed.data.client_id);
      if (!client || !client.redirectUris.includes(parsed.data.redirect_uri)) return reply.code(400).send({ error: "invalid_client" });
      store.createOAuthGrant({ userId: user.id, clientId: client.clientId, scope });
      const rawCode = token("skoc");
      store.createOAuthCode({ codeHash: AuthService.hashToken(rawCode), userId: user.id, clientId: client.clientId, redirectUri: parsed.data.redirect_uri, codeChallenge: parsed.data.code_challenge, resource, expiresAt: new Date(Date.now() + 300_000).toISOString() });
      const target = new URL(parsed.data.redirect_uri); target.searchParams.set("code", rawCode); if (parsed.data.state) target.searchParams.set("state", parsed.data.state);
      return reply.redirect(target.toString());
    });
    oauth.post("/oauth/token", { config: { rateLimit: { max: 30, timeWindow: "15 minutes" } } }, async (request, reply) => {
      const body = request.body as Record<string, string>;
      if (body.grant_type === "authorization_code") {
        const parsed = z.object({ grant_type: z.literal("authorization_code"), code: z.string(), client_id: z.string().uuid(), redirect_uri: z.string().url(), code_verifier: z.string().min(43).max(128), resource: z.string().url() }).safeParse(body);
        if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
        const code = store.consumeOAuthCode(AuthService.hashToken(parsed.data.code));
        const challenge = createHash("sha256").update(parsed.data.code_verifier).digest("base64url");
        if (!code || code.clientId !== parsed.data.client_id || code.redirectUri !== parsed.data.redirect_uri || code.resource !== resource || parsed.data.resource !== resource || code.codeChallenge !== challenge) return reply.code(400).send({ error: "invalid_grant" });
        return issueTokens(store, code.userId, code.clientId, resource, reply);
      }
      if (body.grant_type === "refresh_token") {
        const parsed = z.object({ grant_type: z.literal("refresh_token"), refresh_token: z.string(), client_id: z.string().uuid(), resource: z.string().url() }).safeParse(body);
        if (!parsed.success || parsed.data.resource !== resource) return reply.code(400).send({ error: "invalid_request" });
        const access = token("skoa"), refresh = token("skor");
        const rotated = store.rotateOAuthRefreshToken(AuthService.hashToken(parsed.data.refresh_token), AuthService.hashToken(access), AuthService.hashToken(refresh), new Date(Date.now() + 3_600_000).toISOString(), new Date(Date.now() + 30 * 86_400_000).toISOString());
        if (!rotated || rotated.clientId !== parsed.data.client_id || rotated.resource !== resource) return reply.code(400).send({ error: "invalid_grant" });
        return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: 3600, scope: rotated.scope, resource };
      }
      return reply.code(400).send({ error: "unsupported_grant_type" });
    });
    oauth.post("/oauth/revoke", async (request) => { const value = String((request.body as any)?.token ?? ""); if (value) store.revokeOAuthToken(AuthService.hashToken(value)); return {}; });
  });
}

function issueTokens(store: JobStore, userId: string, clientId: string, resource: string, reply: any) {
  const access = token("skoa"), refresh = token("skor");
  store.createOAuthTokens({ userId, clientId, accessHash: AuthService.hashToken(access), refreshHash: AuthService.hashToken(refresh), scope, resource, accessExpiresAt: new Date(Date.now() + 3_600_000).toISOString(), refreshExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() });
  return reply.send({ access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: 3600, scope, resource });
}
