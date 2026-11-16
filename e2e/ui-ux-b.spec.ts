import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import type { AskService, AskSource } from "../src/ask.js";
import { testConfig } from "../test/helpers.js";
import { fixtureAccount, seedUiFixture } from "../scripts/ui-fixture.js";

// Own disposable server/SQLite/seed; no real providers or preview mutations.
let root = "";
let baseUrl = "";
let store: JobStore;
let app: ReturnType<typeof buildApp>;
let ownerId = "";
let sources: AskSource[];
let originalFetch: typeof fetch;
let streamChunks = 0;

test.beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-ux-b-"));
  await mkdir(path.join(root, "data"));
  const config = testConfig(root);
  store = new JobStore(config.databasePath);
  ownerId = (await seedUiFixture(store, config)).id;
  const captures = store.listCaptures({ userId: ownerId, limit: 50 }).captures;
  sources = ["lisbonfoodie", "coachmarta"].map((creator) => {
    const capture = captures.find((item) => item.creator === creator)!;
    return {
      id: capture.id,
      citation: 1,
      title: capture.title,
      creator,
      platform: capture.platform,
      synopsis: capture.synopsis ?? "",
      sourceUrl: capture.sourceUrl,
      breadcrumb: [],
    };
  });
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("QA B forbids outbound provider calls");
  }) as typeof fetch;
  const syntheticAsk: Pick<AskService, "answer"> = {
    answer: async (input) => {
      let answer = "";
      streamChunks = 0;
      for (let index = 0; index < 50 && !input.signal?.aborted; index++) {
        const delta = `Streaming synthetic paragraph ${index + 1}: archive evidence remains private.\n\n`;
        answer += delta;
        input.onDelta(delta);
        streamChunks++;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      store.completeConversationAttempt(
        input.userId,
        input.conversationId,
        input.assistantId,
        answer,
        [],
        false,
      );
      return {
        answer,
        sources: [],
        sufficient: false,
        diagnostics: {
          action: "search_archive",
          standaloneQuestion: input.question,
          terms: [],
          selected: [],
          reusedCaptureIds: [],
          compacted: false,
          compactionFallback: false,
          estimatedContextTokens: 0,
        },
      };
    },
  };
  app = buildApp(
    config,
    store,
    new EventHub(),
    undefined,
    undefined,
    syntheticAsk,
  );
  baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
  config.appUrl = baseUrl;
});

test.afterAll(async () => {
  globalThis.fetch = originalFetch;
  if (app) await app.close();
  if (store) store.close();
  await rm(root, { recursive: true, force: true });
});

async function login(
  page: Page,
  username = fixtureAccount.username,
  password = fixtureAccount.password,
  tab = "ask",
) {
  await page.goto(`${baseUrl}/?tab=${tab}`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".app-frame")).toBeVisible();
}

function seedConversation(title: string, long = false) {
  const conversation = store.createConversation(ownerId, title)!;
  const ids: string[] = [];
  for (const [index, question] of [
    "Where is the Lisbon bakery?",
    "How do I improve deadlift setup?",
    "What about an absent topic?",
  ].entries()) {
    store.addConversationMessage(ownerId, conversation.id, "user", question);
    ids.push(
      store.addConversationMessage(
        ownerId,
        conversation.id,
        "assistant",
        `${long ? "Earlier reading position.\n\n".repeat(60) : ""}Synthetic answer ${index + 1}${index < 2 ? " [1]" : " without evidence."}`,
        index < 2 ? [sources[index]!] : [],
        index < 2,
      ),
    );
  }
  return { conversation, ids };
}

async function openConversation(page: Page, title: string) {
  if (await page.getByRole("button", { name: "Open menu", exact: true }).isVisible()) await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.locator(".app-chat-open").filter({ hasText: title }).click();
  await expect(page.locator(".ask-title")).toContainText(title);
}

test("12–13 evidence labels track selected answers and never support an uncited follow-up", async ({
  page,
}) => {
  const title = "QA B three different answers";
  const { ids } = seedConversation(title);
  await login(page);
  await openConversation(page, title);
  const panel = page.locator("#ask-sources");
  await expect(panel).toContainText("Cited in latest answer");
  await expect(page.locator(`#ask-answer-${ids[2]}`)).toContainText("without evidence");
  await expect(panel.locator(".ask-source")).toHaveCount(0);
  await expect(panel).toContainText("didn’t have enough evidence");
  await panel
    .getByRole("button", { name: /Show sources for the earlier answer/ })
    .click();
  await expect(panel).toContainText("Cited in an earlier answer");
  await expect(panel).toContainText("deadlift setup");
  await expect(panel.locator(".ask-source-open")).toContainText(
    sources[1]!.title,
  );
  await page.locator(`#ask-answer-${ids[0]} .ask-sources-toggle`).click();
  await expect(panel).toContainText("Lisbon bakery");
  await expect(panel.locator(".ask-source-open")).toContainText(
    sources[0]!.title,
  );
  await expect(panel).not.toContainText(sources[1]!.title);
  await panel
    .getByRole("button", { name: "Show sources for the latest answer" })
    .click();
  await expect(panel.locator(".ask-source")).toHaveCount(0);
  await expect(panel).toContainText("Cited in latest answer");
});

