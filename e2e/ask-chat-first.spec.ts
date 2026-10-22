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
let pauseNextAnswer = false;
let releaseAnswer: (() => void) | undefined;
const screenshots = path.resolve("output/playwright/ask-chat-first");

test.beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "ask-chat-first-"));
  const config = testConfig(root);
  config.appUrl = `http://127.0.0.1:${port}`;
  await mkdir(config.dataDir, { recursive: true });
  await mkdir(screenshots, { recursive: true });
  store = new JobStore(config.databasePath);
  const user = store.createUser("ask-review", await hash("synthetic-review-password"));
  const synthetic = syntheticReviewAsk(store);
  app = buildApp(config, store, new EventHub(), undefined, undefined, {
    answer: async (input) => {
      if (pauseNextAnswer) {
        pauseNextAnswer = false;
        await new Promise<void>((resolve) => { releaseAnswer = resolve; });
      }
      return synthetic.answer(input);
    },
  });
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
  const suggestions = page.locator(".ask-suggestion");
  await expect(suggestions).toHaveCount(3);
  const suggestionTops = await suggestions.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(suggestionTops).size).toBe(1);
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
  await page.getByRole("button", { name: "More actions for What have I saved about Lisbon?", exact: true }).click();
  await page.screenshot({ path: path.join(screenshots, "state-4-history.png") });
  await page.keyboard.press("Escape");
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


