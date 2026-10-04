import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthService } from "../src/auth.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { normalizeSocialUrl, normalizeSubmissionUrl } from "../src/url.js";
import { testConfig } from "./helpers.js";

describe("Shortcut receipts", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });
  async function fixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), "shortcut-receipts-"));
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    const owner = store.createUser("owner", "unused-test-hash");
    const other = store.createUser("other", "unused-test-hash");
    const token = "account-test-token";
    store.createApiKey(
      owner.id,
      "Shortcut",
      AuthService.hashToken(token),
      "test",
    );
    store.createApiKey(
      other.id,
      "Other",
      AuthService.hashToken("other-token"),
      "other",
    );
    const app = buildApp(config, store, new EventHub());
    cleanups.push(async () => {
      await app.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    });
    const headers = { authorization: `Bearer ${token}` };
    const submit = (url: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/jobs",
        headers,
        payload: { url },
      });
    function configure() {
      store.saveAiProviderConnection(owner.id, "openai", "test", "test-key");
      store.saveAiTaskSelections(owner.id, {
        transcriptionProvider: "openai",
        transcriptionModel: config.transcriptionModel,
        analysisProvider: "openai",
        analysisModel: config.analysisModel,
      });
    }
    return { config, store, owner, app, headers, submit, configure };
  }
  it.each([
    "https://www.tiktok.com/@example/video/123",
    "https://example.com/watch/123",
  ])("retains unsupported URL without ever queueing media: %s", async (url) => {
    const { store, owner, submit, app, headers } = await fixture();
    const response = await submit(url);
    expect(response.statusCode).toBe(202);
    const receipt = response.json();
    expect(receipt).toMatchObject({
      received: true,
      created: true,
      retried: false,
      job: {
        status: "failed",
        errorCode: "unsupported_platform",
        normalizedUrl: url,
      },
    });
    expect(store.getOwned(owner.id, receipt.job.id)?.sourceUrl).toBe(url);
    expect(store.retry(receipt.job.id)).toBe(false);
    expect(store.retryAllFailed(owner.id).retriedIds).toEqual([]);
    const duplicate = await submit(url);
    expect(duplicate.json()).toMatchObject({
      created: false,
      retried: false,
      job: { id: receipt.job.id, status: "failed" },
    });
    const status = await app.inject({
      url: `/api/v1/shortcut/jobs/${receipt.job.id}`,
      headers,
    });
    expect(status.json().message).toContain("not supported");
    expect(status.headers["cache-control"]).toBe("no-store");
  });
  it("retains URL before AI setup, then retries same record after configuration", async () => {
    const { store, owner, submit, configure } = await fixture();
    const url = "https://www.instagram.com/reel/example";
    const response = await submit(url);
    expect(response.statusCode).toBe(428);
    expect(response.json()).toMatchObject({
      received: true,
      error: "transcription_required",
      job: { status: "failed", errorCode: "ai_setup_required" },
    });
    const id = response.json().job.id;
    expect(store.getOwned(owner.id, id)?.sourceUrl).toBe(url);
    configure();
    const retried = await submit(url);
    expect(retried.statusCode).toBe(202);
    expect(retried.json()).toMatchObject({
      received: true,
      created: false,
      retried: true,
      job: { id, status: "queued", errorCode: null },
    });
  });
  it("scopes status to credential owner, permits legacy token, rejects malformed and revoked credentials", async () => {
    const { config, store, owner, submit, app, headers, configure } =
      await fixture();
    configure();
    const id = (await submit("https://fb.watch/example")).json().job.id;
    const url = `/api/v1/shortcut/jobs/${id}`;
    expect((await app.inject({ url, headers })).json().job.status).toBe(
      "queued",
    );
    expect(
      (
        await app.inject({
          url,
          headers: { authorization: `Bearer ${config.apiToken}` },
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url,
          headers: { authorization: "Bearer other-token" },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: "/api/v1/shortcut/jobs/invalid", headers }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          url: `/api/v1/shortcut/jobs/${randomUUID()}`,
          headers,
        })
      ).statusCode,
    ).toBe(404);
    const key = store.listApiKeys(owner.id)[0] as { id: string };
    store.deleteApiKey(owner.id, key.id);
    expect((await app.inject({ url, headers })).statusCode).toBe(401);
  });
  it("reports completion and safe failure copy without raw diagnostics", async () => {
    const { store, submit, app, headers, configure } = await fixture();
    configure();
    const id = (await submit("https://fb.watch/example")).json().job.id;
    store.setStatus(id, "complete");
    const url = `/api/v1/shortcut/jobs/${id}`;
    expect((await app.inject({ url, headers })).json().job.status).toBe(
      "complete",
    );
    store.fail(
      id,
      {
        code: "private_post",
        title: "Private post",
        message: "private",
        diagnostic: "SECRET filesystem /private/path",
      },
      0,
    );
    const response = await app.inject({ url, headers });
    expect(response.json()).toMatchObject({
      job: { status: "failed", errorCode: "private_post" },
      message:
        "The post is private or the connected account does not have access.",
    });
    expect(response.body).not.toContain("SECRET");
  });
  it.each([
    "http://example.com/video",
    "https://user:pass@example.com/video",
    "not a url",
    "https://example.com:8443/video",
  ])("rejects unsafe input without a saved job: %s", async (url) => {
    const { submit, store, owner } = await fixture();
    expect((await submit(url)).statusCode).toBe(400);
    expect(store.list(owner.id)).toEqual([]);
  });
  it("keeps downloader allowlist strict while permitting bookmarks", () => {
    expect(() =>
      normalizeSocialUrl("https://www.tiktok.com/video/123"),
    ).toThrow();
    expect(
      normalizeSubmissionUrl("https://www.tiktok.com/video/123").platform,
    ).toBe("unsupported");
  });
});
