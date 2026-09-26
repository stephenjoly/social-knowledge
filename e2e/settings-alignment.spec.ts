import { expect, test } from "@playwright/test";
import { hash } from "@node-rs/argon2";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";

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
  for (const name of ["AI", "Connections", "API keys", "Data & export", "Account", "Overview"]) {
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
