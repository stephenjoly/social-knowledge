import { expect, test } from "@playwright/test";
import { hash } from "@node-rs/argon2";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";
import { createHash } from "node:crypto";
import { shortcutDownloads } from "../web/shortcut-downloads.js";

const port = 8803;
let root = "";
let store: JobStore;
let app: ReturnType<typeof buildApp>;

test.beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-e2e-alignment-"));
  await mkdir(path.join(root, "data"));
  const config = testConfig(root);
  config.appUrl = `http://127.0.0.1:${port}`;
  store = new JobStore(config.databasePath);
  store.createUser("qa-user", await hash("a-strong-qa-password"));
  app = buildApp(config, store, new EventHub());
  await app.listen({ host: "127.0.0.1", port });
});

test.afterAll(async () => {
  await app.close();
  store.close();
  await rm(root, { recursive: true, force: true });
});

const openTopic = async (page: import("@playwright/test").Page, topic: string, heading: string) => {
  await page.goto(`http://127.0.0.1:${port}/?tab=settings&topic=${topic}`);
  await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
};

test("settings topics share one content column and reflow without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1020 });
  await page.goto(`http://127.0.0.1:${port}/?tab=settings`);
  await page.getByLabel("Username").fill("qa-user");
  await page.getByLabel("Password").fill("a-strong-qa-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "My account", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Settings topics" })).toHaveCount(0);
  const geometry = () => page.evaluate(() => [".st-column", ".settings-topic-heading"].map(selector => {
    const rect = document.querySelector(selector)!.getBoundingClientRect();
    return { x: rect.x, y: rect.y + window.scrollY, width: selector === ".st-column" ? rect.width : 0 };
  }));
  const baseline = await geometry();
  expect(baseline[0]!.width).toBe(780);
  const topics = [["ai", "AI & models"], ["connections", "Connections"], ["api", "API keys"], ["data", "Data & export"], ["people", "People & access"], ["overview", "My account"]] as const;
  for (const [topic, heading] of topics) {
    await openTopic(page, topic, heading);
    expect(await geometry()).toEqual(baseline);
  }
  await openTopic(page, "ai", "AI & models");
  for (const width of [1100, 1024, 820]) {
    await page.setViewportSize({ width, height: 1020 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [topic, heading] of topics) {
    await openTopic(page, topic, heading);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});


test("signed-in users can download the signed Shortcut from API key settings", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}`);
  await expect(page.getByRole("link", { name: "Add to iPhone" })).toHaveCount(0);
  await page.getByLabel("Username").fill("qa-user");
  await page.getByLabel("Password").fill("a-strong-qa-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForSelector(".app-frame");
  await openTopic(page, "api", "API keys");
  const setup = page.getByRole("region", { name: "Social Knowledge Shortcut" });
  await expect(setup.getByRole("link", { name: "Add to iPhone", exact: true })).toHaveAttribute("href", shortcutDownloads.completion);
  await expect(page.getByRole("button", { name: "Create API key", exact: true })).toBeVisible();
  const guide = setup.getByRole("button", { name: "Setup guide", exact: true });
  await expect(guide).toHaveAttribute("aria-expanded", "false");
  await guide.click();
  await expect(guide).toHaveAttribute("aria-expanded", "true");
  await expect(setup).toContainText("contains no API key");
  await setup.getByRole("button", { name: "Create Shortcut key", exact: true }).click();
  await expect(setup.getByLabel("Shortcut key (shown only this visit)")).toHaveValue(/^sk_/);
  await expect(setup.getByRole("button", { name: "Create Shortcut key", exact: true })).toBeDisabled();
  await expect(page.locator(".st-key-list")).toContainText("Capture only");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await setup.getByRole("button", { name: "Copy Shortcut key", exact: true }).click();
  await expect(setup.getByRole("status")).toContainText("Select and copy");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } }));
  await setup.getByRole("button", { name: "Copy Shortcut key", exact: true }).click();
  await expect(setup.getByRole("status")).toContainText("Key copied");
  await setup.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(setup.getByRole("status")).toContainText("Key accepted. Finish Transcription");
  expect(store.list(store.getUserByUsername("qa-user")!.id)).toEqual([]);
  const manifest = JSON.parse(await readFile("shortcuts/manifest.json", "utf8")) as { files: Array<{ variant: string; download: string; downloadSha256: string }> };
  for (const variant of ["completion", "receipt"] as const) {
    const artifact = manifest.files.find(file => file.variant === variant)!;
    const content = await readFile(`shortcuts/${artifact.download}`);
    await page.route(shortcutDownloads[variant], async route => {
      expect(route.request().headers().authorization).toBeUndefined();
      expect(route.request().headers().cookie).toBeUndefined();
      expect(route.request().headers().referer).toBeUndefined();
      await route.fulfill({ body: content, contentType: "application/octet-stream", headers: { "content-disposition": `attachment; filename="${artifact.download}"` } });
    });
    const link = setup.getByRole("link", { name: variant === "completion" ? "Add to iPhone" : "Receipt-only version", exact: true });
    await expect(link).toHaveAttribute("href", shortcutDownloads[variant]);
    const downloading = page.waitForEvent("download");
    await link.click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(artifact.download);
    const downloaded = await readFile((await download.path())!);
    expect(createHash("sha256").update(downloaded).digest("hex")).toBe(artifact.downloadSha256);
    await expect(setup).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(setup.getByRole("link", { name: "Add to iPhone", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.locator(".st-key-list").getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(setup.getByLabel("Shortcut key (shown only this visit)")).toHaveCount(0);
  await expect(setup.getByRole("status")).toHaveCount(0);
  await expect(setup.getByRole("button", { name: "Create Shortcut key", exact: true })).toBeEnabled();
  await setup.screenshot({ path: path.join(os.tmpdir(), "social-shortcut-settings-mobile.png") });
});
