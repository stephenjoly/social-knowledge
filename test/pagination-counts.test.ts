import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "./helpers.js";

const classification = {
  primaryDomain: "Travel" as const,
  country: "Portugal",
  city: "Lisbon",
  subcategory: "Restaurants" as const,
  secondaryTopics: [],
  confidence: 0.9,
};

function addCapture(
  store: JobStore,
  ownerUserId: string,
  index: string,
  options: {
    platform?: string;
    sourceType?: "video" | "image" | "carousel" | "mixed";
    topics?: string[];
    classify?: boolean;
    createdAt?: string;
  } = {},
) {
  const platform = options.platform ?? "instagram";
  const { job } = store.createOrGet({
    ownerUserId,
    sourceUrl: `https://www.${platform}.com/reel/pagination-${index}`,
    normalizedUrl: `https://www.${platform}.com/reel/pagination-${index}`,
    sourceHash: `pagination-${ownerUserId}-${index}`,
  });
  const capture = store.createCapture({
    job,
    sourceType: options.sourceType ?? "video",
    sourceId: `pagination-${index}`,
    platform,
    title: `Capture ${index}`,
    creator: `creator-${index}`,
    creatorUrl: null,
    description: null,
    transcript: "Transcript",
    sourceLanguage: "en",
    translatedTranscript: null,
    translationLanguage: null,
    comments: [],
    analysis: {
      title: `Capture ${index}`,
      synopsis: "Synopsis",
      whyUseful: null,
      takeaways: [],
      topics: options.topics ?? [],
      entities: [],
      recommendations: [],
      claimsNeedingVerification: [],
      evidence: [],
      classification,
    },
    publishedAt: null,
    durationSeconds: null,
    notePath: `Social Knowledge/Captures/${index}.md`,
    assets: [],
  })!;
  if (options.createdAt)
    store.database
      .prepare("UPDATE captures SET created_at=? WHERE id=?")
      .run(options.createdAt, capture.id);
  if (options.classify) store.assignClassification(capture.id, classification);
  return capture;
}

