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
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByLabel("Username").fill("library-user");
  await page.getByLabel("Password").fill("a-strong-library-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByRole("button", { name: "Knowledge base", exact: true })
    .click();

  const readingPane = page.locator(".markdown");
  const back = page.getByRole("button", { name: "Back in knowledge base", exact: true });
  const forward = page.getByRole("button", { name: "Forward in knowledge base", exact: true });
  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();
  await expect(page.getByRole("button", { name: "Capture a post", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Move capture", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Travel 0", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Unclassified 0", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  await expect(page.getByRole("button", { name: "Strength Training 1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Collapse all", exact: true }).click();
  await expect(page.getByRole("button", { name: "Strength Training 1", exact: true })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(readingPane).toContainText("Browse 1 saved capture");
  await expect(
    readingPane.getByRole("heading", { name: "Map of content" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/library-content-map-desktop.png", fullPage: true });
  // A failed load must not replace the current page or enter its history.
  await page.route("**/api/v1/library/nodes/*", (route) => route.fulfill({ status: 503, body: "{}" }), { times: 1 });
  await readingPane.getByRole("button", { name: "Strength Training", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("This page could not be loaded");
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(back).toBeDisabled();

  await readingPane
    .getByRole("button", { name: "Health & Wellness" })
    .click();
  await expect(
    readingPane.getByRole("heading", { name: "Health & Wellness" }),
  ).toBeVisible();

  await expect(readingPane.getByRole("heading", { name: "Browse by insight", exact: true })).toBeVisible();
  await expect(readingPane.getByRole("button", { name: "Strength training fixture", exact: true })).toBeVisible();
  await readingPane.getByRole("button", { name: "A fixture can be opened from a topic.", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Capture note", exact: true })).toBeVisible();
  await back.click();
  await expect(readingPane.getByRole("heading", { name: "Health & Wellness", exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Expand Health & Wellness" })
    .click();
  await page
    .getByRole("button", { name: "Strength Training 1" })
    .click();
  await expect(
    readingPane.getByRole("heading", { name: "Strength Training" }),
  ).toBeVisible();
  await readingPane
    .getByRole("button", { name: "Strength training fixture" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Capture note" }),
  ).toBeVisible();
  await expect(
    readingPane.getByRole("heading", { name: "Strength training fixture" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Open capture", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/library-note-navigation.png", fullPage: true });
  await back.click();
  await expect(page.getByRole("heading", { name: "Strength Training", exact: true }).first()).toBeVisible();
  await forward.click();
  await expect(page.getByRole("heading", { name: "Capture note", exact: true })).toBeVisible();
  await back.click();
  await back.click();
  await expect(page.getByRole("heading", { name: "Health & Wellness", exact: true }).first()).toBeVisible();
  await back.click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(back).toBeDisabled();
  await readingPane.getByRole("button", { name: "Strength Training", exact: true }).click();
  await expect(forward).toBeDisabled();
  await back.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await forward.click();
  await expect(readingPane.getByRole("heading", { name: "Strength Training", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/library-content-map-mobile.png", fullPage: true });
});
