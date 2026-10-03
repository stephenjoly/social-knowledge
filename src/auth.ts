import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { verify } from "@node-rs/argon2";
import type { FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import type { JobStore } from "./db.js";

export const SESSION_COOKIE = "social_knowledge_session";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export class AuthService {
  static hashToken(token: string) {
    return tokenHash(token);
  }
  constructor(
    private readonly store: JobStore,
    private readonly config: AppConfig,
  ) {}
  async login(username: string, password: string) {
    const user = this.store.getUserByUsername(username);
    if (!user || user.suspendedAt || !(await verify(user.passwordHash, password))) return null;
    const current = this.store.getUserById(user.id);
    if (!current || current.suspendedAt || current.passwordHash !== user.passwordHash) return null;
    return this.issueSession(current);
  }
  issueSession(user: { id: string; username: string; role: string }) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      Date.now() + this.config.sessionDays * 86400000,
    ).toISOString();
    if (!this.store.createSession(user.id, tokenHash(token), expiresAt)) return null;
    const stored = this.store.getUserById(user.id)!;
    return {
      token,
      expiresAt,
      user: {
        id: stored.id,
        username: stored.username,
        displayName: stored.displayName,
        avatarColor: stored.avatarColor,
        role: stored.role,
        suspendedAt: stored.suspendedAt,
        createdAt: stored.createdAt,
      },
    };
  }
  user(request: FastifyRequest) {
    const token = request.cookies[SESSION_COOKIE];
    return token ? (this.store.getSession(tokenHash(token)) ?? null) : null;
  }
  logout(token: string | undefined) {
    if (token) this.store.deleteSession(tokenHash(token));
  }
  apiPrincipal(request: FastifyRequest) {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return null;
    return this.store.useApiKey(tokenHash(authorization.slice(7)));
  }
  mcpPrincipal(request: FastifyRequest) {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return null;
    const hash = tokenHash(authorization.slice(7));
    const oauth = this.store.useOAuthAccessToken(hash);
    if (oauth && oauth.scope.split(" ").includes("knowledge:read"))
      return { userId: oauth.userId, credentialId: oauth.clientId, kind: "oauth" as const };
    const api = this.store.useApiKey(hash);
    return api ? { userId: api.userId, credentialId: api.keyId, kind: "api_key" as const } : null;
  }
  legacyToken(request: FastifyRequest) {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return false;
    const supplied = Buffer.from(authorization.slice(7)),
      expected = Buffer.from(this.config.apiToken);
    return (
      supplied.length === expected.length && timingSafeEqual(supplied, expected)
    );
  }
}
