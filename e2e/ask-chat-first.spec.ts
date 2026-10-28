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
const longChatTitle = "Synthetic long answer with eight sources";
const sidewaysChatTitle = "Synthetic adversarial wrapping and retry history";
const sidewaysToken = "UnbrokenEvidence".repeat(24);
const sidewaysTitle = "LongSourceTitle".repeat(24);
const sidewaysCreator = "CreatorLabel".repeat(24);
const sidewaysUrl = `https://www.instagram.com/reel/${"LongUrlPath".repeat(32)}/`;
const sidewaysQuestion = `Synthetic question ${"LongQuestionToken".repeat(32)}`;
let root: string;
let store: JobStore;
let app: ReturnType<typeof buildApp>;
let firstChat: string;
let reviewUserId: string;
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
  const user = store.createUser(
    "ask-review",
    await hash("synthetic-review-password"),
  );
  reviewUserId = user.id;
  const synthetic = syntheticReviewAsk(store);
  app = buildApp(config, store, new EventHub(), undefined, undefined, {
    answer: async (input) => {
      // Presentation/transport contract only; real intent routing is covered by
      // AskService tests with structured planner and generation responses.
      const conversationalReplies: Record<string, string> = {
        "Test natural conversation": "Yep, I’m here. What would you like to do with your saved posts?",
        "How do I export a chat?": "Open the chat menu and choose Export as Markdown. I can explain the steps, but I can’t export it for you.",
        "Thanks, that helps": "You’re welcome. Want to explore another idea from your saves?",
      };
      const conversationalAnswer = conversationalReplies[input.question];
      if (conversationalAnswer) {
        input.onStatus?.("Thinking about your request…");
        input.onDelta(conversationalAnswer);
        store.completeConversationAttempt(input.userId, input.conversationId, input.assistantId, conversationalAnswer, [], null);
        return {
          answer: conversationalAnswer,
          sources: [],
          sufficient: null,
          diagnostics: { action: "respond" as const, standaloneQuestion: input.question, terms: [], selected: [], reusedCaptureIds: [], compacted: false, compactionFallback: false, estimatedContextTokens: 0 },
        };
      }
      if (pauseNextAnswer) {
        pauseNextAnswer = false;
        await new Promise<void>((resolve) => {
          releaseAnswer = resolve;
        });
      }
      return synthetic.answer(input);
    },
  });
  await app.ready();
  firstChat = seedAskReviewFixture(store, user.id).conversationIds[0]!;
  // Local-only regression data: real owned capture rows, deterministic long prose.
  const template = store.ownedCaptures(user.id)[0]!;
  const sources = Array.from({ length: 8 }, (_, index) => {
    const slug = `scroll-regression-${index}`;
    const url = `https://www.instagram.com/reel/${slug}/`;
    const { job } = store.createOrGet({
      ownerUserId: user.id,
      sourceUrl: url,
      normalizedUrl: url,
      sourceHash: slug,
    });
    const title = `Synthetic source ${index + 1}: practical leadership notes`;
    const synopsis =
      "Synthetic source summary for independent scrolling. ".repeat(8);
    const capture = store.createCapture({
      ...template,
      job,
      title,
      sourceId: slug,
      description: synopsis,
      transcript: synopsis,
      analysis: { ...template.analysis, title, synopsis },
      notePath: `Synthetic/${slug}.md`,
      assets: [],
    })!;
    store.complete(job.id, capture.notePath);
    return {
      id: capture.id,
      citation: index + 1,
      title,
      creator: "synthetic.author",
      platform: "instagram",
      synopsis,
      sourceUrl: url,
      breadcrumb: ["Learning", "Reference"],
    };
  });
  const longChat = store.createConversation(user.id, longChatTitle)!;
  const attempt = store.beginConversationTurn(
    user.id,
    longChat.id,
    "Show all eight synthetic sources in a long answer",
    "synthetic-scroll-regression",
  );
  store.setConversationAttemptSelection(
    user.id,
    longChat.id,
    attempt.assistantId,
    { provider: "openai", model: "gpt-6-luna", thinkingLevel: "medium" },
  );
  const longAnswer = Array.from(
    { length: 48 },
    (_, index) =>
      `#### Synthetic section ${index + 1}\n\n${"This deterministic paragraph exercises the answer scroller while preserving the surrounding Ask shell. ".repeat(5)}[${(index % 8) + 1}]`,
  ).join("\n\n");
  store.completeConversationAttempt(
    user.id,
    longChat.id,
    attempt.assistantId,
    longAnswer,
    sources,
    true,
  );
  const wrappingSources = sources.map((source, index) => {
    const slug = `wrapping-regression-${index}`;
    const url = index === 0 ? sidewaysUrl : `https://www.instagram.com/reel/${slug}/`;
    const title = index === 0 ? sidewaysTitle : `Wrapping source ${index + 1}`;
    const creator = index === 0 ? sidewaysCreator : "synthetic.author";
    const { job } = store.createOrGet({ ownerUserId: user.id, sourceUrl: url, normalizedUrl: url, sourceHash: slug });
    const capture = store.createCapture({ ...template, job, title, creator, sourceId: slug, analysis: { ...template.analysis, title }, notePath: `Synthetic/${slug}.md`, assets: [] })!;
    store.complete(job.id, capture.notePath);
    return { ...source, id: capture.id, title, creator, sourceUrl: url };
  });
  const wrappingChat = store.createConversation(user.id, sidewaysChatTitle)!;
  const wrappingTurn = store.beginConversationTurn(user.id, wrappingChat.id, sidewaysQuestion, "synthetic-wrapping-turn");
  const wrappingAnswer = [
    `Inline code: \`${sidewaysToken}\`. [1]`,
    `Full URL: [${sidewaysUrl}](${sidewaysUrl}). [1]`,
    `\`\`\`text\n${sidewaysToken.repeat(2)}\n\`\`\``,
    `| Saved item | Evidence | Original URL |\n| --- | --- | --- |\n| ${sidewaysToken} | TableCell${sidewaysToken} | [${sidewaysUrl}](${sidewaysUrl}) |`,
    longAnswer,
  ].join("\n\n");
  store.completeConversationAttempt(user.id, wrappingChat.id, wrappingTurn.assistantId, wrappingAnswer, wrappingSources, true);
  const failedRetry = store.beginConversationRetry(user.id, wrappingChat.id, wrappingTurn.assistantId, "synthetic-wrapping-failed");
  store.setConversationAttemptSelection(user.id, wrappingChat.id, failedRetry.assistantId, { provider: "openai", model: "gpt-6.1-sol", thinkingLevel: "high" });
  store.failConversationAttempt(user.id, wrappingChat.id, failedRetry.assistantId, "failed", "timeout");
  const cancelledRetry = store.beginConversationRetry(user.id, wrappingChat.id, failedRetry.assistantId, "synthetic-wrapping-cancelled");
  store.setConversationAttemptSelection(user.id, wrappingChat.id, cancelledRetry.assistantId, { provider: "openai", model: "gpt-6-astra", thinkingLevel: "medium" });
  store.failConversationAttempt(user.id, wrappingChat.id, cancelledRetry.assistantId, "cancelled", "cancelled");
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
  await expect(page.getByText("GPT-6 Luna", { exact: false }).first()).toBeVisible();
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
  // Citation activation schedules focus into its source card on the next frame.
  // Complete that interaction before establishing a different keyboard opener.
  await expect(page.locator(".ask-source.hl .ask-source-open")).toBeFocused();

  // Focus return is a keyboard contract; Safari intentionally does not focus
  // buttons on pointer click, so establish the actual keyboard opener.
  const settingsTrigger = page.locator(".app-profile-settings");
  await settingsTrigger.focus();
  await expect(settingsTrigger).toBeFocused();
  await settingsTrigger.press("Enter");
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
  await retryPicker.locator(".ask-opt").filter({ hasText: "gpt-6-luna" }).click();
  try {
    await expect(page.locator(".ask-answer").last().locator(".ask-meta-model")).toContainText("GPT-6 Luna");
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
  await expect(composer).toHaveAttribute("aria-keyshortcuts", "Enter");
  await composer.fill("Give me a synthetic leadership summary");
  await composer.press("Enter");
  await expect(page.locator(".ask-answer")).toContainText("Promotion strategy");
  await expect(page.locator(".ask-meta-model")).toContainText("Qwen");
  await expect.poll(() => {
    const chat = store.listConversations(reviewUserId).find(({ title }) => title === "Give me a synthetic leadership summary");
    return chat ? store.getConversation(reviewUserId, chat.id)?.messages?.map(({ role, content, status, provider }) => ({ role, content, status, provider })) : null;
  }).toEqual([
    expect.objectContaining({ role: "user", content: "Give me a synthetic leadership summary", status: "complete" }),
    expect.objectContaining({ role: "assistant", content: expect.stringContaining("Promotion strategy"), status: "complete", provider: "cerebras" }),
  ]);

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

test("New chat accepts first Enter while old retry reconciles and keeps Stop on the new attempt", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.goto(`http://127.0.0.1:${port}/app`);
  await page.getByLabel("Username").fill("ask-review");
  await page.getByLabel("Password").fill("synthetic-review-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const oldTitle = "Leadership advice for a new manager";
  await page.getByRole("button", { name: oldTitle, exact: true }).first().click();
  await page.getByTitle("Choose model for this chat", { exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Model for this chat" });
  await picker.getByRole("button", { name: /Qwen/ }).click();
  const setDefault = picker.getByRole("button", { name: "Set as default", exact: true });
  if (await setDefault.isEnabled()) await setDefault.click();
  await expect.poll(() => page.evaluate(async () => (await (await fetch("/api/v1/ai-providers")).json()).selections.ask?.provider)).toBe("cerebras");
  await page.keyboard.press("Escape");

  let releaseOldSnapshot!: () => void;
  const oldSnapshotGate = new Promise<void>((resolve) => { releaseOldSnapshot = resolve; });
  let oldSnapshotHeld = false;
  const oldChatUrl = `**/api/v1/conversations/${firstChat}`;
  // Hold the authoritative snapshot after the retry's stream finishes. This
  // forces the lifecycle overlap rather than hoping network timing reproduces it.
  await page.route(oldChatUrl, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    oldSnapshotHeld = true;
    await oldSnapshotGate;
    await route.continue();
  });
  try {
    await page.getByTitle("Retry with another model", { exact: true }).first().click();
    await page.getByRole("dialog", { name: "Retry this answer with" }).locator(".ask-opt").filter({ hasText: "gpt-6-luna" }).click();
    await expect.poll(() => oldSnapshotHeld).toBe(true);
    await expect(page.getByRole("button", { name: `${oldTitle} Answering`, exact: true })).toBeVisible();
    const oldAnswer = store.getConversation(reviewUserId, firstChat)?.messages?.at(-1);
    expect(oldAnswer).toMatchObject({ status: "complete", provider: "openai", model: "gpt-6-luna", content: expect.stringContaining("Promotion strategy") });

    await page.getByRole("button", { name: "New chat", exact: true }).first().click();
    await expect(page.getByTitle("Choose model for this chat", { exact: true })).toContainText("Qwen");
    const composer = page.getByRole("textbox", { name: "Ask your archive" });
    await expect(composer).toHaveAttribute("aria-keyshortcuts", "Enter");
    pauseNextAnswer = true;
    const created = page.waitForResponse((response) => response.url().endsWith("/api/v1/conversations") && response.request().method() === "POST", { timeout: 5000 });
    const question = "Synthetic new draft during previous retry cleanup";
    await composer.fill(question);
    await composer.press("Enter");
    const { conversation } = await (await created).json();
    await expect.poll(() => Boolean(releaseAnswer)).toBe(true);
    await expect(page.locator(".ask-bubble")).toHaveText(question);
    await expect(page.locator(".ask-meta-model")).toContainText("Qwen");
    expect(store.getConversation(reviewUserId, conversation.id)?.messages?.at(-1)).toMatchObject({ status: "pending", provider: "cerebras" });

    releaseOldSnapshot();
    // The sidebar refresh is the old run's last awaited operation. Its settled
    // status proves cleanup ran while the new answer still owns the controls.
    await expect(page.getByRole("button", { name: oldTitle, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `${oldTitle} Answering`, exact: true })).toHaveCount(0);
    const stop = page.getByRole("button", { name: "Stop", exact: true });
    await expect(stop).toBeVisible();
    await stop.click();
    releaseAnswer?.();
    releaseAnswer = undefined;
    await expect.poll(() => store.getConversation(reviewUserId, conversation.id)?.messages?.at(-1)?.status).toBe("cancelled");
    await expect(page.locator(".ask-message.assistant.cancelled")).toHaveCount(1);
    await expect(composer).toHaveValue("");
    expect(store.getConversation(reviewUserId, firstChat)?.messages?.at(-1)).toEqual(oldAnswer);
  } finally {
    releaseOldSnapshot();
    releaseAnswer?.();
    releaseAnswer = undefined;
    pauseNextAnswer = false;
    if (!page.isClosed()) await page.unrouteAll({ behavior: "wait" });
  }
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
    await expect(rows).toHaveCount(4);
    await expect(rows.filter({ hasText: /gpt-5(?:[. -]|$)/ })).toHaveCount(0);
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
    await rows.filter({ hasText: "qwen-3.8-27b" }).click();
    await expect(picker).toContainText("Reasoning · qwen-3.8-27b");
    for (const effort of ["Low", "Medium", "High"]) {
      const button = picker.getByRole("radio", { name: effort, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-checked", "true");
    }
    await expect(picker.getByRole("button", { name: "Minimal", exact: true })).toHaveCount(0);
    await rows.filter({ hasText: "gpt-6-astra" }).click();
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

test("long answers and eight sources scroll independently without moving the desktop shell", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.goto(`http://127.0.0.1:${port}/app`);
  await page.getByLabel("Username").fill("ask-review");
  await page.getByLabel("Password").fill("synthetic-review-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: longChatTitle, exact: true })
    .first()
    .click();
  const thread = page.locator(".ask-thread");
  const sources = page.locator(".ask-sources-body");
  await expect(sources.locator(".ask-source")).toHaveCount(8);
  await expect(page.locator(".ask-answer-body")).toContainText(
    "Synthetic section 48",
  );
  await expect
    .poll(() =>
      thread.evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true);
  await expect
    .poll(() =>
      sources.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    )
    .toBe(true);
  const shellParts = [
    page.locator(".ask-chat-bar"),
    page.getByRole("complementary", { name: "Archive navigation" }),
    page.locator(".ask-composer-wrap"),
  ];
  let baseline = await Promise.all(
    shellParts.map((part) => part.boundingBox()),
  );
  const rootMetrics = () =>
    page.evaluate(() => ({
      x: scrollX,
      y: scrollY,
      width: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      height: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
  const assertShell = async (phase: string) => {
    const metrics = await rootMetrics();
    await testInfo.attach(`root-${phase}`, {
      body: JSON.stringify(metrics),
      contentType: "application/json",
    });
    expect.soft(metrics.x, `${phase}: root horizontal position`).toBe(0);
    expect.soft(metrics.y, `${phase}: root vertical position`).toBe(0);
    expect
      .soft(metrics.width, `${phase}: no root horizontal overflow`)
      .toBeLessThanOrEqual(metrics.clientWidth);
    expect
      .soft(metrics.height, `${phase}: no root vertical overflow`)
      .toBeLessThanOrEqual(metrics.clientHeight);
    for (let index = 0; index < shellParts.length; index++) {
      const bounds = await shellParts[index]!.boundingBox();
      expect
        .soft(bounds, `${phase}: fixed shell part ${index}`)
        .toEqual(baseline[index]);
    }
    // Reset only after recording failure, so other independent assertions run.
    await page.evaluate(() => window.scrollTo(0, 0));
  };
  await assertShell("opened");
  await page.evaluate(() => window.scrollTo(500, 10000));
  await assertShell("programmatic-scroll");
  await page.locator(".ask-chat-bar").hover();
  await page.mouse.wheel(500, 10000);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await assertShell("outer-wheel-scroll");
  await thread.evaluate((element) => {
    element.scrollTop = 0;
  });
  await sources.evaluate((element) => {
    element.scrollTop = 0;
  });
  await thread.hover();
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => thread.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(await sources.evaluate((element) => element.scrollTop)).toBe(0);
  const threadTop = await thread.evaluate((element) => element.scrollTop);
  await sources.hover();
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => sources.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(await thread.evaluate((element) => element.scrollTop)).toBe(threadTop);
  await assertShell("independent-wheel-scroll");
  await page
    .getByRole("button", { name: /^Source 8:/ })
    .last()
    .click();
  await expect(sources.locator(".ask-source.hl")).toContainText(
    "Synthetic source 8",
  );
  await assertShell("citation-click");
  await page.getByTitle("Choose model for this chat", { exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Model for this chat" }),
  ).toBeVisible();
  await assertShell("model-picker");
  await page.keyboard.press("Escape");
  await page
    .getByTitle("Rename, pin, export or delete", { exact: true })
    .click();
  await expect(page.getByRole("menu", { name: "Chat actions" })).toBeVisible();
  await assertShell("chat-menu");
  await page.keyboard.press("Escape");
  await sources
    .locator(".ask-source")
    .last()
    .getByRole("button", { name: /Open note/ })
    .click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Close note", exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close note", exact: true }).click();
  await expect(thread).toBeVisible();
  await assertShell("source-return");
  await page.locator(".app-profile-settings").click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings).toBeVisible();
  await settings
    .getByRole("button", { name: "Close Settings", exact: true })
    .click();
  await assertShell("settings-close");
  await page.setViewportSize({ width: 1280, height: 900 });
  baseline = await Promise.all(shellParts.map((part) => part.boundingBox()));
  await assertShell("desktop-resize");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(() => thread.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect.poll(() => sources.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  baseline = await Promise.all(shellParts.map((part) => part.boundingBox()));
  await assertShell("wide-desktop-resize");
  await page.evaluate(() => window.scrollTo(500, 10000));
  await assertShell("wide-programmatic-scroll");
  await thread.evaluate((element) => { element.scrollTop = 0; });
  await sources.evaluate((element) => { element.scrollTop = 0; });
  await thread.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => thread.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await sources.evaluate((element) => element.scrollTop)).toBe(0);
  const wideThreadTop = await thread.evaluate((element) => element.scrollTop);
  await sources.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => sources.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await thread.evaluate((element) => element.scrollTop)).toBe(wideThreadTop);
  await assertShell("wide-independent-wheel-scroll");
});

test("composer motion follows focus and streaming while respecting reduced motion", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.goto(`http://127.0.0.1:${port}/app`);
  await page.getByLabel("Username").fill("ask-review");
  await page.getByLabel("Password").fill("synthetic-review-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "New chat", exact: true }).first(),
  ).toBeVisible();
  const composer = page.locator(".ask-composer");
  const input = page.getByRole("textbox", { name: "Ask your archive" });
  const rootMetrics = () =>
    page.evaluate(() => ({
      x: scrollX,
      y: scrollY,
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight,
    }));
  const decoration = () =>
    composer.evaluate((element) => {
      const ring = getComputedStyle(element, "::before");
      const form = getComputedStyle(element);
      return {
        animation: ring.animationName,
        opacity: Number(ring.opacity),
        angle: Number.parseFloat(ring.getPropertyValue("--ask-border-angle")),
        shadow: form.boxShadow,
        border: form.borderColor,
      };
    });
  const observeTravel = async (phase: string) => {
    const travel = await composer.evaluate(async (element) => {
      const angle = () =>
        Number.parseFloat(
          getComputedStyle(element, "::before").getPropertyValue(
            "--ask-border-angle",
          ),
        );
      const before = angle();
      for (let frame = 0; frame < 12; frame++)
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      return { before, after: angle() };
    });
    await testInfo.attach(phase, {
      body: JSON.stringify(travel),
      contentType: "application/json",
    });
    const clockwiseDelta = (travel.after - travel.before + 360) % 360;
    expect(
      clockwiseDelta,
      `${phase}: clockwise angle progresses`,
    ).toBeGreaterThan(1);
    expect(clockwiseDelta, `${phase}: bounded clockwise movement`).toBeLessThan(
      90,
    );
  };
  const hitTest = async (control: import("@playwright/test").Locator) => {
    expect(
      await control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return hit !== null && element.contains(hit);
      }),
    ).toBe(true);
  };
  for (const width of [1360, 390]) {
    await page.emulateMedia({ reducedMotion: "no-preference" });
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
    await expect(input).toBeVisible();
    await input.blur();
    const idle = await decoration();
    expect(idle.animation).toBe("none");
    const homeBounds = await rootMetrics();
    await input.focus();
    await expect.poll(async () => (await decoration()).opacity).toBe(1);
    await page.screenshot({
      path: path.join(screenshots, `motion-${width}-phase-1.png`),
    });
    await observeTravel(`focused-${width}`);
    await page.screenshot({
      path: path.join(screenshots, `motion-${width}-phase-2.png`),
    });
    expect(await rootMetrics()).toEqual(homeBounds);
    await hitTest(input);
    await hitTest(
      page.getByTitle("Choose model for this chat", { exact: true }),
    );
    await input.blur();
    await expect.poll(async () => (await decoration()).animation).toBe("none");
    const idleAngle = (await decoration()).angle;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect((await decoration()).angle).toBe(idleAngle);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await input.focus();
    await expect.poll(async () => (await decoration()).opacity).toBe(0);
    const reduced = await decoration();
    expect(reduced.animation).toBe("none");
    expect(reduced.opacity).toBe(0);
    expect(
      reduced.shadow !== idle.shadow || reduced.border !== idle.border,
    ).toBe(true);
    expect(await rootMetrics()).toEqual(homeBounds);
    await page.screenshot({
      path: path.join(screenshots, `motion-${width}-reduced.png`),
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await input.fill(`Synthetic paused motion check at ${width}px`);
    pauseNextAnswer = true;
    await page.getByRole("button", { name: "Send", exact: true }).click();
    try {
      await expect.poll(() => Boolean(releaseAnswer)).toBe(true);
      const stop = page.getByRole("button", { name: "Stop", exact: true });
      await expect(stop).toBeVisible();
      await input.blur();
      const streamingBounds = await rootMetrics();
      await expect.poll(async () => (await decoration()).opacity).toBe(1);
      await observeTravel(`streaming-unfocused-${width}`);
      await hitTest(input);
      await hitTest(stop);
      expect(await rootMetrics()).toEqual(streamingBounds);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect.poll(async () => (await decoration()).opacity).toBe(0);
      const reducedStreaming = await decoration();
      expect(reducedStreaming.animation).toBe("none");
      expect(reducedStreaming.opacity).toBe(0);
      expect(reducedStreaming.border).not.toBe(idle.border);
      expect(await rootMetrics()).toEqual(streamingBounds);
      await hitTest(stop);
    } finally {
      releaseAnswer?.();
      releaseAnswer = undefined;
      pauseNextAnswer = false;
    }
    await expect(page.locator(".ask-answer-body").last()).toContainText(
      "Promotion strategy",
    );
  }
});

test("adversarial Ask content stays readable without sideways scrolling in any pane", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  await page.goto(`http://127.0.0.1:${port}/app`);
  await page.getByLabel("Username").fill("ask-review");
  await page.getByLabel("Password").fill("synthetic-review-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "New chat", exact: true }).first(),
  ).toBeVisible();
  const audit = async (phase: string) => {
    const result = await page.evaluate(() => {
      const selectors = [
        "html",
        ".ask-conversation",
        ".ask-chat",
        ".ask-thread",
        ".ask-bubble",
        ".ask-answer",
        ".ask-answer-body",
        ".ask-answer-body pre",
        ".ask-answer-body code",
        ".ask-answer-body table",
        ".ask-answer-body th",
        ".ask-answer-body td",
        ".ask-sources",
        ".ask-sources-body",
        ".ask-source",
        ".ask-source-title",
        ".ask-source-link",
        ".ask-source-open",
        ".ask-sources-question",
        ".ask-answer-failed",
        ".ask-composer",
        ".ask-composer textarea",
        ".ask-retry-picker",
        '[role="dialog"][aria-label="Retry this answer with"]',
      ];
      const metrics = selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)).flatMap(
          (element, index) => {
            const rect = element.getBoundingClientRect();
            if (
              !rect.width ||
              !rect.height ||
              getComputedStyle(element).visibility === "hidden"
            )
              return [];
            element.scrollLeft = 10000;
            const rightScroll = element.scrollLeft;
            element.scrollLeft = -10000;
            const leftScroll = element.scrollLeft;
            element.scrollLeft = 0;
            const container =
              element.closest<HTMLElement>(".ask-sources-body") ??
              element.closest<HTMLElement>(".ask-thread");
            const bounds = container?.getBoundingClientRect();
            return [
              {
                selector,
                index,
                width: element.clientWidth,
                scrollWidth: element.scrollWidth,
                rightScroll,
                leftScroll,
                left: rect.left,
                right: rect.right,
                containerLeft: bounds?.left ?? 0,
                containerRight: bounds?.right ?? innerWidth,
              },
            ];
          },
        ),
      );
      const clippedText: string[] = [];
      for (const element of document.querySelectorAll<HTMLElement>(
        ".ask-bubble, .ask-answer-body p, .ask-answer-body pre, .ask-answer-body th, .ask-answer-body td, .ask-source-title, .ask-source-link",
      )) {
        if (getComputedStyle(element).visibility === "hidden") continue;
        const bounds = element.getBoundingClientRect();
        if (!bounds.width || !bounds.height) continue;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (
            !node.textContent?.trim() ||
            node.parentElement?.closest(".sr-only")
          )
            continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          if (
            Array.from(range.getClientRects()).some(
              (rect) =>
                rect.width > 0 &&
                (rect.left < bounds.left - 1 ||
                  rect.right > bounds.right + 1 ||
                  rect.top < bounds.top - 1 ||
                  rect.bottom > bounds.bottom + 1),
            )
          )
            clippedText.push(element.className || element.tagName);
        }
      }
      return { metrics, clippedText };
    });
    await testInfo.attach(phase, {
      body: JSON.stringify(result),
      contentType: "application/json",
    });
    const overflow = result.metrics.filter(
      (metric) =>
        metric.rightScroll !== 0 ||
        metric.leftScroll !== 0 ||
        (metric.width > 0 && metric.scrollWidth > metric.width + 1),
    );
    const escapedBoxes = result.metrics.filter(
      (metric) =>
        metric.left < metric.containerLeft - 1 ||
        metric.right > metric.containerRight + 1,
    );
    expect
      .soft(overflow, `${phase}: panes neither overflow nor move horizontally`)
      .toEqual([]);
    expect
      .soft(
        escapedBoxes,
        `${phase}: content boxes remain inside their pane or viewport`,
      )
      .toEqual([]);
    expect
      .soft(
        result.clippedText,
        `${phase}: full rendered text fits, including wrapped code and cells`,
      )
      .toEqual([]);
  };
  for (const width of [1920, 1360, 1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`http://127.0.0.1:${port}/app`);
    if (width === 390)
      await page
        .getByRole("button", { name: "Open menu", exact: true })
        .click();
    await page
      .getByRole("button", { name: sidewaysChatTitle, exact: true })
      .first()
      .click();
    await expect(page.locator(".ask-bubble").first()).toContainText(
      sidewaysQuestion,
    );
    const answer = page.locator(".ask-answer-body").first();
    await expect(answer.locator("pre")).toContainText(sidewaysToken.repeat(2));
    await expect(answer.locator("table")).toContainText(
      `TableCell${sidewaysToken}`,
    );
    await expect(
      answer.getByRole("link", { name: sidewaysUrl, exact: true }).first(),
    ).toHaveAttribute("href", sidewaysUrl);
    await expect(page.locator(".ask-message.assistant.failed")).toHaveCount(1);
    await expect(page.locator(".ask-message.assistant.cancelled")).toHaveCount(
      1,
    );
    await page
      .getByRole("button", { name: `Source 1: ${sidewaysTitle}`, exact: true })
      .first()
      .click();
    const toggle = page.getByTitle("Show or hide sources (S)", { exact: true });
    if ((await toggle.getAttribute("aria-pressed")) !== "true")
      await toggle.click();
    const sources = page.locator(".ask-sources-body");
    await expect(sources.locator(".ask-source")).toHaveCount(8);
    await expect.poll(() => sources.evaluate((element) => {
      const pane = element.closest(".ask-sources")!;
      pane.getBoundingClientRect();
      return pane.getAnimations().filter((animation) => animation.playState === "running").length;
    })).toBe(0);
    const source = sources.locator(".ask-source").first();
    await expect(source.locator(".ask-source-title")).toContainText(
      sidewaysTitle,
    );
    await expect(source.locator(".ask-source-link")).toContainText(
      sidewaysCreator,
    );
    await expect(source.locator(".ask-source-link")).toHaveAttribute(
      "href",
      sidewaysUrl,
    );
    await expect(source.locator(".ask-source-open")).toHaveAccessibleName(
      new RegExp(`^Open note\\s*:\\s*${sidewaysTitle}$`),
    );
    await page
      .getByRole("textbox", { name: "Ask your archive" })
      .fill(sidewaysQuestion);
    await audit(`${width}-sources-open`);
    await expect
      .poll(() =>
        sources.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      )
      .toBe(true);
    await sources.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(
      await sources.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    await page.getByTitle("Hide sources (S)", { exact: true }).click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".ask-sources")).toBeHidden();
    await audit(`${width}-sources-closed`);
    const cancelled = page.locator(".ask-message.assistant.cancelled");
    const retryTrigger = cancelled.getByTitle("Retry with another model", {
      exact: true,
    });
    await retryTrigger.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await retryTrigger.click();
    const retry = page.getByRole("dialog", { name: "Retry this answer with" });
    await expect(retry).toBeVisible();
    await audit(`${width}-retry-picker`);
    await expect(retry.locator(".ask-opt")).toHaveCount(4);
    await page.keyboard.press("Escape");
    await expect(retry).toHaveCount(0);
  }
});

