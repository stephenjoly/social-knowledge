import { createReadStream } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { hash } from "@node-rs/argon2";
import Fastify from "fastify";
import { z } from "zod";
import { AuthService, SESSION_COOKIE } from "./auth.js";
import type { AppConfig } from "./config.js";
import {
  captureSortKeys,
  defaultCaptureSort,
  type CaptureCursor,
  type JobStore,
} from "./db.js";
import { activityEvents, activityJob } from "./activity.js";
import type { EventHub } from "./events.js";
import { normalizeSocialUrl } from "./url.js";
import { LibraryPublisher } from "./library-publisher.js";
import {
  KnowledgeExporter,
  captureKnowledge,
  decodeCursor,
  encodeCursor,
  isAfterCursor,
  isAfterSearchCursor,
  matchesKnowledge,
} from "./knowledge.js";
import { openApiDocument } from "./openapi.js";
import { AiProviderService, aiProviderIds } from "./ai-providers.js";
import { AskService } from "./ask.js";
import { registerOAuth } from "./oauth.js";
import { registerMcp } from "./mcp.js";
import {
  PlatformConnectionService,
  socialPlatforms,
} from "./platform-connections.js";

const submitSchema = z.object({
  url: z.string().min(1).max(4096),
  note: z.string().max(2000).optional(),
});
const requestIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._~-]+$/);

const activityCursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
  filter: z.enum(["active", "all"]),
});
const failedActivityCursorSchema = z.object({
  priority: z.number().int().min(0).max(8),
  updatedAt: z.string().datetime(),
  id: z.string().uuid(),
});

function encodeActivityCursor(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeActivityCursor<T>(value: string, schema: z.ZodType<T>) {
  try {
    return schema.parse(JSON.parse(Buffer.from(value, "base64url").toString()));
  } catch {
    throw new Error("invalid_cursor");
  }
}

function localDateParts(now: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(now));
  const value = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === name)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function localOffsetAt(now: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const value = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === name)?.value);
  return (
    Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second"),
    ) - now
  );
}

function localMidnight(year: number, month: number, day: number, timeZone: string) {
  const base = Date.UTC(year, month - 1, day);
  let instant = base;
  for (let index = 0; index < 3; index++) instant = base - localOffsetAt(instant, timeZone);
  return new Date(instant).toISOString();
}

function viewerDayBounds(now: number, timeZone: string) {
  const today = localDateParts(now, timeZone);
  const next = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return {
    start: localMidnight(today.year, today.month, today.day, timeZone),
    end: localMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone),
  };
}

function validTimeZone(value: string | undefined) {
  const timeZone = value ?? "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return timeZone;
  } catch {
    return null;
  }
}

export function canReceiveLiveEvent(
  store: JobStore,
  userId: string,
  event: unknown,
) {
  const envelope =
    event && typeof event === "object"
      ? (event as { payload?: unknown })
      : {};
  const item = (envelope.payload && typeof envelope.payload === "object"
    ? envelope.payload
    : envelope) as {
    id?: string;
    jobId?: string;
    captureId?: string;
  };
  return Boolean(
    (item.jobId && store.getOwned(userId, item.jobId)) ||
      (item.captureId && store.getOwnedCapture(userId, item.captureId)) ||
      (item.id &&
        (store.getOwned(userId, item.id) ||
          store.getOwnedCapture(userId, item.id))) ||
      (!item.id && !item.jobId && !item.captureId),
  );
}

