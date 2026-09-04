import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { AuthService } from "../src/auth.js";
import { testConfig } from "./helpers.js";

describe("API", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
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

  it("separates browser sessions from the Shortcut token and validates mutation origins", async () => {
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

    const unauthorizedSetup = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: { username: "attacker", password: "a-strong-test-password" },
    });
    expect(unauthorizedSetup.statusCode).toBe(401);

    const setup = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      headers: { authorization: `Bearer ${config.apiToken}` },
      payload: { username: "demo", password: "a-strong-test-password" },
    });
    expect(setup.statusCode).toBe(201);
    const repeatedSetup = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      headers: { authorization: `Bearer ${config.apiToken}` },
      payload: { username: "second", password: "another-strong-password" },
    });
    expect(repeatedSetup.statusCode).toBe(409);
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "demo", password: "a-strong-test-password" },
    });
    expect(login.statusCode).toBe(200);
    const setCookie = login.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(
      ";",
    )[0];
    expect(cookie).toBeTruthy();

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
    const captured = store.createCapture({
      job: keyedSubmission.json().job,
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
      assets: [],
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
});