test("natural conversation stays source-free across follow-ups, reload and retry", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.goto(`http://127.0.0.1:${port}/app`);
  await page.getByLabel("Username").fill("ask-review");
  await page.getByLabel("Password").fill("synthetic-review-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "New chat", exact: true }).first().click();
  const composer = page.getByRole("textbox", { name: "Ask your archive" });
  const send = async (question: string, expected: string) => {
    await composer.fill(question);
    await composer.press("Enter");
    await expect(page.locator(".ask-answer").last()).toContainText(expected);
    await expect(page.locator(".ask-answer").last().getByRole("button", { name: "Retry", exact: true })).toBeEnabled();
  };
  await send("Test natural conversation", "Yep, I’m here.");
  await expect(page.locator(".ask-insufficient")).toHaveCount(0);
  await send("How do I export a chat?", "Export as Markdown");
  await expect(page.locator(".ask-answer").last().getByRole("button", { name: /^Source \d+:/ })).toHaveCount(0);
  await send("Show my leadership saves", "Promotion strategy");
  await expect(page.locator(".ask-answer").last().getByRole("button", { name: /Source 1:/ }).first()).toBeVisible();
  await send("Thanks, that helps", "You’re welcome.");
  const latest = page.locator(".ask-answer").last();
  await expect(latest.locator(".ask-insufficient")).toHaveCount(0);
  const sourceToggle = page.getByRole("button", { name: /^Sources/ }).first();
  if (!(await page.locator(".ask-sources").isVisible())) await sourceToggle.click();
  await expect(page.locator(".ask-sources-empty")).not.toContainText("enough evidence");
  await expect(page.locator(".ask-source-list .ask-source")).toHaveCount(0);
  const persisted = await page.evaluate(async () => {
    const { conversations } = await (await fetch("/api/v1/conversations")).json();
    const chat = conversations.find((item: { title: string }) => item.title === "Test natural conversation");
    const { conversation } = await (await fetch(`/api/v1/conversations/${chat.id}`)).json();
    return { id: chat.id as string, latest: conversation.messages.at(-1) };
  });
  expect(persisted.latest).toMatchObject({ status: "complete", sufficient: null, sources: [] });
  await page.reload();
  await page.getByRole("button", { name: "Test natural conversation", exact: true }).first().click();
  await expect(latest).toContainText("You’re welcome.");
  await latest.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".ask-answer")).toHaveCount(5);
  await expect(latest).toContainText("You’re welcome.");
  await expect(latest.locator(".ask-insufficient")).toHaveCount(0);
  await expect.poll(() => page.evaluate(async (id) => {
    const { conversation } = await (await fetch(`/api/v1/conversations/${id}`)).json();
    return conversation.messages.at(-1).status;
  }, persisted.id)).toBe("complete");
  await page.screenshot({ path: path.join(screenshots, "natural-conversation.png") });
});
