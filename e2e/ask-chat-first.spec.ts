import { expect, test } from "@playwright/test";
import { hash } from "@node-rs/argon2";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";
import { seedAskReviewFixture, syntheticReviewAsk } from "../src/ask-review-fixture.js";

const port = 8801;
let root: string;
let store: JobStore;
let app: ReturnType<typeof buildApp>;
let firstChat: string;
const screenshots = path.resolve("output/playwright/ask-chat-first");

test.beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "ask-chat-first-"));
  const config = testConfig(root);
  config.appUrl = `http://127.0.0.1:${port}`;
  await mkdir(config.dataDir, { recursive: true });
  await mkdir(screenshots, { recursive: true });
  store = new JobStore(config.databasePath);
  const user = store.createUser("ask-review", await hash("synthetic-review-password"));
  app = buildApp(config, store, new EventHub(), undefined, undefined, syntheticReviewAsk(store));
  await app.ready();
  firstChat = seedAskReviewFixture(store, user.id).conversationIds[0]!;
  await app.listen({ host: "127.0.0.1", port });
});
test.afterAll(async () => {
  await app?.close();
  store?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

test("six approved Ask states, model persistence, sources and Settings preserve context", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.goto(`http://127.0.0.1:${port}/app`);
  await page.getByLabel("Username").fill("ask-review");
  await page.getByLabel("Password").fill("synthetic-review-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "New chat", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "What do you want to find?", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, "state-1-home.png") });

  await page.getByRole("button", { name: "Leadership advice for a new manager", exact: true }).first().click();
  await expect(page.locator(".ask-answer").first()).toContainText("Promotion strategy");
  await expect(page.getByText("GPT-5 mini", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, "state-2-conversation.png") });

  await page.getByTitle("Choose model for this chat", { exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Model for this chat" });
  await expect(picker).toContainText("OpenAI");
  await expect(picker).toContainText("Cerebras");
  await page.screenshot({ path: path.join(screenshots, "state-3-picker.png") });
  await picker.getByRole("button", { name: /Qwen/ }).click();
  await expect.poll(async () => {
    return page.evaluate(async (id) => {
      const response = await fetch(`/api/v1/conversations/${id}`);
      const body = await response.json();
      return body.conversation?.selection?.provider;
    }, firstChat);
  }).toBe("cerebras");
  await page.keyboard.press("Escape");

  await page.locator("body").click({ position: { x: 600, y: 60 } });
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "Search chats by title" })).toBeFocused();
  await page.getByRole("searchbox", { name: "Search chats by title" }).fill("saved");
  await expect(page.getByRole("button", { name: "What have I saved about Lisbon?", exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, "state-4-history.png") });
  await page.getByRole("searchbox", { name: "Search chats by title" }).fill("");
  await page.getByRole("searchbox", { name: "Search chats by title" }).blur();

  await page.keyboard.press("s");
  await expect(page.locator(".ask-sources")).toBeHidden();
  await page.screenshot({ path: path.join(screenshots, "state-5-focus.png") });
  await page.getByRole("button", { name: /Source 1:/ }).first().click();
  await expect(page.locator(".ask-sources")).toBeVisible();

  await page.locator(".app-profile-settings").click();
  const modal = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "AI & models", exact: true }).click();
  await expect(modal).toContainText("Ask AI default");
  await page.screenshot({ path: path.join(screenshots, "state-6-settings.png") });
  await page.goBack();
  // Back may return to the preceding Settings topic before closing the modal.
  if (await modal.isVisible()) await modal.getByRole("button", { name: "Close Settings" }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".ask-answer").first()).toContainText("Promotion strategy");
  await expect(page.locator(".app-profile-settings")).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.keyboard.press("Meta+,");
  await expect(modal).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
});