describe("capture pagination and count queries", () => {
  const stores: JobStore[] = [];
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
    for (const store of stores.splice(0)) store.close();
  });

  it("paginates by the complete timestamp/id ordering without gaps or duplicates", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const owner = store.createUser("pagination-owner", "hash");
    const createdAt = "2025-01-01T00:00:00.000Z";
    const captures = ["a", "b", "c", "d", "e"].map((index) =>
      addCapture(store, owner.id, index, { createdAt }),
    );
    const expected = (
      store.database
        .prepare(
          "SELECT id FROM captures WHERE owner_user_id=? ORDER BY created_at DESC,id DESC",
        )
        .all(owner.id) as Array<{ id: string }>
    ).map((row) => row.id);

    const pageIds: string[] = [];
    let cursor = undefined as
      | { createdAt: string; id: string }
      | undefined;
    for (;;) {
      const page = store.listCaptures({
        userId: owner.id,
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      pageIds.push(...page.captures.map((capture) => capture.id));
      if (!page.nextCursor) {
        expect(page.captures).toHaveLength(1);
        break;
      }
      cursor = page.nextCursor;
    }

    expect(pageIds).toEqual(expected);
    expect(new Set(pageIds).size).toBe(captures.length);
  });

  it("keeps filters and ownership constraints on every page", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const owner = store.createUser("filter-owner", "hash");
    const other = store.createUser("filter-other", "hash");
    addCapture(store, owner.id, "instagram-1", {
      topics: ["coffee"],
      createdAt: "2025-01-03T00:00:00.000Z",
    });
    addCapture(store, owner.id, "facebook-1", {
      platform: "facebook",
      topics: ["coffee"],
      createdAt: "2025-01-02T00:00:00.000Z",
    });
    addCapture(store, owner.id, "image-1", {
      sourceType: "image",
      topics: ["coffee"],
      createdAt: "2025-01-01T00:00:00.000Z",
    });
    addCapture(store, other.id, "other-1", {
      topics: ["coffee"],
      createdAt: "2025-01-04T00:00:00.000Z",
    });

    expect(
      store
        .listCaptures({ userId: owner.id, limit: 10, platform: "facebook" })
        .captures.map((capture) => capture.platform),
    ).toEqual(["facebook"]);
    expect(
      store
        .listCaptures({ userId: owner.id, limit: 10, sourceType: "image" })
        .captures.map((capture) => capture.sourceType),
    ).toEqual(["image"]);
    expect(
      store
        .listCaptures({ userId: owner.id, limit: 10, topic: "coffee" })
        .captures,
    ).toHaveLength(3);
  });

  it("computes owner-scoped hierarchy, unclassified, and topic counts in SQL", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const owner = store.createUser("count-owner", "hash");
    const other = store.createUser("count-other", "hash");
    addCapture(store, owner.id, "count-1", {
      topics: ["Coffee", "coffee", "Trips"],
      classify: true,
    });
    addCapture(store, owner.id, "count-2", {
      topics: ["coffee", "Trips"],
      classify: true,
    });
    const malformed = addCapture(store, owner.id, "count-malformed", {
      topics: ["ignored"],
    });
    store.database
      .prepare("UPDATE captures SET analysis_json=? WHERE id=?")
      .run("not-json", malformed.id);
    addCapture(store, other.id, "count-other", {
      topics: ["coffee"],
      classify: true,
    });

    const ownerTree = store.libraryTree(owner.id);
    expect(ownerTree.find((node) => node.label === "Travel")?.captureCount).toBe(
      2,
    );
    expect(
      ownerTree.find((node) => node.label === "Restaurants")?.captureCount,
    ).toBe(2);
    const restaurants = ownerTree.find((node) => node.label === "Restaurants")!;
    expect(store.libraryNode(restaurants.id, owner.id)?.captureCount).toBe(2);
    expect(store.libraryNode(restaurants.id, other.id)?.captureCount).toBe(1);
    expect(store.libraryTree(other.id).find((node) => node.label === "Travel")?.captureCount).toBe(1);
    expect(store.unclassifiedCaptureCount(owner.id)).toBe(1);

    const facets = store.captureFilterFacets(owner.id);
    expect(facets.topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Coffee", count: 2 }),
        expect.objectContaining({ label: "Trips", count: 2 }),
      ]),
    );
    expect(facets.topics).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "ignored" })]),
    );
  });

  it("returns opaque cursors and exact unclassified counts through the browser API", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "social-knowledge-pagination-"),
    );
    await mkdir(`${root}/data`);
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    stores.push(store);
    const app = buildApp(config, store, new EventHub());
    cleanups.push(async () => {
      await app.close();
      await rm(root, { recursive: true, force: true });
    });
    const setup = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      headers: { authorization: `Bearer ${config.apiToken}` },
      payload: { username: "api-owner", password: "a-strong-test-password" },
    });
    expect(setup.statusCode).toBe(201);
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "api-owner", password: "a-strong-test-password" },
    });
    const setCookie = login.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(
      ";",
    )[0];
    const owner = store.getUserByUsername("api-owner")!;
    addCapture(store, owner.id, "api-1", {
      createdAt: "2025-01-02T00:00:00.000Z",
    });
    addCapture(store, owner.id, "api-2", {
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    const first = await app.inject({
      method: "GET",
      url: "/api/v1/captures?limit=1",
      headers: { cookie: cookie! },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().nextCursor).toEqual(expect.any(String));
    expect(first.json().nextCursor).not.toBe("2025-01-02T00:00:00.000Z");
    const second = await app.inject({
      method: "GET",
      url: `/api/v1/captures?limit=1&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: { cookie: cookie! },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().captures).toHaveLength(1);
    expect(second.json().captures[0].id).not.toBe(first.json().captures[0].id);

    const invalid = await app.inject({
      method: "GET",
      url: "/api/v1/captures?cursor=not-a-cursor",
      headers: { cookie: cookie! },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: "invalid_cursor" });
    const tree = await app.inject({
      method: "GET",
      url: "/api/v1/library/tree",
      headers: { cookie: cookie! },
    });
    expect(tree.json().unclassifiedCount).toBe(2);
  });
});