export function buildApp(
  config: AppConfig,
  store: JobStore,
  events: EventHub,
  platformConnectionService = new PlatformConnectionService(store, config),
  aiProviderService = new AiProviderService(store, config),
  askService?: Pick<AskService, "answer">,
) {
  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: 64 * 1024,
    trustProxy: config.trustedProxies.length ? config.trustedProxies : false,
  });
  const auth = new AuthService(store, config);
  const setSessionCookie = (
    reply: { setCookie: (name: string, value: string, options: object) => unknown },
    session: { token: string; expiresAt: string },
  ) => {
    reply.setCookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(session.expiresAt),
    });
  };
  const library = new LibraryPublisher(store, config.vaultDir);
  const userNodeMarkdown = (
    node: NonNullable<ReturnType<JobStore["libraryNode"]>>,
  ) =>
    [
      "---",
      `node_id: ${node.id}`,
      `node_type: ${node.kind}`,
      "generated: true",
      "---",
      "",
      `# ${node.label}`,
      "",
      node.breadcrumb.map((item) => item.label).join(" → "),
      "",
      "## Browse",
      "",
      ...(node.children.length
        ? node.children.map(
            (child) =>
              `- [${child.label}](library:${child.id}) — ${child.captureCount} captures`,
          )
        : ["_No child categories._"]),
      "",
      "## Captures",
      "",
      ...(node.captures.length
        ? node.captures.map(
            (capture) =>
              `- [${capture.title}](capture:${capture.id}) — ${capture.platform}`,
          )
        : ["_No captures assigned directly to this category._"]),
      "",
    ].join("\n");
  const ask =
    askService ?? new AskService(aiProviderService.routedClient(), config, store);
  const knowledgeExporter = new KnowledgeExporter(store, config);
  let exportCleanup: NodeJS.Timeout | null = null;
  app.addHook("onReady", async () => {
    await knowledgeExporter.recoverInterrupted();
    await knowledgeExporter.cleanup();
    exportCleanup = setInterval(
      () =>
        void knowledgeExporter
          .cleanup()
          .catch((error) =>
            app.log.warn({ err: error }, "knowledge export cleanup failed"),
          ),
      3600000,
    );
    exportCleanup.unref();
  });
  app.addHook("onClose", async () => {
    if (exportCleanup) clearInterval(exportCleanup);
  });
  const streamAnswer = async (
    request: any,
    reply: any,
    userId: string,
    conversationId: string,
    assistantId: string,
    question: string,
    smokeMode?: "failure" | "slow" | "stream" | "complete",
  ) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    });
    // Make the SSE response visible to the client immediately, even before
    // the provider has produced its first text delta.
    reply.raw.flushHeaders();
    const send = (event: string, data: unknown) => {
      if (!reply.raw.destroyed)
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const controller = new AbortController();
    let finished = false,
      timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60000);
    reply.raw.on("close", () => {
      if (!finished) controller.abort();
    });
    send("started", { assistantId });
    try {
      if (smokeMode === "failure") throw new Error("smoke_failure");
      if (smokeMode === "slow")
        await new Promise<void>((_resolve, reject) =>
          controller.signal.addEventListener(
            "abort",
            () =>
              reject(
                Object.assign(new Error("aborted"), { name: "AbortError" }),
              ),
            { once: true },
          ),
        );
      if (smokeMode === "stream") {
        const chunks = [
          "The first part of the answer",
          " arrives before the answer is complete.",
        ];
        for (const [index, text] of chunks.entries()) {
          await new Promise<void>((resolve, reject) => {
            let timer: NodeJS.Timeout;
            const abort = () => {
              clearTimeout(timer);
              controller.signal.removeEventListener("abort", abort);
              reject(
                Object.assign(new Error("aborted"), { name: "AbortError" }),
              );
            };
            timer = setTimeout(
              () => {
                controller.signal.removeEventListener("abort", abort);
                resolve();
              },
              index === 0 ? 50 : 750,
            );
            if (controller.signal.aborted) return abort();
            controller.signal.addEventListener("abort", abort, {
              once: true,
            });
          });
          if (controller.signal.aborted)
            throw Object.assign(new Error("aborted"), { name: "AbortError" });
          send("delta", { text });
        }
        const answer = chunks.join("");
        store.completeConversationAttempt(
          userId,
          conversationId,
          assistantId,
          answer,
          [],
          false,
        );
        send("sources", { sources: [], sufficient: false });
        send("completed", { assistantId });
        return;
      }
      if (smokeMode === "complete") {
        const answer = "Deterministic retry completed.";
        send("delta", { text: answer });
        store.completeConversationAttempt(
          userId,
          conversationId,
          assistantId,
          answer,
          [],
          false,
        );
        send("sources", { sources: [], sufficient: false });
        send("completed", { assistantId });
        return;
      }
      const result = await aiProviderService.runForUser(userId, () =>
        ask.answer({
          userId,
          conversationId,
          assistantId,
          question,
          signal: controller.signal,
          onDelta: (text) => send("delta", { text }),
          onStatus: (status) => send("status", { assistantId, status }),
        }),
      );
      request.log.info(
        { conversationId, assistantId, retrieval: result.diagnostics },
        "Ask AI retrieval completed",
      );
      send("sources", {
        sources: result.sources,
        sufficient: result.sufficient,
      });
      send("completed", { assistantId });
    } catch (error) {
      const cancelled = controller.signal.aborted && !timedOut;
      const code = cancelled
        ? "cancelled"
        : timedOut
          ? "timeout"
          : error instanceof Error &&
              ["invalid_citation", "planner_error", "context_limit"].includes(
                error.message,
              )
            ? error.message
            : "provider_error";
      store.failConversationAttempt(
        userId,
        conversationId,
        assistantId,
        cancelled ? "cancelled" : "failed",
        code,
      );
      request.log.error(
        { err: error, conversationId, assistantId, errorCode: code },
        "Ask AI attempt failed",
      );
      send(cancelled ? "cancelled" : "error", {
        assistantId,
        errorCode: code,
        message: cancelled
          ? "Answer stopped."
          : code === "timeout"
            ? "The answer timed out. You can retry it."
            : code === "context_limit"
              ? "This conversation is too large to continue. Start a new conversation or try a shorter request."
              : code === "planner_error"
                ? "I couldn’t understand that follow-up safely. Please try rephrasing it."
                : "Ask AI could not finish that answer. You can retry it.",
      });
    } finally {
      finished = true;
      clearTimeout(timer);
      if (!reply.raw.destroyed) reply.raw.end();
    }
  };
  app.register(cookie);
  app.register(rateLimit, { global: false });
  app.register(fastifyStatic, {
    root: config.uiDir,
    prefix: "/",
    wildcard: false,
  });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/openapi.json", async () => openApiDocument(config.appUrl));
  registerOAuth(app, config, store, auth);
  registerMcp(app, config, store, auth);

  app.post(
    "/api/auth/setup",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
          keyGenerator: (request: any) =>
            AuthService.hashToken(request.ip),
        },
      },
    },
    async (request, reply) => {
      if (store.userCount() > 0)
        return reply.code(409).send({ error: "setup_complete" });
      const input = z
        .object({
          username: z.string().trim().min(2).max(40),
          password: z.string().min(12).max(1024),
          administratorAcknowledged: z.literal(true),
        })
        .safeParse(request.body);
      if (!input.success)
        return reply.code(400).send({ error: "invalid_request" });
      const user = store.createInitialUser(
        input.data.username,
        await hash(input.data.password),
      );
      if (!user) return reply.code(409).send({ error: "setup_complete" });
      const session = auth.issueSession(user);
      setSessionCookie(reply, session);
      return reply.code(201).send({ user });
    },
  );
  app.get("/api/auth/demo-accounts", async (_request, reply) => {
    if (!config.demoAccounts.length)
      return reply.code(404).send({ error: "not_found" });
    reply.header("Cache-Control", "no-store");
    return {
      accounts: config.demoAccounts.map(({ username, password, role }) => ({
        username,
        password,
        role,
      })),
    };
  });
  app.post(
    "/api/auth/invitations/inspect",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "15 minutes",
          keyGenerator: (request: any) => AuthService.hashToken(request.ip),
        },
      },
    },
    async (request, reply) => {
      const input = z
        .object({ token: z.string().min(32).max(200) })
        .safeParse(request.body);
      if (!input.success)
        return reply.code(400).send({ error: "invalid_invitation" });
      const invitation = store.inspectInvitation(AuthService.hashToken(input.data.token));
      return invitation
        ? { invitation: { role: invitation.role, expiresAt: invitation.expiresAt } }
        : reply.code(400).send({ error: "invalid_invitation" });
    },
  );
  app.post(
    "/api/auth/invitations/redeem",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
          keyGenerator: (request: any) => AuthService.hashToken(request.ip),
        },
      },
    },
    async (request, reply) => {
      const input = z
        .object({
          token: z.string().min(32).max(200),
          username: z.string().trim().min(2).max(40),
          password: z.string().min(12).max(1024),
          administratorAcknowledged: z.boolean().optional(),
        })
        .safeParse(request.body);
      if (!input.success)
        return reply.code(400).send({ error: "invalid_request" });
      const tokenHash = AuthService.hashToken(input.data.token);
      const invitation = store.inspectInvitation(tokenHash);
      if (!invitation)
        return reply.code(400).send({ error: "invalid_invitation" });
      if (invitation.role === "admin" && !input.data.administratorAcknowledged)
        return reply.code(400).send({ error: "administrator_acknowledgement_required" });
      const result = store.redeemInvitation({
        tokenHash,
        username: input.data.username,
        passwordHash: await hash(input.data.password),
      });
      if (!result.ok)
        return reply
          .code(result.reason === "username_taken" ? 409 : 400)
          .send({ error: result.reason });
      const session = auth.issueSession(result.user);
      setSessionCookie(reply, session);
      return reply.code(201).send({ user: result.user });
    },
  );
  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
          keyGenerator: (request: any) =>
            AuthService.hashToken(
              `${request.ip}:${String(request.body?.username ?? "")
                .trim()
                .toLowerCase()}`,
            ),
        },
      },
    },
    async (request, reply) => {
      const input = z
        .object({ username: z.string(), password: z.string() })
        .safeParse(request.body);
      if (!input.success)
        return reply.code(400).send({ error: "invalid_request" });
      const result = await auth.login(input.data.username, input.data.password);
      if (!result)
        return reply.code(401).send({ error: "invalid_credentials" });
      setSessionCookie(reply, result);
      return { user: result.user };
    },
  );
  app.post("/api/auth/logout", async (request, reply) => {
    auth.logout(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });
  app.get("/api/auth/me", async (request, reply) => {
    const user = auth.user(request);
    return user
      ? { user }
      : reply.code(401).send({
          error: "unauthorized",
          setupRequired: store.userCount() === 0,
        });
  });

  app.post(
    "/api/v1/jobs",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 hour",
          keyGenerator: (request: any) =>
            request.headers.authorization
              ? AuthService.hashToken(request.headers.authorization)
              : request.ip,
        },
      },
    },
    async (request, reply) => {
      const session = auth.user(request),
        principal = auth.apiPrincipal(request);
      const ownerUserId =
        session?.id ??
        principal?.userId ??
        (auth.legacyToken(request) ? store.defaultUserId() : null);
      if (!ownerUserId) return reply.code(401).send({ error: "unauthorized" });
      const input = submitSchema.safeParse(request.body);
      if (!input.success)
        return reply.code(400).send({ error: "invalid_request" });
      try {
        const selections = aiProviderService.captureSelections(ownerUserId);
        const social = normalizeSocialUrl(input.data.url);
        const result = store.createOrGet({
          ownerUserId,
          sourceUrl: social.original,
          normalizedUrl: social.normalized,
          sourceHash: social.hash,
          userNote: input.data.note,
          ...selections,
        });
        const retried =
          !result.created &&
          result.job.status === "failed" &&
          store.retry(result.job.id, selections);
        const job = retried ? store.get(result.job.id) : result.job;
        events.publish("job", { id: result.job.id, status: job?.status });
        return reply
          .code(result.created || retried ? 202 : 200)
          .send({
            created: result.created,
            retried,
            job: activityJob(
              job ?? result.job,
              store.events(result.job.id),
            ),
          });
      } catch (error) {
        const code = error instanceof Error ? error.message : "invalid_url";
        if (["transcription_required", "analysis_provider_required"].includes(code))
          return reply.code(428).send({ error: code });
        return reply.code(400).send({
          error: "invalid_url",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  app.register(async (agentApi) => {
    const readBuckets = new Map<string, { minute: number; count: number }>();
    agentApi.addHook("onRequest", async (request, reply) => {
      const principal = auth.apiPrincipal(request);
      if (!principal) return reply.code(401).send({ error: "unauthorized" });
      (request as any).agentPrincipal = principal;
      if (request.method === "GET") {
        const minute = Math.floor(Date.now() / 60000),
          current = readBuckets.get(principal.keyId);
        const bucket =
          current?.minute === minute ? current : { minute, count: 0 };
        bucket.count++;
        readBuckets.set(principal.keyId, bucket);
        if (bucket.count > 120)
          return reply
            .header(
              "Retry-After",
              String(60 - (Math.floor(Date.now() / 1000) % 60)),
            )
            .code(429)
            .send({ error: "rate_limit_exceeded" });
      }
    });
    const principal = (request: any) =>
      request.agentPrincipal as { userId: string; keyId: string };
    const readLimit = {
      rateLimit: {
        max: 120,
        timeWindow: "1 minute",
        keyGenerator: (request: any) =>
          AuthService.hashToken(request.headers.authorization ?? request.ip),
      },
    };
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(100),
      cursor: z.string().max(200).optional(),
      topic: z.string().max(100).optional(),
      country: z.string().max(100).optional(),
      city: z.string().max(100).optional(),
      creator: z.string().max(150).optional(),
      platform: z.string().max(30).optional(),
      sourceType: z.string().max(30).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    });
    agentApi.get(
      "/api/v1/knowledge/search",
      { config: readLimit },
      async (request, reply) => {
        const parsed = querySchema
          .extend({ q: z.string().trim().min(1).max(200) })
          .safeParse(request.query);
        if (!parsed.success)
          return reply.code(400).send({ error: "invalid_request" });
        let decoded;
        try {
          decoded = decodeCursor(parsed.data.cursor);
        } catch {
          return reply.code(400).send({ error: "invalid_cursor" });
        }
        const { q, limit, cursor: _cursor, ...filters } = parsed.data;
        const matches = store
          .searchKnowledge(principal(request).userId, q)
          .filter((item) => matchesKnowledge(store, item.capture, filters))
          .filter((item) => isAfterSearchCursor(item, decoded));
        const page = matches.slice(0, limit);
        const last = page.at(-1);
        return {
          schemaVersion: "1",
          results: page.map((item) => ({
            ...captureKnowledge(store, item.capture, new Set(), true),
            score: item.score,
            matchReasons: [item.reason],
          })),
          nextCursor:
            matches.length > limit && last
              ? encodeCursor({
                  score: last.score,
                  createdAt: last.capture.createdAt,
                  id: last.capture.id,
                })
              : null,
        };
      },
    );
    agentApi.get(
      "/api/v1/knowledge/captures",
      { config: readLimit },
      async (request, reply) => {
        const parsed = querySchema.safeParse(request.query);
        if (!parsed.success)
          return reply.code(400).send({ error: "invalid_request" });
        let decoded;
        try {
          decoded = decodeCursor(parsed.data.cursor);
        } catch {
          return reply.code(400).send({ error: "invalid_cursor" });
        }
        const { limit, cursor: _cursor, ...filters } = parsed.data;
        const captures = store
          .ownedCaptures(principal(request).userId)
          .filter((capture) => matchesKnowledge(store, capture, filters))
          .filter((capture) => isAfterCursor(capture, decoded));
        const page = captures.slice(0, limit);
        const last = page.at(-1);
        return {
          schemaVersion: "1",
          captures: page.map((capture) =>
            captureKnowledge(store, capture, new Set(), true),
          ),
          nextCursor:
            captures.length > limit && last
              ? encodeCursor({ createdAt: last.createdAt, id: last.id })
              : null,
        };
      },
    );
    agentApi.get("/api/v1/knowledge/captures/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const raw = (request.query as any)?.include;
      const values = (
        Array.isArray(raw) ? raw : String(raw ?? "").split(",")
      ).filter(Boolean);
      if (values.some((value) => !["transcript", "comments"].includes(value)))
        return reply.code(400).send({ error: "invalid_include" });
      const capture = store.getOwnedCapture(principal(request).userId, id);
      return capture
        ? { capture: captureKnowledge(store, capture, new Set(values)) }
        : reply.code(404).send({ error: "not_found" });
    });
    agentApi.get("/api/v1/knowledge/topics", async (request) => {
      const userId = principal(request).userId,
        captures = store.ownedCaptures(userId),
        facets = new Map<string, number>();
      for (const capture of captures)
        for (const label of [
          ...capture.topics,
          ...store.libraryFacets(capture.id),
        ])
          facets.set(label, (facets.get(label) ?? 0) + 1);
      return {
        schemaVersion: "1",
        nodes: store.libraryTree(userId),
        facets: [...facets]
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      };
    });
    agentApi.post(
      "/api/v1/knowledge/exports",
      {
        config: {
          rateLimit: {
            max: 5,
            timeWindow: "1 hour",
            keyGenerator: (request: any) =>
              AuthService.hashToken(
                request.headers.authorization ?? request.ip,
              ),
          },
        },
      },
      async (request, reply) => {
        const parsed = z
          .object({
            include: z
              .array(z.enum(["transcript", "comments"]))
              .max(2)
              .default([]),
          })
          .safeParse(request.body ?? {});
        if (!parsed.success)
          return reply.code(400).send({ error: "invalid_request" });
        const include = new Set<string>(parsed.data.include),
          userId = principal(request).userId,
          created = store.createKnowledgeExport(
            userId,
            include.has("transcript"),
            include.has("comments"),
          );
        void knowledgeExporter
          .build(userId, created.id, include)
          .catch((error) =>
            app.log.error(
              { err: error, exportId: created.id, userId },
              "knowledge export failed",
            ),
          );
        return reply.code(202).send({ export: created });
      },
    );
    agentApi.get("/api/v1/knowledge/exports/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const item = store.getKnowledgeExport(principal(request).userId, id);
      if (!item) return reply.code(404).send({ error: "not_found" });
      return {
        export: {
          id: item.id,
          status: item.status,
          errorCode: item.errorCode,
          recordCount: item.recordCount,
          createdAt: item.createdAt,
          expiresAt: item.expiresAt,
        },
      };
    });
    agentApi.get(
      "/api/v1/knowledge/exports/:id/download",
      async (request, reply) => {
        const { id } = z
          .object({ id: z.string().uuid() })
          .parse(request.params);
        const item = store.getKnowledgeExport(principal(request).userId, id);
        if (!item) return reply.code(404).send({ error: "not_found" });
        if (item.status !== "complete" || !item.path)
          return reply.code(409).send({ error: "export_not_ready" });
        if (item.expiresAt <= new Date().toISOString())
          return reply.code(410).send({ error: "export_expired" });
        const file = await stat(item.path).catch(() => null);
        if (!file) return reply.code(404).send({ error: "export_missing" });
        reply
          .header("Content-Type", "application/gzip")
          .header(
            "Content-Disposition",
            `attachment; filename=\"social-knowledge-${id}.jsonl.gz\"`,
          )
          .header("Content-Length", file.size)
          .header("X-Social-Knowledge-Schema-Version", "1");
        return reply.send(createReadStream(item.path));
      },
    );
  });

  app.register(async (protectedApi) => {
    protectedApi.addHook("onRequest", async (request, reply) => {
      if (!auth.user(request))
        return reply.code(401).send({ error: "unauthorized" });
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        const origin = request.headers.origin;
        if (origin && origin !== config.appUrl)
          return reply.code(403).send({ error: "invalid_origin" });
      }
    });
    const requireAdmin = (request: any, reply: any) => {
      const user = auth.user(request)!;
      if (user.role !== "admin") {
        reply.code(403).send({ error: "forbidden" });
        return null;
      }
      return user;
    };
    const newInvitation = (
      userId: string,
      role: "member" | "admin",
    ) => {
      const token = randomBytes(32).toString("base64url");
      const invitation = store.createInvitation({
        createdByUserId: userId,
        role,
        tokenHash: AuthService.hashToken(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      return {
        invitation,
        invitationUrl: `${config.appUrl.replace(/\/$/, "")}/#invite=${token}`,
      };
    };
    protectedApi.get("/api/v1/admin/users", async (request, reply) => {
      if (!requireAdmin(request, reply)) return;
      return { users: store.listUsers() };
    });
    protectedApi.get("/api/v1/admin/invitations", async (request, reply) => {
      if (!requireAdmin(request, reply)) return;
      return { invitations: store.listInvitations() };
    });
    protectedApi.post(
      "/api/v1/admin/invitations",
      {
        config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
      },
      async (request, reply) => {
        const user = requireAdmin(request, reply);
        if (!user) return;
        const input = z
          .object({
            role: z.enum(["member", "admin"]).default("member"),
            administratorAcknowledged: z.boolean().optional(),
          })
          .safeParse(request.body ?? {});
        if (!input.success)
          return reply.code(400).send({ error: "invalid_request" });
        if (input.data.role === "admin" && !input.data.administratorAcknowledged)
          return reply.code(400).send({
            error: "administrator_acknowledgement_required",
          });
        return reply.code(201).send(newInvitation(user.id, input.data.role));
      },
    );
    protectedApi.post(
      "/api/v1/admin/invitations/:id/revoke",
      async (request, reply) => {
        if (!requireAdmin(request, reply)) return;
        const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
        if (!params.success)
          return reply.code(400).send({ error: "invalid_request" });
        return store.revokeInvitation(params.data.id)
          ? { ok: true }
          : reply.code(404).send({ error: "invitation_not_found" });
      },
    );
    protectedApi.post(
      "/api/v1/admin/invitations/:id/regenerate",
      {
        config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
      },
      async (request, reply) => {
        const user = requireAdmin(request, reply);
        if (!user) return;
        const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
        if (!params.success)
          return reply.code(400).send({ error: "invalid_request" });
        const token = randomBytes(32).toString("base64url");
        const invitation = store.regenerateInvitation({
          id: params.data.id,
          createdByUserId: user.id,
          tokenHash: AuthService.hashToken(token),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        return invitation
          ? reply.code(201).send({
              invitation,
              invitationUrl: `${config.appUrl.replace(/\/$/, "")}/#invite=${token}`,
            })
          : reply.code(404).send({ error: "invitation_not_found" });
      },
    );
    protectedApi.get("/api/v1/inbox-analytics", async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const generatedAt = new Date().toISOString();
      const last24HoursCutoff = new Date(
        Date.parse(generatedAt) - 24 * 60 * 60 * 1000,
      ).toISOString();
      const last7DaysCutoff = new Date(
        Date.parse(generatedAt) - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      return {
        ...store.inboxAnalytics(
          auth.user(request)!.id,
          last24HoursCutoff,
          last7DaysCutoff,
        ),
        generatedAt,
      };
    });
    protectedApi.get("/api/v1/jobs", async (request, reply) => {
      const user = auth.user(request)!;
      const parsed = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          filter: z.enum(["active", "all"]).optional(),
          cursor: z.string().max(300).optional(),
          timeZone: z.string().min(1).max(100).optional(),
          timezone: z.string().min(1).max(100).optional(),
        })
        .safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
      if (
        parsed.data.timeZone &&
        parsed.data.timezone &&
        parsed.data.timeZone !== parsed.data.timezone
      )
        return reply.code(400).send({ error: "invalid_request" });
      const timeZone = validTimeZone(parsed.data.timeZone ?? parsed.data.timezone);
      if (!timeZone) return reply.code(400).send({ error: "invalid_request" });
      const filter = parsed.data.filter ?? "all";
      let cursor: { createdAt: string; id: string } | undefined;
      if (parsed.data.cursor) {
        try {
          const decoded = decodeActivityCursor(
            parsed.data.cursor,
            activityCursorSchema,
          );
          if (decoded.filter !== filter) throw new Error("invalid_cursor");
          cursor = { createdAt: decoded.createdAt, id: decoded.id };
        } catch {
          return reply.code(400).send({ error: "invalid_cursor" });
        }
      }
      const now = Date.now();
      const page = store.listActivityJobs({
        userId: user.id,
        filter,
        limit: parsed.data.limit,
        ...(cursor ? { cursor } : {}),
      });
      const day = viewerDayBounds(now, timeZone);
      return {
        jobs: page.jobs.map((job) => activityJob(job, store.events(job.id), now)),
        nextCursor: page.nextCursor
          ? encodeActivityCursor({ ...page.nextCursor, filter })
          : null,
        generatedAt: new Date(now).toISOString(),
        counts: store.activityCounts({
          userId: user.id,
          savedTodayStart: day.start,
          savedTodayEnd: day.end,
          recentEventsStart: new Date(now - 10 * 60 * 1000).toISOString(),
          recentEventsEnd: new Date(now).toISOString(),
        }),
      };
    });
    protectedApi.get("/api/v1/jobs/failed", async (request, reply) => {
      const user = auth.user(request)!;
      const parsed = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          cursor: z.string().max(300).optional(),
        })
        .safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
      let cursor: { priority: number; updatedAt: string; id: string } | undefined;
      if (parsed.data.cursor) {
        try {
          cursor = decodeActivityCursor(
            parsed.data.cursor,
            failedActivityCursorSchema,
          );
        } catch {
          return reply.code(400).send({ error: "invalid_cursor" });
        }
      }
      const now = Date.now();
      const page = store.listFailedActivityJobs({
        userId: user.id,
        limit: parsed.data.limit,
        ...(cursor ? { cursor } : {}),
      });
      return {
        failures: page.jobs.map((job) => activityJob(job, store.events(job.id), now)),
        nextCursor: page.nextCursor ? encodeActivityCursor(page.nextCursor) : null,
        total: store.countFailedActivityJobs(user.id),
      };
    });
    protectedApi.get("/api/v1/jobs/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const user = auth.user(request)!;
      const job = store.getOwned(user.id, id);
      const now = Date.now();
      const jobEvents = job ? store.events(id) : [];
      return job
        ? {
            job: activityJob(job, jobEvents, now),
            events: activityEvents(job, jobEvents, now),
          }
        : reply.code(404).send({ error: "not_found" });
    });
    protectedApi.post("/api/v1/jobs/retry-failed", async (request, reply) => {
      const user = auth.user(request)!;
      if (store.countFailedActivityJobs(user.id) === 0)
        return { requested: 0, retried: 0 };
      let selections;
      try {
        selections = aiProviderService.captureSelections(user.id);
      } catch (error) {
        return reply.code(428).send({ error: "analysis_provider_required" });
      }
      const result = store.retryAllFailed(user.id, selections);
      for (const id of result.retriedIds)
        events.publish("job", { id, status: "queued" });
      return { requested: result.requested, retried: result.retriedIds.length };
    });
    protectedApi.post("/api/v1/jobs/:id/retry", async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const user = auth.user(request)!;
      if (!store.getOwned(user.id, id))
        return reply.code(404).send({ error: "not_found" });
      let selections;
      try {
        selections = aiProviderService.captureSelections(user.id);
      } catch (error) {
        return reply.code(428).send({ error: "analysis_provider_required" });
      }
      if (!store.retry(id, selections))
        return reply.code(409).send({ error: "not_retryable" });
      events.publish("job", { id, status: "queued" });
      const retried = store.getOwned(user.id, id)!;
      return { job: activityJob(retried, store.events(id)) };
    });
    protectedApi.get("/api/v1/api-keys", async (request) => {
      const user = auth.user(request)!;
      return { apiKeys: store.listApiKeys(user.id) };
    });
    protectedApi.get("/api/v1/ai-providers", async (request) =>
      aiProviderService.settings(auth.user(request)!.id),
    );
    protectedApi.put(
      "/api/v1/ai-providers/:provider",
      { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
      async (request, reply) => {
        const params = z
          .object({ provider: z.enum(aiProviderIds) })
          .safeParse(request.params);
        const body = z
          .object({ apiKey: z.string().trim().min(1).max(500) })
          .safeParse(request.body);
        if (!params.success || !body.success)
          return reply.code(400).send({ error: "invalid_request" });
        try {
          return await aiProviderService.verifyAndSave(
            auth.user(request)!.id,
            params.data.provider,
            body.data.apiKey,
          );
        } catch (error) {
          const code =
            error instanceof Error ? error.message : "provider_unavailable";
          return reply
            .code(
              code === "invalid_api_key"
                ? 401
                : code === "model_unavailable"
                  ? 409
                  : 502,
            )
            .send({ error: code });
        }
      },
    );
    protectedApi.put("/api/v1/ai-settings", async (request, reply) => {
      const body = z
        .object({
          transcription: z
            .object({ provider: z.literal("openai"), model: z.string().min(1) })
            .nullable()
            .optional(),
          analysis: z
            .object({ provider: z.enum(aiProviderIds), model: z.string().min(1) })
            .nullable()
            .optional(),
        })
        .refine((value) => value.transcription !== undefined || value.analysis !== undefined)
        .safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "invalid_request" });
      try {
        return aiProviderService.saveSelections(auth.user(request)!.id, body.data);
      } catch (error) {
        return reply.code(409).send({
          error: error instanceof Error ? error.message : "invalid_selection",
        });
      }
    });
    protectedApi.delete(
      "/api/v1/ai-providers/:provider",
      async (request, reply) => {
        const params = z.object({ provider: z.enum(aiProviderIds) }).safeParse(request.params);
        if (!params.success) return reply.code(400).send({ error: "invalid_request" });
        return aiProviderService.remove(auth.user(request)!.id, params.data.provider);
      },
    );
    protectedApi.get("/api/v1/library-exports", async (request) => ({
      exports: store.listKnowledgeExports(auth.user(request)!.id, "full"),
    }));
    protectedApi.post(
      "/api/v1/library-exports",
      { config: { rateLimit: { max: 2, timeWindow: "1 hour" } } },
      async (request, reply) => {
        const userId = auth.user(request)!.id;
        const active = store
          .listKnowledgeExports(userId, "full")
          .find((item: any) => item.status === "pending");
        if (active)
          return reply
            .code(409)
            .send({ error: "backup_in_progress", export: active });
        const created = store.createKnowledgeExport(userId, true, true, "full");
        void knowledgeExporter
          .buildFull(userId, created.id)
          .catch((error) =>
            app.log.error(
              { err: error, exportId: created.id, userId },
              "full library backup failed",
            ),
          );
        return reply.code(202).send({ export: created });
      },
    );
    protectedApi.get("/api/v1/library-exports/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const item = store.getKnowledgeExport(auth.user(request)!.id, id);
      if (!item || item.kind !== "full")
        return reply.code(404).send({ error: "not_found" });
      return { export: item };
    });
    protectedApi.get(
      "/api/v1/library-exports/:id/download",
      async (request, reply) => {
        const { id } = z
          .object({ id: z.string().uuid() })
          .parse(request.params);
        const item = store.getKnowledgeExport(auth.user(request)!.id, id);
        if (!item || item.kind !== "full")
          return reply.code(404).send({ error: "not_found" });
        if (item.status !== "complete" || !item.path)
          return reply.code(409).send({ error: "backup_not_ready" });
        if (item.expiresAt <= new Date().toISOString())
          return reply.code(410).send({ error: "backup_expired" });
        const file = await stat(item.path).catch(() => null);
        if (!file) return reply.code(404).send({ error: "backup_missing" });
        const date = item.createdAt.slice(0, 10);
        reply
          .header("Content-Type", "application/gzip")
          .header(
            "Content-Disposition",
            `attachment; filename=\"social-knowledge-backup-${date}.tar.gz\"`,
          )
          .header("Content-Length", file.size)
          .header("Cache-Control", "private, no-store")
          .header("X-Content-Type-Options", "nosniff");
        return reply.send(createReadStream(item.path));
      },
    );
    protectedApi.get("/api/v1/preferences", async (request) => {
      const user = auth.user(request)!;
      return { preferences: store.preferences(user.id) };
    });
    protectedApi.get("/api/v1/platform-connections", async (request) => ({
      connections: platformConnectionService.list(auth.user(request)!.id),
    }));
    protectedApi.put(
      "/api/v1/platform-connections/:platform",
      {
        bodyLimit: 1024 * 1024,
        config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
      },
      async (request, reply) => {
        const parsed = z
          .object({ platform: z.enum(socialPlatforms) })
          .safeParse(request.params);
        if (!parsed.success || typeof request.body !== "string")
          return reply.code(400).send({ error: "invalid_cookie_file" });
        try {
          const connection = platformConnectionService.save(
            auth.user(request)!.id,
            parsed.data.platform,
            request.body,
          );
          return { connection };
        } catch (error) {
          const code =
            error instanceof Error ? error.message : "invalid_cookie_file";
          return reply.code(400).send({
            error: ["invalid_cookie_file", "no_platform_cookies"].includes(code)
              ? code
              : "invalid_cookie_file",
          });
        }
      },
    );
    protectedApi.delete(
      "/api/v1/platform-connections/:platform",
      async (request, reply) => {
        const parsed = z
          .object({ platform: z.enum(socialPlatforms) })
          .safeParse(request.params);
        if (!parsed.success)
          return reply.code(400).send({ error: "invalid_platform" });
        return platformConnectionService.remove(
          auth.user(request)!.id,
          parsed.data.platform,
        )
          ? { ok: true }
          : reply.code(404).send({ error: "not_found" });
      },
    );
    protectedApi.get("/api/v1/oauth/connections", async (request) => ({
      connections: store.listOAuthConnections(auth.user(request)!.id),
      mcpUrl: `${config.appUrl}/mcp`,
    }));
    protectedApi.delete(
      "/api/v1/oauth/connections/:clientId",
      async (request, reply) => {
        const { clientId } = z
          .object({ clientId: z.string().uuid() })
          .parse(request.params);
        return store.revokeOAuthConnection(auth.user(request)!.id, clientId)
          ? { ok: true }
          : reply.code(404).send({ error: "not_found" });
      },
    );
    protectedApi.patch("/api/v1/preferences", async (request, reply) => {
      const user = auth.user(request)!;
      const input = z
        .object({
          defaultLanguage: z.string().trim().min(2).max(60),
          translateForeign: z.boolean(),
        })
        .safeParse(request.body);
      if (!input.success)
        return reply.code(400).send({ error: "invalid_request" });
      return { preferences: store.updatePreferences(user.id, input.data) };
    });
    protectedApi.post("/api/v1/api-keys", async (request, reply) => {
      const user = auth.user(request)!;
      const input = z
        .object({ name: z.string().trim().min(1).max(60) })
        .safeParse(request.body);
      if (!input.success)
        return reply.code(400).send({ error: "invalid_request" });
      const token = `sk_${randomBytes(32).toString("base64url")}`;
      const apiKey = store.createApiKey(
        user.id,
        input.data.name,
        AuthService.hashToken(token),
        token.slice(0, 10),
      );
      return reply.code(201).send({ apiKey, token });
    });
    protectedApi.delete("/api/v1/api-keys/:id", async (request, reply) => {
      const user = auth.user(request)!;
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      return store.deleteApiKey(user.id, id)
        ? { ok: true }
        : reply.code(404).send({ error: "not_found" });
    });
    protectedApi.get("/api/v1/captures", async (request, reply) => {
      const parsed = z
        .object({
          limit: z.coerce.number().int().min(1).max(50).default(24),
          cursor: z.string().optional(),
          search: z.string().max(200).optional(),
          platform: z.string().optional(),
          sourceType: z.string().optional(),
          nodeId: z.string().uuid().optional(),
          topic: z.string().trim().max(100).optional(),
          sort: z.enum(captureSortKeys).default(defaultCaptureSort.key),
          direction: z
            .enum(["asc", "desc"])
            .default(defaultCaptureSort.direction),
        })
        .safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues.some((issue) => issue.path[0] === "cursor")
            ? "invalid_cursor"
            : "invalid_request",
        });
      }
      const q = parsed.data;
      let cursor: CaptureCursor | undefined;
      try {
        const decoded = decodeCursor(q.cursor);
        if (decoded) {
          const raw = decoded as unknown as Record<string, unknown>;
          const isDefaultSort =
            q.sort === defaultCaptureSort.key &&
            q.direction === defaultCaptureSort.direction;
          if (
            isDefaultSort &&
            raw.sort === undefined &&
            raw.direction === undefined &&
            raw.value === undefined
          ) {
            cursor = { createdAt: decoded.createdAt, id: decoded.id };
          } else if (
            raw.sort === q.sort &&
            raw.direction === q.direction &&
            (typeof raw.value === "string" || raw.value === null)
          ) {
            cursor = { value: raw.value, id: decoded.id };
          } else {
            throw new Error("invalid_capture_cursor");
          }
        }
      } catch {
        return reply.code(400).send({ error: "invalid_cursor" });
      }
      const page = store.listCaptures({
        userId: auth.user(request)!.id,
        limit: q.limit,
        ...(cursor ? { cursor } : {}),
        sort: { key: q.sort, direction: q.direction },
        ...(q.search ? { search: q.search } : {}),
        ...(q.platform ? { platform: q.platform } : {}),
        ...(q.sourceType ? { sourceType: q.sourceType } : {}),
        ...(q.nodeId ? { nodeId: q.nodeId } : {}),
        ...(q.topic ? { topic: q.topic } : {}),
      });
      return {
        captures: page.captures.map((capture) => ({
          ...capture,
          categoryLabel: page.categoryLabels.get(capture.id) ?? null,
        })),
        nextCursor: page.nextCursor
          ? encodeCursor({
              ...page.nextCursor,
              createdAt: page.captures.at(-1)!.createdAt,
              ...("value" in page.nextCursor
                ? { sort: q.sort, direction: q.direction }
                : {}),
            })
          : null,
      };
    });
    protectedApi.get("/api/v1/capture-facets", async (request) =>
      store.captureFilterFacets(auth.user(request)!.id),
    );
    protectedApi.get("/api/v1/conversations", async (request) => {
      const user = auth.user(request)!;
      return { conversations: store.listConversations(user.id) };
    });
    protectedApi.post("/api/v1/conversations", async (request, reply) => {
      const user = auth.user(request)!;
      const input = z
        .object({ title: z.string().trim().min(1).max(100).optional() })
        .safeParse(request.body ?? {});
      if (!input.success)
        return reply.code(400).send({ error: "invalid_request" });
      return reply.code(201).send({
        conversation: store.createConversation(user.id, input.data.title),
      });
    });
    protectedApi.get("/api/v1/conversations/:id", async (request, reply) => {
      const user = auth.user(request)!;
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const conversation = store.getConversation(user.id, id);
      return conversation
        ? { conversation }
        : reply.code(404).send({ error: "not_found" });
    });
    protectedApi.delete("/api/v1/conversations/:id", async (request, reply) => {
      const user = auth.user(request)!;
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      return store.deleteConversation(user.id, id)
        ? { ok: true }
        : reply.code(404).send({ error: "not_found" });
    });
    protectedApi.post(
      "/api/v1/conversations/:id/messages",
      { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
      async (request, reply) => {
        const user = auth.user(request)!;
        if (!aiProviderService.settings(user.id).readiness.ask)
          return reply.code(428).send({ error: "analysis_provider_required" });
        const { id } = z
          .object({ id: z.string().uuid() })
          .parse(request.params);
        const input = z
          .object({
            message: z.string().trim().min(1).max(2000),
            requestId: requestIdSchema.optional(),
          })
          .safeParse(request.body);
        if (!input.success) {
          request.log.warn(
            {
              invalidFields: [
                ...new Set(input.error.issues.map((issue) => issue.path[0])),
              ],
            },
            "Ask AI request validation failed",
          );
          return reply.code(400).send({
            error: input.error.issues.some(
              (issue) => issue.path[0] === "message",
            )
              ? "invalid_message"
              : "invalid_request_id",
          });
        }
        const requestId = input.data.requestId ?? randomUUID();
        try {
          const turn = store.beginConversationTurn(
            user.id,
            id,
            input.data.message,
            requestId,
          );
          if (turn.existing)
            return reply.code(409).send({
              error:
                turn.status === "pending"
                  ? "conversation_busy"
                  : "request_already_processed",
              assistantId: turn.assistantId,
            });
          const smokeMode =
            user.role === "smoke" && input.data.message === "__smoke_failure__"
              ? "failure"
              : user.role === "smoke" && input.data.message === "__smoke_slow__"
                ? "slow"
                : user.role === "smoke" &&
                    input.data.message === "__smoke_stream__"
                  ? "stream"
                  : undefined;
          return streamAnswer(
            request,
            reply,
            user.id,
            id,
            turn.assistantId,
            input.data.message,
            smokeMode,
          );
        } catch (error) {
          const code = error instanceof Error ? error.message : "unknown";
          return reply
            .code(
              code === "conversation_not_found"
                ? 404
                : code === "conversation_busy"
                  ? 409
                  : 500,
            )
            .send({ error: code });
        }
      },
    );
    protectedApi.post(
      "/api/v1/conversations/:id/messages/:messageId/retry",
      { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
      async (request, reply) => {
        const user = auth.user(request)!;
        if (!aiProviderService.settings(user.id).readiness.ask)
          return reply.code(428).send({ error: "analysis_provider_required" });
        const { id, messageId } = z
          .object({ id: z.string().uuid(), messageId: z.string().uuid() })
          .parse(request.params);
        const input = z
          .object({ requestId: requestIdSchema.optional() })
          .safeParse(request.body);
        if (!input.success) {
          request.log.warn(
            { invalidFields: ["requestId"] },
            "Ask AI retry validation failed",
          );
          return reply.code(400).send({ error: "invalid_request_id" });
        }
        try {
          const attempt = store.beginConversationRetry(
            user.id,
            id,
            messageId,
            input.data.requestId ?? randomUUID(),
          );
          if (attempt.existing)
            return reply.code(409).send({
              error:
                attempt.status === "pending"
                  ? "conversation_busy"
                  : "request_already_processed",
              assistantId: attempt.assistantId,
            });
          const smokeMode =
            user.role === "smoke" &&
            [
              "__smoke_failure__",
              "__smoke_slow__",
              "__smoke_stream__",
            ].includes(attempt.question)
              ? "complete"
              : undefined;
          return streamAnswer(
            request,
            reply,
            user.id,
            id,
            attempt.assistantId,
            attempt.question,
            smokeMode,
          );
        } catch (error) {
          const code = error instanceof Error ? error.message : "unknown";
          return reply
            .code(
              code === "conversation_busy"
                ? 409
                : code === "not_retryable"
                  ? 409
                  : 404,
            )
            .send({ error: code });
        }
      },
    );
    protectedApi.get("/api/v1/captures/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const capture = store.getOwnedCapture(auth.user(request)!.id, id);
      return capture
        ? { capture }
        : reply.code(404).send({ error: "not_found" });
    });
    protectedApi.get("/api/v1/library/tree", async (request) => ({
      nodes: store.libraryTree(auth.user(request)!.id),
      unclassifiedCount: store.unclassifiedCaptureCount(
        auth.user(request)!.id,
      ),
    }));
    protectedApi.get("/api/v1/library/nodes/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const node = store.libraryNode(id, auth.user(request)!.id);
      if (!node) return reply.code(404).send({ error: "not_found" });
      return { node, markdown: userNodeMarkdown(node) };
    });
    protectedApi.get("/api/v1/library/unclassified", async (request) => ({
      captures: store.unclassifiedCaptures(auth.user(request)!.id),
    }));
    protectedApi.get(
      "/api/v1/captures/:id/markdown",
      async (request, reply) => {
        const { id } = z
          .object({ id: z.string().uuid() })
          .parse(request.params);
        if (!store.getOwnedCapture(auth.user(request)!.id, id))
          return reply.code(404).send({ error: "not_found" });
        const markdown = await library.readCapture(id);
        return markdown === null
          ? reply.code(404).send({ error: "not_found" })
          : { markdown };
      },
    );
    protectedApi.patch(
      "/api/v1/captures/:id/classification",
      async (request, reply) => {
        const { id } = z
          .object({ id: z.string().uuid() })
          .parse(request.params);
        if (!store.getOwnedCapture(auth.user(request)!.id, id))
          return reply.code(404).send({ error: "not_found" });
        const input = z
          .object({ nodeId: z.string().uuid() })
          .safeParse(request.body);
        if (!input.success)
          return reply.code(400).send({ error: "invalid_request" });
        try {
          store.moveCapture(id, input.data.nodeId);
          await library.regenerateAll();
          events.publish("library", { action: "capture_moved", captureId: id });
          return { assignment: store.libraryAssignment(id) };
        } catch (error) {
          return reply
            .code(409)
            .send({ error: "invalid_move", message: String(error) });
        }
      },
    );
    protectedApi.patch("/api/v1/library/nodes/:id", async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const input = z
        .object({ label: z.string().trim().min(1).max(80) })
        .safeParse(request.body);
      if (!input.success)
        return reply.code(400).send({ error: "invalid_request" });
      try {
        const node = store.renameLibraryNode(id, input.data.label);
        await library.regenerateAll();
        events.publish("library", { action: "node_renamed", nodeId: id });
        return { node };
      } catch (error) {
        return reply
          .code(409)
          .send({ error: "invalid_rename", message: String(error) });
      }
    });
    protectedApi.post(
      "/api/v1/library/nodes/:id/merge",
      async (request, reply) => {
        const { id } = z
          .object({ id: z.string().uuid() })
          .parse(request.params);
        const input = z
          .object({ targetNodeId: z.string().uuid() })
          .safeParse(request.body);
        if (!input.success)
          return reply.code(400).send({ error: "invalid_request" });
        try {
          const node = store.mergeLibraryNode(id, input.data.targetNodeId);
          await library.regenerateAll();
          events.publish("library", {
            action: "node_merged",
            nodeId: id,
            targetNodeId: input.data.targetNodeId,
          });
          return { node };
        } catch (error) {
          return reply
            .code(409)
            .send({ error: "invalid_merge", message: String(error) });
        }
      },
    );
    protectedApi.get(
      "/api/v1/captures/:id/assets/:assetId",
      async (request, reply) => {
        const { id, assetId } = z
          .object({ id: z.string().uuid(), assetId: z.string().uuid() })
          .parse(request.params);
        const asset = store.getOwnedAsset(auth.user(request)!.id, id, assetId);
        if (!asset) return reply.code(404).send({ error: "not_found" });
        const file = await stat(asset.path);
        const range = request.headers.range;
        reply
          .header("Accept-Ranges", "bytes")
          .header("Content-Type", asset.mimeType)
          .header("Cache-Control", "private, max-age=3600");
        if (range) {
          const match = /bytes=(\d+)-(\d*)/.exec(range);
          if (!match) return reply.code(416).send();
          const start = Number(match[1]);
          const end = match[2] ? Number(match[2]) : file.size - 1;
          if (start > end || end >= file.size) return reply.code(416).send();
          reply
            .code(206)
            .header("Content-Range", `bytes ${start}-${end}/${file.size}`)
            .header("Content-Length", end - start + 1);
          return reply.send(createReadStream(asset.path, { start, end }));
        }
        reply.header("Content-Length", file.size);
        return reply.send(createReadStream(asset.path));
      },
    );
    protectedApi.get("/api/v1/events", async (request, reply) => {
      const userId = auth.user(request)!.id;
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      const listener = (event: unknown) => {
        if (canReceiveLiveEvent(store, userId, event))
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      events.on("event", listener);
      const timer = setInterval(
        () => reply.raw.write(": keepalive\n\n"),
        20000,
      );
      request.raw.on("close", () => {
        clearInterval(timer);
        events.off("event", listener);
      });
    });
  });
  app.get("/*", async (_request, reply) => reply.sendFile("index.html"));
  return app;
}
