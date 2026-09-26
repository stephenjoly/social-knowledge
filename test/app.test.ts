import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import tar from "tar-stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, canReceiveLiveEvent } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { AuthService } from "../src/auth.js";
import { AiProviderService } from "../src/ai-providers.js";
import type { AskService } from "../src/ask.js";
import { testConfig } from "./helpers.js";

async function readTarGz(buffer: Buffer) {
  const files = new Map<string, Buffer>();
  const extract = tar.extract();
  const done = new Promise<void>((resolve, reject) => {
    extract.on("entry", (header, stream, next) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: unknown) => {
        chunks.push(Buffer.from(chunk as Uint8Array));
      });
      stream.on("end", () => {
        files.set(header.name, Buffer.concat(chunks));
        next();
      });
      stream.on("error", reject);
      stream.resume();
    });
    extract.on("finish", resolve);
    extract.on("error", reject);
  });
  extract.end(gunzipSync(buffer));
  await done;
  return files;
}

describe("API", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    vi.unstubAllGlobals();
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  it("stores provider preferences before task assignment and redacts unexpected failures", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "social-knowledge-ai-settings-"),
    );
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    const providers = new AiProviderService(store, config);
    const app = buildApp(config, store, new EventHub(), undefined, providers);
    cleanups.push(async () => {
      await app.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    });
    const setup = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: {
        username: "provider-settings",
        password: "a-strong-test-password",
        administratorAcknowledged: true,
      },
    });
    const cookie = (
      Array.isArray(setup.headers["set-cookie"])
        ? setup.headers["set-cookie"][0]
        : setup.headers["set-cookie"]
    )?.split(";")[0];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
      ),
    );
    const connected = await app.inject({
      method: "PUT",
      url: "/api/v1/ai-providers/openai",
      headers: { cookie: cookie! },
      payload: { apiKey: "sk-api-contract-test-key" },
    });
    expect(
      connected
        .json()
        .providers.find((item: { id: string }) => item.id === "openai"),
    ).toMatchObject({ configuration: null });
    const beforeConfiguration = await app.inject({
      method: "PUT",
      url: "/api/v1/ai-settings",
      headers: { cookie: cookie! },
      payload: { analysis: { provider: "openai" } },
    });
    expect(beforeConfiguration.json()).toEqual({
      error: "invalid_model_selection",
    });
    const configured = await app.inject({
      method: "PUT",
      url: "/api/v1/ai-providers/openai/configuration",
      headers: { cookie: cookie! },
      payload: {
        transcriptionModel: config.transcriptionModel,
        analysisModel: config.analysisModel,
        thinkingLevel: "high",
      },
    });
    expect(configured.statusCode).toBe(200);
    expect(configured.json().selections).toEqual({
      transcription: null,
      analysis: null,
    });
    const assigned = await app.inject({
      method: "PUT",
      url: "/api/v1/ai-settings",
      headers: { cookie: cookie! },
      payload: { analysis: { provider: "openai" } },
    });
    expect(assigned.json().selections.analysis).toEqual({
      provider: "openai",
      model: config.analysisModel,
      thinkingLevel: "high",
    });
    vi.spyOn(providers, "saveSelections").mockImplementation(() => {
      throw new Error("sqlite diagnostic at /private/secret-path");
    });
    const redacted = await app.inject({
      method: "PUT",
      url: "/api/v1/ai-settings",
      headers: { cookie: cookie! },
      payload: { analysis: null },
    });
    expect(redacted.json()).toEqual({ error: "invalid_selection" });
    expect(redacted.body).not.toContain("secret-path");
    vi.spyOn(providers, "saveConfiguration").mockImplementation(() => {
      throw new Error("database diagnostic at /private/configuration-secret");
    });
    const redactedConfiguration = await app.inject({
      method: "PUT",
      url: "/api/v1/ai-providers/openai/configuration",
      headers: { cookie: cookie! },
      payload: {
        transcriptionModel: config.transcriptionModel,
        analysisModel: config.analysisModel,
        thinkingLevel: null,
      },
    });
    expect(redactedConfiguration.json()).toEqual({
      error: "invalid_configuration",
    });
    expect(redactedConfiguration.body).not.toContain("configuration-secret");
  });

  it("exposes one no-store, audio-sized diagnostic route to an authenticated account", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "social-knowledge-ai-diagnostic-route-"),
    );
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    const providers = new AiProviderService(store, config);
    const diagnostic = vi.spyOn(providers, "testConnection").mockResolvedValue({
      ok: true,
      code: "ok",
      checkedAt: "2026-09-26T16:00:00.000Z",
      durationMs: 12,
      selection: {
        provider: "openai",
        model: config.transcriptionModel,
        thinkingLevel: null,
      },
    });
    const app = buildApp(config, store, new EventHub(), undefined, providers);
    cleanups.push(async () => {
      await app.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    });
    const setup = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: {
        username: "diagnostic-route",
        password: "a-strong-test-password",
        administratorAcknowledged: true,
      },
    });
    const cookie = (
      Array.isArray(setup.headers["set-cookie"])
        ? setup.headers["set-cookie"][0]
        : setup.headers["set-cookie"]
    )?.split(";")[0];
    const audio = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.alloc(4),
      Buffer.from("WAVE"),
      Buffer.alloc(1024 * 1024 - 12),
    ]).toString("base64");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ai-tests/transcription",
      headers: { cookie: cookie! },
      payload: { audio: { contentType: "audio/wav", base64: audio } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toMatchObject({ ok: true, code: "ok" });
    expect(diagnostic).toHaveBeenCalledWith(
      setup.json().user.id,
      "transcription",
      expect.objectContaining({ contentType: "audio/wav", base64: audio }),
    );
    const malformed = await app.inject({
      method: "POST",
      url: "/api/v1/ai-tests/analysis",
      headers: { cookie: cookie! },
      payload: { unexpected: true },
    });
    expect(malformed.statusCode).toBe(400);
  });

  it("requires a bearer token and accepts a supported URL", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-api-"));
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    store.createUser("demo", "unused-test-hash");
    const app = buildApp(config, store, new EventHub());
    cleanups.push(async () => {
      await app.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    });

    const unauthorized = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      payload: { url: "https://fb.watch/example" },
    });
    expect(unauthorized.statusCode).toBe(401);

    const missingProvider = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: { authorization: `Bearer ${config.apiToken}` },
      payload: { url: "https://fb.watch/example" },
    });
    expect(missingProvider.statusCode).toBe(428);
    expect(missingProvider.json().error).toBe("transcription_required");
    store.saveAiProviderConnection(
      store.defaultUserId()!,
      "openai",
      "test",
      "test…key",
    );
    store.saveAiTaskSelections(store.defaultUserId()!, {
      transcriptionProvider: "openai",
      transcriptionModel: config.transcriptionModel,
      analysisProvider: "openai",
      analysisModel: config.analysisModel,
    });

    const accepted = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: { authorization: `Bearer ${config.apiToken}` },
      payload: {
        url: "https://www.instagram.com/reel/example/?utm_source=share",
        note: "Lisbon ideas",
      },
    });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json().job.status).toBe("queued");
  });

  it("serves the browser test page without exposing credentials", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-ui-"));
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    const app = buildApp(config, store, new EventHub());
    cleanups.push(async () => {
      await app.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    });

    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Social Knowledge");
    expect(response.body).not.toContain(config.apiToken);
    const spec = await app.inject({ method: "GET", url: "/openapi.json" });
    expect(spec.statusCode).toBe(200);
    expect(spec.json().servers[0].url).toBe(config.appUrl);
  });

  it("serves the public roadmap and its packaged source without authentication", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "social-knowledge-roadmap-"),
    );
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    const app = buildApp(config, store, new EventHub());
    cleanups.push(async () => {
      await app.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    });

    const canonicalDashboard = await readFile(
      "docs/roadmap/2026-09-24/roadmap-dashboard.html",
      "utf8",
    );
    const roadmap = await app.inject({ method: "GET", url: "/roadmap" });
    expect(roadmap.statusCode).toBe(200);
    expect(roadmap.headers["content-type"]).toContain("text/html");
    expect(roadmap.body).toBe(canonicalDashboard);
    expect(roadmap.body).toContain('href="roadmap.md"');
    expect(roadmap.body).toContain('id="fbar"');

    const source = await app.inject({ method: "GET", url: "/roadmap.md" });
    expect(source.statusCode).toBe(200);
    expect(source.body).toContain("# Product roadmap");
  });

  it("creates the first administrator without a setup token and validates mutation origins", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "social-knowledge-auth-"),
    );
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    const app = buildApp(config, store, new EventHub());
    cleanups.push(async () => {
      await app.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    });

    const missingAcknowledgement = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: { username: "attacker", password: "a-strong-test-password" },
    });
    expect(missingAcknowledgement.statusCode).toBe(400);

    const setup = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: {
        username: "demo",
        password: "a-strong-test-password",
        administratorAcknowledged: true,
      },
    });
    expect(setup.statusCode).toBe(201);
    expect(setup.json().user).toMatchObject({
      username: "demo",
      role: "admin",
    });
    expect(setup.body).not.toContain(config.apiToken);
    const setupCookie = setup.headers["set-cookie"];
    expect(setupCookie).toBeTruthy();
    expect(setupCookie).toContain("HttpOnly");
    expect(setupCookie).toContain("Secure");
    const cookie = (
      Array.isArray(setupCookie) ? setupCookie[0] : setupCookie
    )?.split(";")[0];
    expect(cookie).toBeTruthy();
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/auth/me",
          headers: { cookie: cookie! },
        })
      ).json().user,
    ).toMatchObject({ username: "demo", role: "admin" });
    const repeatedSetup = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: {
        username: "second",
        password: "another-strong-password",
        administratorAcknowledged: true,
      },
    });
    expect(repeatedSetup.statusCode).toBe(409);
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "demo", password: "a-strong-test-password" },
    });
    expect(login.statusCode).toBe(200);

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{ id: "qwen-3.8-27b" }] }), {
            status: 200,
          }),
      ),
    );
    const aiConnection = await app.inject({
      method: "PUT",
      url: "/api/v1/ai-providers/cerebras",
      headers: { cookie: cookie! },
      payload: { apiKey: "csk-test-secret-1234" },
    });
    expect(aiConnection.statusCode).toBe(200);
    expect(aiConnection.body).not.toContain("csk-test-secret-1234");
    expect(aiConnection.json().readiness.ask).toBe(false);
    store.saveAiProviderConnection(
      setup.json().user.id,
      "openai",
      "test-openai-encrypted-payload",
      "test…key",
    );
    store.saveAiTaskSelections(setup.json().user.id, {
      transcriptionProvider: "openai",
      transcriptionModel: config.transcriptionModel,
      analysisProvider: "cerebras",
      analysisModel: config.cerebrasAnalysisModel,
    });

    const cookieExport =
      "# Netscape HTTP Cookie File\n.instagram.com\tTRUE\t/\tTRUE\t1999999999\tsessionid\tvery-private-session\n.facebook.com\tTRUE\t/\tTRUE\t1999999999\tc_user\tother-platform\n";
    const platformUpload = await app.inject({
      method: "PUT",
      url: "/api/v1/platform-connections/instagram",
      headers: { cookie: cookie!, "content-type": "text/plain" },
      payload: cookieExport,
    });
    expect(platformUpload.statusCode).toBe(200);
    expect(platformUpload.body).not.toContain("very-private-session");
    const platformList = await app.inject({
      method: "GET",
      url: "/api/v1/platform-connections",
      headers: { cookie: cookie! },
    });
    expect(platformList.statusCode).toBe(200);
    expect(platformList.json().connections).toContainEqual(
      expect.objectContaining({
        platform: "instagram",
        connected: true,
        cookieCount: 1,
      }),
    );
    expect(platformList.body).not.toContain("very-private-session");

    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/jobs",
          headers: { authorization: `Bearer ${config.apiToken}` },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/jobs",
          headers: { cookie: cookie! },
        })
      ).statusCode,
    ).toBe(200);
    const preferences = await app.inject({
      method: "PATCH",
      url: "/api/v1/preferences",
      headers: { cookie: cookie! },
      payload: { defaultLanguage: "French", translateForeign: false },
    });
    expect(preferences.statusCode).toBe(200);
    expect(preferences.json().preferences).toEqual({
      defaultLanguage: "French",
      translateForeign: false,
    });
    const createdKey = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { cookie: cookie! },
      payload: { name: "Test Shortcut" },
    });
    expect(createdKey.statusCode).toBe(201);
    expect(createdKey.json().token).toMatch(/^sk_/);
    const keyedSubmission = await app.inject({
      method: "POST",
      url: "/api/v1/jobs",
      headers: { authorization: `Bearer ${createdKey.json().token}` },
      payload: { url: "https://www.instagram.com/reel/key-test/" },
    });
    expect(keyedSubmission.statusCode).toBe(202);
    expect(keyedSubmission.json().job.aiProvider).toBeUndefined();
    const keyedJob = store.get(keyedSubmission.json().job.id)!;
    expect(keyedJob.aiProvider).toBe("cerebras");
    const archivedVideo = path.join(root, "archived-video.mp4");
    await writeFile(archivedVideo, Buffer.from("test-video-bytes"));
    const captured = store.createCapture({
      job: keyedJob,
      sourceType: "video",
      sourceId: "key-test",
      platform: "instagram",
      title: "Lisbon coffee guide",
      creator: "guide",
      creatorUrl: null,
      description: "Coffee in Lisbon",
      transcript: "Visit Example Cafe.",
      sourceLanguage: "en",
      translatedTranscript: null,
      translationLanguage: null,
      comments: [
        { author: "reader", text: "Useful", likeCount: 1, isPinned: false },
      ],
      analysis: {
        title: "Lisbon coffee guide",
        synopsis: "A Lisbon cafe recommendation.",
        whyUseful: "Use it to pick coffee.",
        takeaways: ["Example Cafe serves coffee."],
        topics: ["Lisbon", "coffee"],
        entities: [],
        recommendations: [],
        claimsNeedingVerification: [],
        evidence: [],
        classification: {
          primaryDomain: "Travel",
          country: "Portugal",
          city: "Lisbon",
          subcategory: "Restaurants",
          secondaryTopics: ["cafes"],
          confidence: 0.9,
        },
      },
      publishedAt: null,
      durationSeconds: 20,
      notePath: "Social Knowledge/Captures/key-test.md",
      assets: [
        {
          kind: "video",
          path: archivedVideo,
          mimeType: "video/mp4",
          sizeBytes: 16,
          position: 0,
        },
      ],
    })!;
    store.assignClassification(captured.id, captured.analysis.classification);
    const facets = await app.inject({
      method: "GET",
      url: "/api/v1/capture-facets",
      headers: { cookie: cookie! },
    });
    expect(facets.statusCode).toBe(200);
    expect(facets.json().categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Travel", count: 1 }),
      ]),
    );
    expect(facets.json().topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "coffee", count: 1 }),
      ]),
    );
    const travelNode = store
      .libraryTree(store.getUserByUsername("demo")!.id)
      .find((node) => node.label === "Travel")!;
    const filteredCaptures = await app.inject({
      method: "GET",
      url: `/api/v1/captures?nodeId=${travelNode.id}&topic=coffee`,
      headers: { cookie: cookie! },
    });
    expect(filteredCaptures.statusCode).toBe(200);
    expect(
      filteredCaptures.json().captures.map((item: { id: string }) => item.id),
    ).toEqual([captured.id]);
    const bearer = { authorization: `Bearer ${createdKey.json().token}` };
    const search = await app.inject({
      method: "GET",
      url: "/api/v1/knowledge/search?q=lisbon",
      headers: bearer,
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().results[0].id).toBe(captured.id);
    expect(search.json().results[0].transcript).toBeUndefined();
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/knowledge/captures?cursor=invalid",
          headers: bearer,
        })
      ).json().error,
    ).toBe("invalid_cursor");
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/knowledge/captures/${captured.id}?include=transcript,comments`,
      headers: bearer,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().capture.transcript).toContain("Example Cafe");
    expect(detail.json().capture.comments).toHaveLength(1);
    expect(JSON.stringify(detail.json())).not.toContain("notePath");
    const other = store.createUser("other-user", "hash"),
      otherToken = `sk_${"x".repeat(43)}`;
    store.createApiKey(
      other.id,
      "Other",
      AuthService.hashToken(otherToken),
      otherToken.slice(0, 10),
    );
    const otherBearer = { authorization: `Bearer ${otherToken}` };
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/knowledge/captures/${captured.id}`,
          headers: otherBearer,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/knowledge/search?q=lisbon",
          headers: otherBearer,
        })
      ).json().results,
    ).toEqual([]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/knowledge/search?q=lisbon",
          headers: { authorization: `Bearer ${config.apiToken}` },
        })
      ).statusCode,
    ).toBe(401);
    const exportResponse = await app.inject({
      method: "POST",
      url: "/api/v1/knowledge/exports",
      headers: bearer,
      payload: { include: ["transcript"] },
    });
    expect(exportResponse.statusCode).toBe(202);
    const exportId = exportResponse.json().export.id;
    await new Promise((resolve) => setTimeout(resolve, 30));
    const exportStatus = await app.inject({
      method: "GET",
      url: `/api/v1/knowledge/exports/${exportId}`,
      headers: bearer,
    });
    expect(exportStatus.json().export.status).toBe("complete");
    const backupResponse = await app.inject({
      method: "POST",
      url: "/api/v1/library-exports",
      headers: { cookie: cookie! },
    });
    expect(backupResponse.statusCode).toBe(202);
    const backupId = backupResponse.json().export.id;
    await new Promise((resolve) => setTimeout(resolve, 30));
    const backupDownload = await app.inject({
      method: "GET",
      url: `/api/v1/library-exports/${backupId}/download`,
      headers: { cookie: cookie! },
    });
    expect(backupDownload.statusCode).toBe(200);
    expect(backupDownload.headers["content-disposition"]).toContain(
      "social-knowledge-backup-",
    );
    const backupFiles = await readTarGz(backupDownload.rawPayload);
    expect(backupFiles.has("manifest.json")).toBe(true);
    expect(backupFiles.has(`captures/${captured.id}/metadata.json`)).toBe(true);
    const backupText = [...backupFiles.values()]
      .map((value) => value.toString("utf8"))
      .join("\n");
    expect(backupText).toContain("Example Cafe");
    expect(backupText).toContain("Useful");
    expect(backupText).not.toContain(createdKey.json().token);
    expect(
      backupFiles.get(`captures/${captured.id}/assets/000-video.mp4`),
    ).toEqual(Buffer.from("test-video-bytes"));
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/library-exports/${backupId}/download`,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/jobs/00000000-0000-4000-8000-000000000000/retry",
          headers: { cookie: cookie!, origin: "https://evil.example" },
        })
      ).statusCode,
    ).toBe(403);
    const createdConversation = await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers: { cookie: cookie! },
      payload: {},
    });
    expect(createdConversation.statusCode).toBe(201);
    const conversationId = createdConversation.json().conversation.id;
    const opaqueRequest = await app.inject({
      method: "POST",
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: { cookie: cookie! },
      payload: {
        message: "zzzz-no-archive-match",
        requestId: "browser.opaque-request_123",
      },
    });
    expect(opaqueRequest.statusCode).toBe(200);
    expect(opaqueRequest.body).toContain("event: completed");
    const generatedRequest = await app.inject({
      method: "POST",
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: { cookie: cookie! },
      payload: { message: "another-question-without-matches" },
    });
    expect(generatedRequest.statusCode).toBe(200);
    expect(generatedRequest.body).toContain("event: completed");
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/conversations/${conversationId}`,
          headers: { cookie: cookie! },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/conversations" }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/conversations/${conversationId}`,
          headers: { cookie: cookie! },
        })
      ).statusCode,
    ).toBe(200);
    const listedKeys = await app.inject({
      method: "GET",
      url: "/api/v1/api-keys",
      headers: { cookie: cookie! },
    });
    expect(listedKeys.statusCode).toBe(200);
    expect(listedKeys.body).not.toContain(createdKey.json().token);
    const revokedKey = await app.inject({
      method: "DELETE",
      url: `/api/v1/api-keys/${createdKey.json().apiKey.id}`,
      headers: { cookie: cookie! },
    });
    expect(revokedKey.statusCode).toBe(200);
    const revokedRead = await app.inject({
      method: "GET",
      url: "/api/v1/knowledge/search?q=lisbon",
      headers: { authorization: `Bearer ${createdKey.json().token}` },
    });
    expect(revokedRead.statusCode).toBe(401);
  });

  it("does not trust spoofed forwarded addresses", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "social-knowledge-proxy-"),
    );
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    store.createUser("demo", "unused-test-hash");
    const app = buildApp(config, store, new EventHub());
    app.get("/_test/client-ip", async (request) => ({ ip: request.ip }));
    cleanups.push(async () => {
      await app.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    });

    const response = await app.inject({
      method: "GET",
      url: "/_test/client-ip",
      headers: { "x-forwarded-for": "203.0.113.99" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().ip).not.toBe("203.0.113.99");
  });

  it("streams account events only to their owning browser session", () => {
    const store = new JobStore(":memory:");
    const owner = store.createUser("event-owner", "unused-test-hash");
    const other = store.createUser("event-other", "unused-test-hash");
    const ownerJob = store.createOrGet({
      ownerUserId: owner.id,
      sourceUrl: "https://www.instagram.com/reel/event-owner",
      normalizedUrl: "https://www.instagram.com/reel/event-owner",
      sourceHash: "event-owner",
    }).job;
    const otherJob = store.createOrGet({
      ownerUserId: other.id,
      sourceUrl: "https://www.instagram.com/reel/event-other",
      normalizedUrl: "https://www.instagram.com/reel/event-other",
      sourceHash: "event-other",
    }).job;
    const ownerEvent = {
      type: "job",
      payload: { id: ownerJob.id, status: "failed" },
    };
    const otherEvent = {
      type: "job",
      payload: { id: otherJob.id, status: "failed" },
    };

    expect(canReceiveLiveEvent(store, owner.id, ownerEvent)).toBe(true);
    expect(canReceiveLiveEvent(store, owner.id, otherEvent)).toBe(false);
    expect(
      canReceiveLiveEvent(store, owner.id, {
        type: "library",
        payload: { action: "node_renamed" },
      }),
    ).toBe(true);
    store.close();
  });

  it("limits invitation administration to administrators and issues one-time account sessions", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "social-knowledge-invites-"),
    );
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    const administrator = store.createInitialUser("archive-admin", "hash")!;
    const administratorSession = "administrator-session";
    store.createSession(
      administrator.id,
      AuthService.hashToken(administratorSession),
      new Date(Date.now() + 60_000).toISOString(),
    );
    const existingMember = store.createUser(
      "existing-member",
      "hash",
      "member",
    );
    const memberSession = "member-session";
    store.createSession(
      existingMember.id,
      AuthService.hashToken(memberSession),
      new Date(Date.now() + 60_000).toISOString(),
    );
    const app = buildApp(config, store, new EventHub());
    cleanups.push(async () => {
      await app.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    });
    const adminCookie = `social_knowledge_session=${administratorSession}`;
    const memberCookie = `social_knowledge_session=${memberSession}`;
    const tokenFrom = (url: string) =>
      new URLSearchParams(new URL(url).hash.slice(1)).get("invite")!;
    const redeem = (
      token: string,
      username: string,
      index: number,
      extra = {},
    ) =>
      app.inject({
        method: "POST",
        url: "/api/auth/invitations/redeem",
        remoteAddress: `10.0.0.${index}`,
        payload: {
          token,
          username,
          password: "a-strong-invited-password",
          ...extra,
        },
      });

    expect(
      (await app.inject({ method: "GET", url: "/api/v1/admin/users" }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/admin/users",
          headers: { cookie: memberCookie },
        })
      ).statusCode,
    ).toBe(403);
    const missingAdminAcknowledgement = await app.inject({
      method: "POST",
      url: "/api/v1/admin/invitations",
      headers: { cookie: adminCookie },
      payload: { role: "admin" },
    });
    expect(missingAdminAcknowledgement.statusCode).toBe(400);
    expect(missingAdminAcknowledgement.json().error).toBe(
      "administrator_acknowledgement_required",
    );

    const memberInvitation = await app.inject({
      method: "POST",
      url: "/api/v1/admin/invitations",
      headers: { cookie: adminCookie },
      payload: { role: "member" },
    });
    expect(memberInvitation.statusCode).toBe(201);
    expect(memberInvitation.json().invitation).toMatchObject({
      role: "member",
      consumedAt: null,
      revokedAt: null,
    });
    expect(memberInvitation.json().invitationUrl).toContain("#invite=");
    const memberToken = tokenFrom(memberInvitation.json().invitationUrl);
    const inspectMember = await app.inject({
      method: "POST",
      url: "/api/auth/invitations/inspect",
      payload: { token: memberToken },
    });
    expect(inspectMember.statusCode).toBe(200);
    expect(inspectMember.json().invitation.role).toBe("member");
    expect(
      new Date(inspectMember.json().invitation.expiresAt).getTime(),
    ).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/admin/invitations",
      headers: { cookie: adminCookie },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.body).not.toContain(memberToken);
    expect(listed.body).not.toContain("invitationUrl");

    const memberRedeemed = await redeem(memberToken, "new-member", 1);
    expect(memberRedeemed.statusCode).toBe(201);
    expect(memberRedeemed.json().user).toMatchObject({
      username: "new-member",
      role: "member",
    });
    const memberSetCookie = memberRedeemed.headers["set-cookie"];
    const newMemberCookie = (
      Array.isArray(memberSetCookie) ? memberSetCookie[0] : memberSetCookie
    )?.split(";")[0];
    expect(newMemberCookie).toBeTruthy();
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/auth/me",
          headers: { cookie: newMemberCookie! },
        })
      ).json().user,
    ).toMatchObject({ username: "new-member", role: "member" });
    expect((await redeem(memberToken, "second-use", 2)).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/admin/invitations",
          headers: { cookie: newMemberCookie! },
        })
      ).statusCode,
    ).toBe(403);

    const administratorInvitation = await app.inject({
      method: "POST",
      url: "/api/v1/admin/invitations",
      headers: { cookie: adminCookie },
      payload: { role: "admin", administratorAcknowledged: true },
    });
    const administratorToken = tokenFrom(
      administratorInvitation.json().invitationUrl,
    );
    const missingRedeemAcknowledgement = await redeem(
      administratorToken,
      "unacknowledged-admin",
      3,
    );
    expect(missingRedeemAcknowledgement.statusCode).toBe(400);
    expect(missingRedeemAcknowledgement.json().error).toBe(
      "administrator_acknowledgement_required",
    );
    const administratorRedeemed = await redeem(
      administratorToken,
      "invited-admin",
      4,
      {
        administratorAcknowledged: true,
      },
    );
    expect(administratorRedeemed.statusCode).toBe(201);
    expect(administratorRedeemed.json().user.role).toBe("admin");

    const revokeInvitation = await app.inject({
      method: "POST",
      url: "/api/v1/admin/invitations",
      headers: { cookie: adminCookie },
      payload: { role: "member" },
    });
    const revokedId = revokeInvitation.json().invitation.id;
    const revokedToken = tokenFrom(revokeInvitation.json().invitationUrl);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/admin/invitations/${revokedId}/revoke`,
          headers: { cookie: adminCookie },
        })
      ).statusCode,
    ).toBe(200);
    expect((await redeem(revokedToken, "revoked-user", 5)).statusCode).toBe(
      400,
    );

    const replaceInvitation = await app.inject({
      method: "POST",
      url: "/api/v1/admin/invitations",
      headers: { cookie: adminCookie },
      payload: { role: "admin", administratorAcknowledged: true },
    });
    const originalToken = tokenFrom(replaceInvitation.json().invitationUrl);
    const regenerated = await app.inject({
      method: "POST",
      url: `/api/v1/admin/invitations/${replaceInvitation.json().invitation.id}/regenerate`,
      headers: { cookie: adminCookie },
    });
    expect(regenerated.statusCode).toBe(201);
    expect(regenerated.json().invitation.role).toBe("admin");
    const replacementToken = tokenFrom(regenerated.json().invitationUrl);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/invitations/inspect",
          payload: { token: originalToken },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/invitations/inspect",
          payload: { token: replacementToken },
        })
      ).json().invitation.role,
    ).toBe("admin");

    const raceInvitation = await app.inject({
      method: "POST",
      url: "/api/v1/admin/invitations",
      headers: { cookie: adminCookie },
      payload: { role: "member" },
    });
    const raceToken = tokenFrom(raceInvitation.json().invitationUrl);
    const race = await Promise.all([
      redeem(raceToken, "race-winner-a", 6),
      redeem(raceToken, "race-winner-b", 7),
    ]);
    expect(race.map((response) => response.statusCode).sort()).toEqual([
      201, 400,
    ]);
  });

  it("sets streaming headers and preserves answer delta ordering", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "social-knowledge-stream-"),
    );
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    const user = store.createUser("demo", "unused-test-hash");
    store.saveAiProviderConnection(user.id, "openai", "test", "test…key");
    store.saveAiTaskSelections(user.id, {
      transcriptionProvider: "openai",
      transcriptionModel: config.transcriptionModel,
      analysisProvider: "openai",
      analysisModel: config.analysisModel,
    });
    const session = "stream-test-session";
    store.createSession(
      user.id,
      AuthService.hashToken(session),
      new Date(Date.now() + 60000).toISOString(),
    );
    const conversation = store.createConversation(user.id)!;
    const askService: Pick<AskService, "answer"> = {
      answer: async (input) => {
        input.onStatus?.("Understanding your request…");
        input.onDelta("first");
        await new Promise((resolve) => setTimeout(resolve, 25));
        input.onDelta(" second");
        return {
          answer: "first second",
          sources: [],
          sufficient: false,
          diagnostics: {
            action: "none",
            standaloneQuestion: "stream this answer",
            terms: [],
            selected: [],
            reusedCaptureIds: [],
            compacted: false,
            compactionFallback: false,
            estimatedContextTokens: 0,
          },
        };
      },
    };
    const app = buildApp(
      config,
      store,
      new EventHub(),
      undefined,
      undefined,
      askService,
    );
    cleanups.push(async () => {
      await app.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/conversations/${conversation.id}/messages`,
      headers: {
        cookie: `social_knowledge_session=${session}`,
        "content-type": "application/json",
      },
      payload: {
        message: "stream this answer",
        requestId: "stream-test-request",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.headers["x-accel-buffering"]).toBe("no");
    const wire = response.body;
    expect(wire).toContain("event: started");
    expect(wire).toContain("event: status");
    expect(wire).toContain("Understanding your request");
    expect(wire).toContain('data: {"text":"first"}');
    expect(wire).toContain('data: {"text":" second"}');
    expect(wire).toContain("event: sources");
    expect(wire).toContain("event: completed");
    expect(wire.indexOf("event: started")).toBeLessThan(
      wire.indexOf('data: {"text":"first"}'),
    );
    expect(wire.indexOf('data: {"text":"first"}')).toBeLessThan(
      wire.indexOf('data: {"text":" second"}'),
    );
    expect(wire.indexOf('data: {"text":" second"}')).toBeLessThan(
      wire.indexOf("event: sources"),
    );
    expect(wire.indexOf("event: sources")).toBeLessThan(
      wire.indexOf("event: completed"),
    );
  });
});
