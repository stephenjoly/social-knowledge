import { expect, test } from "@playwright/test";
import { hash } from "@node-rs/argon2";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";

const port = 8801;
let root = "";
let store: JobStore;
let app: ReturnType<typeof buildApp>;

test.beforeAll(async () => {
  root = await mkdtemp(
    path.join(os.tmpdir(), "social-knowledge-e2e-library-home-"),
  );
  await mkdir(path.join(root, "data"));
  const config = testConfig(root);
  config.appUrl = `http://127.0.0.1:${port}`;
  store = new JobStore(config.databasePath);
  const user = store.createUser(
    "library-user",
    await hash("a-strong-library-password"),
  );
  const job = store.createOrGet({
    ownerUserId: user.id,
    sourceUrl: "https://www.instagram.com/reel/library-fixture/",
    normalizedUrl: "https://www.instagram.com/reel/library-fixture/",
    sourceHash: "library-home-fixture",
    userNote: "",
  }).job;
  const notePath = "Social Knowledge/Captures/library-home-fixture.md";
  await mkdir(path.dirname(path.join(config.vaultDir, notePath)), {
    recursive: true,
  });
  await writeFile(
    path.join(config.vaultDir, notePath),
    "# Strength training fixture\n\nA generated note for library browsing tests.\n",
  );
  const capture = store.createCapture({
    job,
    sourceType: "video",
    sourceId: "library-fixture",
    platform: "instagram",
    title: "Strength training fixture",
    creator: "fixture creator",
    creatorUrl: null,
    description: "Synthetic library capture.",
    transcript: "Synthetic transcript.",
    sourceLanguage: "en",
    translatedTranscript: null,
    translationLanguage: null,
    comments: [],
    analysis: {
      title: "Strength training fixture",
      synopsis: "Synthetic library capture.",
      whyUseful: "Exercises the library home journey.",
      takeaways: ["A fixture can be opened from a topic."],
      topics: ["strength training"],
      entities: [],
      recommendations: [],
      claimsNeedingVerification: [],
      evidence: [],
      classification: {
        primaryDomain: "Health & Wellness",
        country: null,
        city: null,
        subcategory: "Strength Training",
        secondaryTopics: ["strength training"],
        confidence: 0.9,
      },
    },
    publishedAt: null,
    durationSeconds: 30,
    notePath,
    assets: [],
  })!;
  store.assignClassification(capture.id, capture.analysis.classification);
  app = buildApp(config, store, new EventHub());
  await app.listen({ host: "127.0.0.1", port });
});

test.afterAll(async () => {
  await app.close();
  store.close();
  await rm(root, { recursive: true, force: true });
});

test("shows a useful library home and opens category, topic, and capture", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/app`);
  await page.getByLabel("Username").fill("library-user");
  await page.getByLabel("Password").fill("a-strong-library-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByRole("button", { name: "Knowledge base", exact: true })
    .click();

  const home = page.locator(".kb-home");
  const homeHeading = page.getByRole("heading", { level: 1, name: "Knowledge base" });
  await expect(homeHeading).toBeVisible();
  const category = home.getByRole("button", { name: "Health & Wellness", exact: true });
  await expect(category).toBeVisible();
  await expect(home.locator(".kb-category-card")).toHaveCount(1);
  await expect(home.locator(".kb-category-card")).toContainText("1 capture · 1 topic");
  await expect(home.getByRole("button", { name: "Strength Training", exact: true })).toBeVisible();
  await expect(home.getByText(/need(s)? a home/)).toHaveCount(0);
  await expect(home.locator(".kb-recent-row")).toHaveCount(1);
  await expect(home.locator(".kb-recent-row")).toContainText("Strength training fixture");
  await expect(home.locator(".kb-recent-row")).toContainText("Health & Wellness / Strength Training");

  const search = page.getByRole("searchbox", { name: "Search categories and topics" });
  await search.fill("strength");
  await expect(category).toBeVisible();
  await search.fill("no such topic");
  await expect(home.getByText("No categories or topics match your search.")).toBeVisible();
  await search.fill("");
  await page.screenshot({ path: "test-results/library-content-map-desktop.png", fullPage: true });

  // A failed load must not replace the current page or enter its history.
  await page.route("**/api/v1/library/nodes/*", (route) => route.fulfill({ status: 503, body: "{}" }), { times: 1 });
  await category.click();
  await expect(page.getByRole("alert")).toContainText("This page could not be loaded");
  await expect(homeHeading).toBeVisible();

  await category.click();
  const back = page.getByRole("button", { name: "Back in knowledge base", exact: true });
  const forward = page.getByRole("button", { name: "Forward in knowledge base", exact: true });
  await expect(page.getByRole("heading", { level: 1, name: "Health & Wellness" })).toBeVisible();
  await expect(back).toBeEnabled();
  await expect(forward).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Browse by insight", exact: true })).toBeVisible();
  await expect(page.locator(".kb-insight")).toContainText("A fixture can be opened from a topic.");
  await expect(page.locator(".kb-capture-row")).toContainText("Strength training fixture");
  await expect(page.getByRole("link", { name: "Ask about Health & Wellness" })).toHaveAttribute(
    "href",
    /^\/\?tab=ask&q=/,
  );

  await page
    .getByRole("group", { name: "Topics" })
    .getByRole("button", { name: "Strength Training 1", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Strength Training" })).toBeVisible();
  await back.click();
  await expect(page.getByRole("heading", { level: 1, name: "Health & Wellness" })).toBeVisible();
  await forward.click();
  await expect(page.getByRole("heading", { level: 1, name: "Strength Training" })).toBeVisible();
  await expect(forward).toBeDisabled();

  await page.locator(".kb-insight-source").first().click();
  const note = page.locator(".capture-note");
  await expect(note.getByRole("heading", { level: 1, name: "Strength training fixture" })).toBeVisible();
  await expect(note.getByRole("link", { name: "Open original post on Instagram" })).toHaveAttribute(
    "href",
    "https://www.instagram.com/reel/library-fixture/",
  );
  await expect(note.getByRole("heading", { name: "Key takeaways" })).toBeVisible();
  await expect(note).not.toContainText("library-home-fixture.md");
  await page.screenshot({ path: "test-results/library-note-navigation.png", fullPage: true });
  await note.getByRole("button", { name: "Back to Knowledge base", exact: true }).click();
  await expect(note).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Strength Training" })).toBeVisible();

  await page.locator(".kb-capture-row").first().click();
  await expect(note).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(note).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Strength Training" })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Knowledge base location" })
    .getByRole("button", { name: "Knowledge base", exact: true })
    .click();
  await expect(homeHeading).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(homeHeading).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/library-content-map-mobile.png", fullPage: true });
  await home.locator(".kb-recent-row").click();
  await expect(note).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