test("15 reopening persisted failures preserves known recovery and safely handles prototype names", async ({
  page,
}) => {
  const title = "QA B persisted failures";
  const conversation = store.createConversation(ownerId, title)!;
  const cases = [
    { code: "timeout", text: "took too long", action: "Edit question" },
    {
      code: "invalid_citation",
      text: "citations couldn’t be verified",
      action: "Retry",
    },
    { code: "planner_error", text: "Try rephrasing", action: "Edit question" },
    { code: "context_limit", text: "too long to continue", action: "New chat" },
    {
      code: "provider_error",
      text: "provider didn’t finish",
      action: "Check AI setup",
    },
    {
      code: "analysis_provider_required",
      text: "connected analysis model",
      action: "Set up AI",
    },
    ...[
      "constructor",
      "__proto__",
      "toString",
      "provider-secret-internal-path",
    ].map((code) => ({
      code,
      text: "Ask AI couldn’t finish this answer.",
      action: "Retry",
    })),
  ];
  for (const { code } of cases) {
    const { assistantId } = store.beginConversationTurn(
      ownerId,
      conversation.id,
      `Question for ${code}`,
      crypto.randomUUID(),
    );
    store.failConversationAttempt(
      ownerId,
      conversation.id,
      assistantId,
      "failed",
      code,
    );
  }
  await login(page);
  await openConversation(page, title);
  for (let reopen = 0; reopen < 2; reopen++) {
    for (const { code, text, action } of cases) {
      const failed = page.locator(".ask-message.assistant").filter({
        has: page.locator(`.ask-answer-failed[data-error-code="${code}"]`),
      });
      await expect(failed).toContainText(text);
      await expect(
        failed.getByRole("button", { name: action, exact: true }),
      ).toBeVisible();
    }
    expect(
      (await page.locator(".ask-answer-failed").allTextContents()).join(" "),
    ).not.toContain("provider-secret-internal-path");
    if (!reopen) {
      await page.reload();
      await openConversation(page, title);
    }
  }
});

test("14 streaming respects earlier reading and offers an explicit follow action", async ({
  page,
}) => {
  const title = "QA B streaming position";
  seedConversation(title, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await openConversation(page, title);
  await page
    .getByRole("textbox", { name: "Ask your archive" })
    .fill("Stream a synthetic answer");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => streamChunks).toBeGreaterThan(3);
  await page.locator(".ask-thread").evaluate((element) => {
    element.scrollTop -= 350;
    element.dispatchEvent(new Event("scroll"));
  });
  const top = await page
    .locator(".ask-thread")
    .evaluate((element) => element.scrollTop);
  const count = streamChunks;
  await expect.poll(() => streamChunks).toBeGreaterThan(count + 3);
  expect(
    await page.locator(".ask-thread").evaluate((element) => element.scrollTop),
  ).toBeCloseTo(top, 0);
  await page
    .getByRole("button", { name: "Follow the answer", exact: true })
    .click();
  await expect(page.locator(".ask-jump")).toHaveCount(0);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
});

test("16,28 mobile citation opens its own note and returns to the same answer position", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    const title = "QA B mobile citations";
    const { ids } = seedConversation(title, true);
    await login(page);
    await openConversation(page, title);
    const citation = page.locator(`#ask-answer-${ids[0]} .ask-cite`).first();
    await citation.scrollIntoViewIfNeeded();
    const before = await citation.boundingBox();
    expect(before).not.toBeNull();
    const originalY = await page.locator(".ask-thread").evaluate((element) => element.scrollTop);
    await citation.tap();
    const sourceCard = page.locator(`.ask-source[data-source-id="${sources[0]!.id}"]`);
    await expect(sourceCard).toHaveClass(/hl/);
    await sourceCard.getByRole("button", { name: /Open note/ }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: sources[0]!.title }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close note", exact: true })
      .click();
    await expect(sourceCard.getByRole("button", { name: /Open note/ })).toBeFocused();
    await expect
      .poll(async () =>
        Math.abs((await page.locator(".ask-thread").evaluate((element) => element.scrollTop)) - originalY),
      )
      .toBeLessThan(8);
    await expect(citation).toHaveClass(/hl/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    // Keyboard emulation: reduced viewport + focused composer, not physical phone proof.
    await page.setViewportSize({ width: 390, height: 500 });
    await page
      .getByRole("textbox", { name: "Ask your archive" })
      .fill("Mobile draft");
    await page.getByRole("textbox", { name: "Ask your archive" }).focus();
    await page
      .getByRole("button", { name: "Send", exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      (await page
        .getByRole("button", { name: "Send", exact: true })
        .boundingBox())!.y,
    ).toBeLessThan(500);
  } finally {
    await context.close();
  }
});

