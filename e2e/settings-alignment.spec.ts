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
import { shortcutDownloads } from "../web/shortcut-setup.js";

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

test("settings topics keep their geometry when scrolling changes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1020 });
  await page.goto(`http://127.0.0.1:${port}/?tab=settings`);
  await page.getByLabel("Username").fill("qa-user");
  await page.getByLabel("Password").fill("a-strong-qa-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Open Settings", exact: true }).click();
  const sidebar = page.locator(".settings-topic-sidebar");
  await expect(sidebar).toBeVisible();
  const geometry = () => page.evaluate(() => [".shell", ".settings-heading", ".settings-topic-sidebar", ".settings-panels"].map(selector => {
    const rect = document.querySelector(selector)!.getBoundingClientRect();
    return { x: rect.x, y: rect.y + window.scrollY, width: rect.width };
  }));
  const baseline = await geometry();
  for (const name of ["AI", "Connections", "API keys", "Data & export", "My account", "Overview"]) {
    await sidebar.getByRole("button", { name, exact: true }).click();
    expect(await geometry()).toEqual(baseline);
  }
  // Force a classic scrollbar even on platforms using overlay scrollbars.
  // The reserved gutter must make adding overflow geometry-neutral.
  await page.addStyleTag({ content: "html::-webkit-scrollbar { width: 16px; }" });
  const classicBaseline = await geometry();
  await page.evaluate(() => { document.body.style.minHeight = "200vh"; });
  expect(await geometry()).toEqual(classicBaseline);
  await page.evaluate(() => { document.body.style.minHeight = ""; });
  await sidebar.getByRole("button", { name: "AI", exact: true }).click();
  for (const width of [1100, 820]) {
    await page.setViewportSize({ width, height: 1020 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".settings-mobile-topics")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});


test("signed-in users can download the signed Shortcut from API key settings", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}`);
  await expect(page.getByRole("link", { name: "Download iPhone Shortcut" })).toHaveCount(0);
  await page.getByLabel("Username").fill("qa-user");
  await page.getByLabel("Password").fill("a-strong-qa-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Open Settings", exact: true }).click();
  await page.getByRole("navigation", { name: "Settings topics" }).getByRole("button", { name: "API keys", exact: true }).click();
  const setup = page.getByRole("region", { name: "Save reels from your iPhone" });
  await expect(setup).toContainText("contains no API key");
  await expect(page.getByRole("button", { name: "Create API key", exact: true })).toBeVisible();
  await setup.getByRole("button", { name: "Create Shortcut key", exact: true }).click();
  await expect(setup.getByLabel("Shortcut key (shown only this visit)")).toHaveValue(/^sk_/);
  await expect(setup.getByRole("button", { name: "Create Shortcut key", exact: true })).toBeDisabled();
  await expect(page.locator(".settings-api-keys-card .key-list")).toContainText("Capture only");
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
    const link = setup.getByRole("link", { name: variant === "completion" ? "Download iPhone Shortcut" : "Receipt-only version", exact: true });
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
  await expect(setup.getByRole("link", { name: "Download iPhone Shortcut", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.locator(".settings-api-keys-card .key-list").getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(setup.getByLabel("Shortcut key (shown only this visit)")).toHaveCount(0);
  await expect(setup.getByRole("status")).toHaveCount(0);
  await expect(setup.getByRole("button", { name: "Create Shortcut key", exact: true })).toBeEnabled();
  await setup.screenshot({ path: path.join(os.tmpdir(), "social-shortcut-settings-mobile.png") });
});
