import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { JobStore, type CaptureCursor } from "../src/db.js";
import { EventHub } from "../src/events.js";
import type { LibraryClassification } from "../src/library.js";
import { testConfig } from "./helpers.js";

const classification: LibraryClassification = {
  primaryDomain: "Travel",
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
    classification?: LibraryClassification;
    title?: string;
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
    title: options.title ?? `Capture ${index}`,
    creator: `creator-${index}`,
    creatorUrl: null,
    description: null,
    transcript: "Transcript",
    sourceLanguage: "en",
    translatedTranscript: null,
    translationLanguage: null,
    comments: [],
    analysis: {
      title: options.title ?? `Capture ${index}`,
      synopsis: "Synopsis",
      whyUseful: null,
      takeaways: [],
      topics: options.topics ?? [],
      entities: [],
      recommendations: [],
      claimsNeedingVerification: [],
      evidence: [],
      classification: options.classification ?? classification,
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
  if (options.classify)
    store.assignClassification(
      capture.id,
      options.classification ?? classification,
    );
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
    let cursor = undefined as CaptureCursor | undefined;
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

  it("sorts every Inbox column across pages with nulls, multi-values, filters, and owners", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const owner = store.createUser("sort-owner", "hash");
    const other = store.createUser("sort-other", "hash");
    const createdAt = "2025-01-01T00:00:00.000Z";
    const travel = addCapture(store, owner.id, "sort-travel", {
      title: "Zulu",
      platform: "facebook",
      topics: ["beta", "Zulu"],
      classify: true,
      createdAt,
    });
    const technology = addCapture(store, owner.id, "sort-technology", {
      title: "Alpha",
      platform: "instagram",
      topics: ["Zulu", "Alpha"],
      classify: true,
      classification: {
        primaryDomain: "Technology & Tools",
        country: null,
        city: null,
        subcategory: "Technology",
        secondaryTopics: [],
        confidence: 0.9,
      },
      createdAt,
    });
    const sameTopic = addCapture(store, owner.id, "sort-same-topic", {
      title: "Beta",
      platform: "facebook",
      topics: ["alpha"],
      classify: true,
      createdAt,
    });
    const empty = addCapture(store, owner.id, "sort-empty", {
      title: "",
      platform: "instagram",
      topics: [],
      createdAt,
    });
    store.database
      .prepare("UPDATE captures SET platform='',creator=NULL WHERE id=?")
      .run(empty.id);
    addCapture(store, other.id, "sort-other", {
      title: "Before every owner result",
      platform: "facebook",
      topics: ["aaa"],
      classify: true,
      classification: {
        primaryDomain: "Learning",
        country: null,
        city: null,
        subcategory: "Guides",
        secondaryTopics: [],
        confidence: 0.9,
      },
      createdAt,
    });
    const learning = store
      .libraryTree()
      .find((node) => node.kind === "domain" && node.label === "Learning")!;
    store.moveCapture(sameTopic.id, learning.id);
    const sourceOrder = [travel, sameTopic].sort((left, right) =>
      right.id.localeCompare(left.id),
    );
    const sourceLast = sourceOrder[0]!;
    const sourceFirst = sourceOrder[1]!;
    store.database
      .prepare("UPDATE captures SET creator='Zulu creator' WHERE id=?")
      .run(sourceLast.id);
    store.database
      .prepare("UPDATE captures SET creator='Alpha creator' WHERE id=?")
      .run(sourceFirst.id);

    const pages = (sort: { key: "title" | "savedAt" | "source" | "category" | "topic"; direction: "asc" | "desc" }, platform?: string) => {
      const ids: string[] = [];
      let cursor: CaptureCursor | undefined;
      do {
        const page = store.listCaptures({
          userId: owner.id,
          limit: 1,
          sort,
          ...(platform ? { platform } : {}),
          ...(cursor ? { cursor } : {}),
        });
        ids.push(...page.captures.map((capture) => capture.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return ids;
    };

    expect(pages({ key: "title", direction: "asc" })).toEqual([
      technology.id,
      sameTopic.id,
      travel.id,
      empty.id,
    ]);
    expect(pages({ key: "title", direction: "desc" })).toEqual([
      travel.id,
      sameTopic.id,
      technology.id,
      empty.id,
    ]);
    expect(pages({ key: "savedAt", direction: "asc" })).toEqual(
      [travel, technology, sameTopic, empty]
        .map((capture) => capture.id)
        .sort((left, right) => right.localeCompare(left)),
    );
    expect(pages({ key: "source", direction: "asc" })).toEqual([
      sourceFirst.id,
      sourceLast.id,
      technology.id,
      empty.id,
    ]);
    expect(pages({ key: "category", direction: "asc" })).toEqual([
      sameTopic.id,
      technology.id,
      travel.id,
      empty.id,
    ]);
    expect(pages({ key: "topic", direction: "asc" })).toEqual([
      ...[technology.id, sameTopic.id].sort((left, right) =>
        right.localeCompare(left),
      ),
      travel.id,
      empty.id,
    ]);
    expect(pages({ key: "topic", direction: "asc" }, "facebook")).toEqual([
      sameTopic.id,
      travel.id,
    ]);
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
      store.listCaptures({ userId: owner.id, limit: 10, topic: "coffee" })
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
    expect(
      ownerTree.find((node) => node.label === "Travel")?.captureCount,
    ).toBe(2);
    expect(
      ownerTree.find((node) => node.label === "Restaurants")?.captureCount,
    ).toBe(2);
    const restaurants = ownerTree.find((node) => node.label === "Restaurants")!;
    expect(store.libraryNode(restaurants.id, owner.id)?.captureCount).toBe(2);
    expect(store.libraryNode(restaurants.id, other.id)?.captureCount).toBe(1);
    expect(
      store.libraryTree(other.id).find((node) => node.label === "Travel")
        ?.captureCount,
    ).toBe(1);
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

  it("computes owner-scoped rolling Inbox analytics at inclusive cutoffs", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const owner = store.createUser("analytics-owner", "hash");
    const other = store.createUser("analytics-other", "hash");
    const last24HoursCutoff = "2026-09-09T12:00:00.000Z";
    const last7DaysCutoff = "2026-09-03T12:00:00.000Z";

    addCapture(store, owner.id, "analytics-before", {
      createdAt: "2026-09-09T11:59:59.999Z",
    });
    addCapture(store, owner.id, "analytics-exact", {
      createdAt: last24HoursCutoff,
    });
    addCapture(store, owner.id, "analytics-after", {
      createdAt: "2026-09-10T11:00:00.000Z",
    });
    addCapture(store, owner.id, "analytics-seven-day-exact", {
      createdAt: last7DaysCutoff,
    });
    addCapture(store, owner.id, "analytics-seven-day-before", {
      createdAt: "2026-09-03T11:59:59.999Z",
    });
    addCapture(store, other.id, "analytics-other-capture", {
      createdAt: "2026-09-10T11:30:00.000Z",
    });

    const failed = store.createOrGet({
      ownerUserId: owner.id,
      sourceUrl: "https://www.instagram.com/reel/analytics-failed",
      normalizedUrl: "https://www.instagram.com/reel/analytics-failed",
      sourceHash: "analytics-failed",
    }).job;
    store.setStatus(failed.id, "failed");
    const active = store.createOrGet({
      ownerUserId: owner.id,
      sourceUrl: "https://www.instagram.com/reel/analytics-active",
      normalizedUrl: "https://www.instagram.com/reel/analytics-active",
      sourceHash: "analytics-active",
    }).job;
    store.setStatus(active.id, "processing");
    const complete = store.createOrGet({
      ownerUserId: owner.id,
      sourceUrl: "https://www.instagram.com/reel/analytics-complete",
      normalizedUrl: "https://www.instagram.com/reel/analytics-complete",
      sourceHash: "analytics-complete",
    }).job;
    store.setStatus(complete.id, "complete");
    const otherFailed = store.createOrGet({
      ownerUserId: other.id,
      sourceUrl: "https://www.instagram.com/reel/analytics-other-failed",
      normalizedUrl: "https://www.instagram.com/reel/analytics-other-failed",
      sourceHash: "analytics-other-failed",
    }).job;
    store.setStatus(otherFailed.id, "failed");

    expect(
      store.inboxAnalytics(owner.id, last24HoursCutoff, last7DaysCutoff),
    ).toEqual({
      totalCaptures: 5,
      capturesLast24Hours: 2,
      capturesLast7Days: 4,
      failedImports: 1,
    });
    expect(
      store.inboxAnalytics(other.id, last24HoursCutoff, last7DaysCutoff),
    ).toEqual({
      totalCaptures: 1,
      capturesLast24Hours: 1,
      capturesLast7Days: 1,
      failedImports: 1,
    });
    const empty = store.createUser("analytics-empty", "hash");
    expect(
      store.inboxAnalytics(empty.id, last24HoursCutoff, last7DaysCutoff),
    ).toEqual({
      totalCaptures: 0,
      capturesLast24Hours: 0,
      capturesLast7Days: 0,
      failedImports: 0,
    });

    expect(store.retry(failed.id)).toBe(true);
    expect(
      store.inboxAnalytics(owner.id, last24HoursCutoff, last7DaysCutoff)
        .failedImports,
    ).toBe(0);
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
      payload: {
        username: "api-owner",
        password: "a-strong-test-password",
        administratorAcknowledged: true,
      },
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
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/captures?sort=creator",
          headers: { cookie: cookie! },
        })
      ).json(),
    ).toEqual({ error: "invalid_request" });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/captures?direction=sideways",
          headers: { cookie: cookie! },
        })
      ).json(),
    ).toEqual({ error: "invalid_request" });
    const sorted = await app.inject({
      method: "GET",
      url: "/api/v1/captures?limit=1&sort=title&direction=asc",
      headers: { cookie: cookie! },
    });
    expect(sorted.statusCode).toBe(200);
    const sortedNext = sorted.json().nextCursor;
    expect(sortedNext).toEqual(expect.any(String));
    const sortedSecond = await app.inject({
      method: "GET",
      url: `/api/v1/captures?limit=1&sort=title&direction=asc&cursor=${encodeURIComponent(sortedNext)}`,
      headers: { cookie: cookie! },
    });
    expect(sortedSecond.statusCode).toBe(200);
    expect(sortedSecond.json().captures[0].id).not.toBe(
      sorted.json().captures[0].id,
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/captures?sort=source&direction=asc&cursor=${encodeURIComponent(sortedNext)}`,
          headers: { cookie: cookie! },
        })
      ).json(),
    ).toEqual({ error: "invalid_cursor" });
    const tree = await app.inject({
      method: "GET",
      url: "/api/v1/library/tree",
      headers: { cookie: cookie! },
    });
    expect(tree.json().unclassifiedCount).toBe(2);
  });

  it("serves authenticated account-wide inbox analytics independently of capture queries", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "social-knowledge-analytics-api-"),
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
      payload: {
        username: "analytics-api-owner",
        password: "a-strong-test-password",
        administratorAcknowledged: true,
      },
    });
    expect(setup.statusCode).toBe(201);
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        username: "analytics-api-owner",
        password: "a-strong-test-password",
      },
    });
    const setCookie = login.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(
      ";",
    )[0];
    expect(cookie).toBeTruthy();
    const owner = store.getUserByUsername("analytics-api-owner")!;
    store.saveAiProviderConnection(
      owner.id,
      "openai",
      "test-encrypted-payload",
      "test…key",
    );
    store.saveAiTaskSelections(owner.id, {
      transcriptionProvider: "openai",
      transcriptionModel: config.transcriptionModel,
      analysisProvider: "openai",
      analysisModel: config.analysisModel,
    });
    const other = store.createUser("analytics-api-other", "hash");
    addCapture(store, owner.id, "api-recent", {
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    });
    addCapture(store, owner.id, "api-old", {
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });
    addCapture(store, other.id, "api-other-recent", {
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const failed = store.createOrGet({
      ownerUserId: owner.id,
      sourceUrl: "https://www.instagram.com/reel/api-failed",
      normalizedUrl: "https://www.instagram.com/reel/api-failed",
      sourceHash: "api-failed",
    }).job;
    store.setStatus(failed.id, "failed");
    const otherFailed = store.createOrGet({
      ownerUserId: other.id,
      sourceUrl: "https://www.instagram.com/reel/api-other-failed",
      normalizedUrl: "https://www.instagram.com/reel/api-other-failed",
      sourceHash: "api-other-failed",
    }).job;
    store.setStatus(otherFailed.id, "failed");

    expect(
      (await app.inject({ method: "GET", url: "/api/v1/inbox-analytics" }))
        .statusCode,
    ).toBe(401);
    const analytics = await app.inject({
      method: "GET",
      url: "/api/v1/inbox-analytics",
      headers: { cookie: cookie! },
    });
    expect(analytics.statusCode).toBe(200);
    expect(analytics.headers["cache-control"]).toBe("no-store");
    expect(analytics.json()).toEqual({
      totalCaptures: 2,
      capturesLast24Hours: 1,
      capturesLast7Days: 2,
      failedImports: 1,
      generatedAt: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(analytics.json().generatedAt))).toBe(false);

    const filtered = await app.inject({
      method: "GET",
      url: "/api/v1/captures?limit=1&platform=facebook",
      headers: { cookie: cookie! },
    });
    expect(filtered.statusCode).toBe(200);
    const firstPage = await app.inject({
      method: "GET",
      url: "/api/v1/captures?limit=1",
      headers: { cookie: cookie! },
    });
    expect(firstPage.statusCode).toBe(200);
    expect(firstPage.json().nextCursor).toEqual(expect.any(String));
    const secondPage = await app.inject({
      method: "GET",
      url: `/api/v1/captures?limit=1&cursor=${encodeURIComponent(firstPage.json().nextCursor)}`,
      headers: { cookie: cookie! },
    });
    expect(secondPage.statusCode).toBe(200);
    const afterFilter = await app.inject({
      method: "GET",
      url: "/api/v1/inbox-analytics",
      headers: { cookie: cookie! },
    });
    expect(afterFilter.json()).toMatchObject({
      totalCaptures: 2,
      capturesLast24Hours: 1,
      capturesLast7Days: 2,
      failedImports: 1,
    });

    const retried = await app.inject({
      method: "POST",
      url: `/api/v1/jobs/${failed.id}/retry`,
      headers: { cookie: cookie! },
    });
    expect(retried.statusCode).toBe(200);
    const afterRetry = await app.inject({
      method: "GET",
      url: "/api/v1/inbox-analytics",
      headers: { cookie: cookie! },
    });
    expect(afterRetry.json()).toMatchObject({ failedImports: 0 });
  });
});