test("19 empty archive offers capture and blocked AI offers setup", async ({
  page,
}) => {
  await login(page, "maya", "fixture-maya-password");
  await expect(
    page.getByRole("note").filter({ hasText: "Nothing saved yet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Suggested questions" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Capture your first post" }).click();
  await expect(
    page.getByRole("dialog", { name: "Capture a post", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close capture" }).click();
  await page.getByRole("button", { name: "Set up AI", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "AI & models", exact: true }),
  ).toBeVisible();
});

async function dismissGuard(page: Page, action: () => Promise<unknown>) {
  const dialog = page.waitForEvent("dialog");
  const acted = action();
  const confirmation = await dialog;
  expect(confirmation.type()).toBe("confirm");
  expect(confirmation.message()).toMatch(
    /unsaved|aren’t saved|not saved|without saving/i,
  );
  await confirmation.dismiss();
  await acted;
  await expect(page.getByLabel("Display name")).toHaveValue(
    "Unsaved QA B draft",
  );
}

test("21 avatar saves immediately while profile draft survives all navigation guards", async ({
  page,
}) => {
  await login(page, fixtureAccount.username, fixtureAccount.password, "inbox");
  await page
    .getByRole("button", { name: "Open Settings", exact: true })
    .click();
  await page.getByLabel("Display name").fill("Unsaved QA B draft");
  await page.getByRole("button", { name: "Blue avatar colour" }).click();
  await expect(
    page.getByRole("button", { name: "Blue avatar colour" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Display name")).toHaveValue(
    "Unsaved QA B draft",
  );
  expect(store.getUserByUsername(fixtureAccount.username)!.displayName).toBe(
    fixtureAccount.displayName,
  );
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeVisible();
  await dismissGuard(page, () =>
    page
      .locator(".sm-dialog")
      .getByRole("button", { name: "Close Settings", exact: true })
      .click(),
  );
  await dismissGuard(page, () =>
    page
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Data & export", exact: true })
      .click(),
  );
  await dismissGuard(page, () =>
    page.getByRole("button", { name: "Change language", exact: true }).click(),
  );
  await page.keyboard.press("Control+k");
  await dismissGuard(page, () =>
    page.getByRole("option", { name: /Inbox/ }).click(),
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("heading", { level: 1, name: "My account", exact: true })
    .click();
  await dismissGuard(page, () => page.keyboard.press("Escape"));
  await dismissGuard(page, () => page.goBack());
  await expect(page).toHaveURL(/settings=/);
  await dismissGuard(page, () =>
    page
      .locator(".st-column")
      .getByRole("button", { name: "Sign out", exact: true })
      .click(),
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "My account", exact: true }),
  ).toBeVisible();
});

test("24–25 phone cookie help and language discovery explain manual setup and new captures", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(
    page,
    fixtureAccount.username,
    fixtureAccount.password,
    "settings&topic=connections",
  );
  await page
    .getByRole("button", { name: /How to export browser cookies/ })
    .click();
  const manualSteps = page.locator(".st-steps");
  await expect(manualSteps).toContainText(/computer/i);
  await expect(manualSteps).toContainText(/Chrome.*Firefox/i);
  await expect(manualSteps).toContainText(/Netscape/i);
  await expect(manualSteps).toContainText(/upload/i);
  const phoneHelp = page.locator(".st-help-note");
  await expect(phoneHelp).toContainText(/phone|iPhone/i);
  await expect(phoneHelp).toContainText(/saved.*session/i);
  await expect(phoneHelp).toContainText(/file.*phone.*upload/is);
  await page.goto(`${baseUrl}/app?settings=account`);
  await page
    .getByRole("button", { name: "Change language", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Data & export", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".st-column")).toContainText(
    "Changes save immediately and apply to captures saved from now on. Existing notes keep their language.",
  );
  const language = page.getByLabel("Note language", { exact: true });
  await language.selectOption("French");
  await expect(
    page.getByRole("status").filter({ hasText: "Language preferences saved." }),
  ).toBeVisible();
  await page.route(
    "**/api/v1/preferences",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "synthetic_failure" }),
      }),
    { times: 1 },
  );
  await language.selectOption("English");
  await expect(page.getByRole("alert")).toContainText(
    "Language preferences could not be saved",
  );
  await expect(language).toHaveValue("French");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("21 modal Back/Forward protects drafts and returns to the preserved page", async ({ page }) => {
  await login(page, fixtureAccount.username, fixtureAccount.password, "inbox");
  await page.getByRole("button", { name: "Open Settings", exact: true }).click();
  const sections = page.getByRole("navigation", { name: "Settings sections" });
  await sections.getByRole("button", { name: "Data & export", exact: true }).click();
  await expect(page).toHaveURL(/settings=data/);
  await sections.getByRole("button", { name: "My account", exact: true }).click();
  await page.getByLabel("Display name").fill("Unsaved QA B draft");
  await dismissGuard(page, () => page.goBack());
  await expect(page).toHaveURL(/settings=account/);
  const confirmation = page.waitForEvent("dialog");
  const back = page.goBack();
  await (await confirmation).accept();
  await back;
  await expect(page.getByRole("button", { name: "Close Settings" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1, name: "My account", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/settings=account/);
  await expect(page.getByLabel("Display name")).toHaveValue(fixtureAccount.displayName);
});