test("model default, one-off retry, persisted preferences and sidebar actions work", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.goto(`http://127.0.0.1:${port}/app`);
  await page.getByLabel("Username").fill("ask-review");
  await page.getByLabel("Password").fill("synthetic-review-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Leadership advice for a new manager", exact: true }).first().click();
  await page.getByTitle("Choose model for this chat", { exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Model for this chat" });
  await picker.getByRole("button", { name: /Qwen/ }).click();
  await picker.getByRole("button", { name: "Set as default", exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await (await fetch("/api/v1/ai-providers")).json()).selections.ask?.provider)).toBe("cerebras");
  await page.keyboard.press("Escape");
  await page.getByTitle("Retry with another model", { exact: true }).first().click();
  const retryPicker = page.getByRole("dialog", { name: "Retry this answer with" });
  pauseNextAnswer = true;
  await retryPicker.locator(".ask-opt").filter({ hasText: "gpt-5-mini" }).click();
  try {
    await expect(page.locator(".ask-answer").last().locator(".ask-meta-model")).toContainText("GPT-5 mini");
    await expect(page.locator(".ask-answer").last().locator(".ask-answer-body")).toHaveCount(0);
  } finally {
    releaseAnswer?.();
    releaseAnswer = undefined;
  }
  await expect.poll(() => page.evaluate(async (id) => {
    const conversation = (await (await fetch(`/api/v1/conversations/${id}`)).json()).conversation;
    const latest = conversation.messages.at(-1);
    return { provider: latest.provider, status: latest.status, chatProvider: conversation.selection.provider };
  }, firstChat)).toEqual({ provider: "openai", status: "complete", chatProvider: "cerebras" });
  await page.getByRole("button", { name: "New chat", exact: true }).first().click();
  await expect(page.getByTitle("Choose model for this chat", { exact: true })).toContainText("Qwen");
  const composer = page.getByRole("textbox", { name: "Ask your archive" });
  await composer.fill("Give me a synthetic leadership summary");
  await composer.press("Enter");
  await expect(page.locator(".ask-answer")).toContainText("Promotion strategy");
  await expect(page.locator(".ask-meta-model")).toContainText("Qwen");

  await page.locator("body").click({ position: { x: 600, y: 60 } });
  await page.keyboard.press("s");
  await expect(page.locator(".ask-sources")).toBeHidden();
  await page.getByRole("button", { name: /Source 1:/ }).first().click();
  await expect(page.locator(".ask-sources")).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await (await fetch("/api/v1/preferences")).json()).preferences.askSourcesPanel)).toBe(true);

  const title = "What have I saved about Lisbon?";
  await page.getByRole("button", { name: `More actions for ${title}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await page.getByRole("textbox", { name: "Chat title" }).fill("Synthetic renamed Lisbon chat");
  await page.getByRole("textbox", { name: "Chat title" }).press("Enter");
  await page.getByRole("button", { name: "More actions for Synthetic renamed Lisbon chat", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pin to top", exact: true }).click();
  await expect(page.getByRole("group", { name: "Pinned", exact: true })).toContainText("Synthetic renamed Lisbon chat");
  await page.getByRole("button", { name: "More actions for Synthetic renamed Lisbon chat", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export as Markdown", exact: true }).click();
  await expect((await download).suggestedFilename()).toBe("synthetic-renamed-lisbon-chat.md");
  await page.getByRole("button", { name: "More actions for Synthetic renamed Lisbon chat", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("menuitem", { name: "Delete…", exact: true }).click();
  await expect(page.getByRole("button", { name: "Synthetic renamed Lisbon chat", exact: true })).toHaveCount(0);
});


test("current model rows remain reachable by keyboard and persist answer/retry metadata on desktop and mobile", async ({
  page,
}) => {
  await page.goto(`http://127.0.0.1:${port}/app`);
  await page.getByLabel("Username").fill("ask-review");
  await page.getByLabel("Password").fill("synthetic-review-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const models = [
    { id: "gpt-6-luna", label: "GPT-6 Luna" },
    { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
    { id: "gpt-6-astra", label: "GPT-6 Astra" },
  ];
  await expect(
    page.getByRole("button", { name: "New chat", exact: true }).first(),
  ).toBeVisible();
  const defaults = await page.evaluate(
    async () => (await (await fetch("/api/v1/ai-providers")).json()).selections,
  );
  expect(defaults).toBeDefined();
  for (const width of [1360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`http://127.0.0.1:${port}/app`);
    if (width === 390)
      await page
        .getByRole("button", { name: "Open menu", exact: true })
        .click();
    await page
      .getByRole("button", { name: "New chat", exact: true })
      .first()
      .click();
    const trigger = page.getByTitle("Choose model for this chat", {
      exact: true,
    });
    await trigger.click();
    const picker = page.getByRole("dialog", { name: "Model for this chat" });
    const rows = picker.locator(".ask-opt");
    await expect(rows).toHaveCount(6);
    for (let index = 0; index < models.length; index++)
      await expect(rows.nth(index)).toContainText(models[index]!.label);
    const bounds = await picker.boundingBox();
    expect(bounds).not.toBeNull();
    expect.soft(bounds!.x).toBeGreaterThanOrEqual(0);
    expect
      .soft(bounds!.y, `${width}px picker top remains in viewport`)
      .toBeGreaterThanOrEqual(0);
    expect.soft(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect.soft(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await page.keyboard.press("Home");
    const controls = picker.locator(
      ".ask-opt:not([disabled]), .ask-seg button:not([disabled]), .ask-pfoot button:not([disabled])",
    );
    for (let index = 0; index < (await controls.count()); index++) {
      const control = controls.nth(index);
      await expect(control).toBeFocused();
      expect
        .soft(
          await control.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const hit = document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            );
            return (
              rect.y >= 0 &&
              rect.bottom <= innerHeight &&
              hit !== null &&
              element.contains(hit)
            );
          }),
          `${width}px focused control ${index} is visible and hit-testable`,
        )
        .toBe(true);
      await page.keyboard.press("ArrowDown");
    }
    for (const model of models) {
      const row = rows.filter({ hasText: model.id });
      await row.focus();
      await page.keyboard.press("Enter");
      await expect(row).toHaveAttribute("aria-pressed", "true");
      await expect(
        picker.getByRole("button", { name: "Minimal", exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(trigger).toContainText(model.label);
      await trigger.click();
    }
    await page.keyboard.press("Escape");
    const composer = page.getByRole("textbox", { name: "Ask your archive" });
    await composer.fill(`Synthetic current model summary at ${width}px`);
    const created = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/conversations",
    );
    await composer.press("Enter");
    const chatId = (await (await created).json()).conversation.id as string;
    await expect(page.locator(".ask-meta-model").last()).toContainText(
      "GPT-6 Astra",
    );
    await expect(page.locator(".ask-answer-body").last()).toContainText(
      "Promotion strategy",
    );
    const savedChat = await page.evaluate(
      async (id) =>
        (await (await fetch(`/api/v1/conversations/${id}`)).json())
          .conversation,
      chatId,
    );
    expect(savedChat.selection.model).toBe("gpt-6-astra");
    await page.reload();
    if (width === 390)
      await page
        .getByRole("button", { name: "Open menu", exact: true })
        .click();
    await page
      .getByRole("button", { name: savedChat.title, exact: true })
      .first()
      .click();
    await expect(
      page.getByTitle("Choose model for this chat", { exact: true }),
    ).toContainText("GPT-6 Astra");
    await page
      .getByTitle("Retry with another model", { exact: true })
      .last()
      .click();
    const retryPicker = page.getByRole("dialog", {
      name: "Retry this answer with",
    });
    await retryPicker
      .locator(".ask-opt")
      .filter({ hasText: "gpt-6-luna" })
      .press("Enter");
    await expect(page.locator(".ask-meta-model").last()).toContainText(
      "GPT-6 Luna",
    );
    await expect(page.locator(".ask-answer-body").last()).toContainText(
      "Promotion strategy",
    );
    await expect(
      page.getByTitle("Choose model for this chat", { exact: true }),
    ).toContainText("GPT-6 Astra");
    expect(
      await page.evaluate(
        async () =>
          (await (await fetch("/api/v1/ai-providers")).json()).selections,
      ),
    ).toEqual(defaults);
  }
});
