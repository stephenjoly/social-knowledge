import { expect, test } from "@playwright/test";
import { hash } from "@node-rs/argon2";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";

const port = 8799;
const screenshotDir = process.env.E2E_SCREENSHOT_DIR ?? path.join(os.tmpdir(), "ai-settings-frame35");
let root = "";
let store: JobStore;
let app: ReturnType<typeof buildApp>;
let originalFetch: typeof fetch;
let config: ReturnType<typeof testConfig>;
let nextDiagnosticFailure: "quota" | null = null;
let audioOne = "";
let audioTwo = "";

function diagnosticStream() {
  return new Response(
    [
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"diagnostic-ok"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n',
    ].join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}

test.beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-e2e-ai-"));
  await mkdir(path.join(root, "data"));
  await mkdir(screenshotDir, {
    recursive: true,
  });
  audioOne = path.join(root, "short-one.wav");
  audioTwo = path.join(root, "short-two.wav");
  const audio = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.alloc(4),
    Buffer.from("WAVEfmt "),
  ]);
  await Promise.all([writeFile(audioOne, audio), writeFile(audioTwo, audio)]);

  config = testConfig(root);
  config.appUrl = `http://127.0.0.1:${port}`;
  store = new JobStore(config.databasePath);
  store.createUser("qa-user", await hash("a-strong-qa-password"));
  store.createUser("qa-ask-only", await hash("a-strong-qa-password"));
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = input instanceof Request ? input.url : String(input);
    if (
      url === "https://api.cerebras.ai/v1/models" ||
      url === "https://api.openai.com/v1/models"
    )
      return new Response(
        JSON.stringify({
          data: [
            { id: "qwen-3.8-27b" },
            { id: config.analysisModel },
            { id: config.transcriptionModel },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    if (url.endsWith("/audio/transcriptions"))
      return new Response(JSON.stringify({ text: "diagnostic transcript" }), {
        headers: { "content-type": "application/json" },
      });
    if (url.endsWith("/responses")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        stream?: boolean;
      };
      if (nextDiagnosticFailure === "quota") {
        nextDiagnosticFailure = null;
        return new Response(
          JSON.stringify({ error: { code: "insufficient_quota" } }),
          { status: 429, headers: { "content-type": "application/json" } },
        );
      }
      if (body.stream) return diagnosticStream();
      return new Response(JSON.stringify({ output_text: '{"ok":true}' }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/chat/completions"))
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: '{"ok":true}' },
              finish_reason: "stop",
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    if (new URL(url).hostname === "127.0.0.1" || new URL(url).hostname === "localhost")
      return originalFetch(input, init);
    throw new Error("Synthetic provider test blocked unexpected outbound fetch");
  }) as typeof fetch;
  app = buildApp(config, store, new EventHub());
  await app.listen({ host: "127.0.0.1", port });
});

test.afterAll(async () => {
  globalThis.fetch = originalFetch;
  await app.close();
  store.close();
  await rm(root, { recursive: true, force: true });
});

test("tests a saved Ask-only assignment without Analysis", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/app?settings=ai`);
  await page.getByLabel("Username").fill("qa-ask-only");
  await page.getByLabel("Password").fill("a-strong-qa-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Capture a post", exact: true })).toBeVisible();
  await page.goto(`http://127.0.0.1:${port}/app?settings=ai`);
  await expect(page.getByRole("heading", { level: 1, name: "AI & models" })).toBeVisible();
  await page.locator(".st-provider-row").filter({ hasText: "OpenAI" })
    .getByRole("button", { name: "Connect", exact: true }).click();
  const providerDialog = page.getByRole("dialog", { name: "Connect provider" });
  await providerDialog.getByLabel("OpenAI API key").fill("sk-browser-secret-ask-only");
  await providerDialog.getByRole("button", { name: "Connect provider" }).click();
  await expect(page.getByText("OpenAI connected. Assign it to a task below.")).toBeVisible();
  // Ask can be configured and tested before any capture/Analysis assignment.
  await page.getByLabel("Ask AI default provider").selectOption("openai");
  await page.getByLabel("Ask AI default model").selectOption("gpt-6-luna");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("AI settings saved.")).toBeVisible();
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  const askOnlyDialog = page.getByRole("dialog", { name: "Test connection" });
  await expect(askOnlyDialog.getByRole("button", { name: "Test analysis" })).toBeDisabled();
  await expect(askOnlyDialog.getByRole("button", { name: "Test ask" })).toBeEnabled();
  const askOnlyResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/ai-tests/ask") && response.request().method() === "POST",
  );
  await askOnlyDialog.getByRole("button", { name: "Test ask" }).click();
  expect(await (await askOnlyResponse).json()).toMatchObject({
    ok: true,
    selection: { provider: "openai", model: "gpt-6-luna", thinkingLevel: null },
  });
  await expect(askOnlyDialog.locator(".ai-test-row").filter({
    has: page.getByRole("heading", { name: "Ask", exact: true }),
  })).toContainText("Passed in");
  await askOnlyDialog.getByRole("button", { name: "Close connection tests" }).click();
});

test("saves an explicit AI draft and runs diagnostics without archive data", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1020 });
  await page.goto(`http://127.0.0.1:${port}/app`);
  await page.getByLabel("Username").fill("qa-user");
  await page.getByLabel("Password").fill("a-strong-qa-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Capture a post", exact: true }).click();
  await page.getByLabel("Post link").fill("https://www.instagram.com/reel/qa-test/");
  await page.getByRole("button", { name: "Save to archive", exact: true }).click();
  await page.getByRole("dialog", { name: "Link saved — AI setup needed", exact: true }).getByRole("button", { name: "Set up AI", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "AI & models" })).toBeVisible();
  const openAiTopic = async () => {
    await page.goto(`http://127.0.0.1:${port}/app?settings=ai`);
    await expect(page.getByRole("heading", { level: 1, name: "AI & models" })).toBeVisible();
  };
  await openAiTopic();
  await page.setViewportSize({ width: 390, height: 844 });
  const progress = page.locator(".st-progress");
  await expect(progress).toContainText("Connect an AI provider");
  await expect(progress.locator('[aria-current="step"]')).toContainText("Connect a provider");

  const openAiRow = page.locator(".st-provider-row").filter({ hasText: "OpenAI" });
  await openAiRow.getByRole("button", { name: "Connect" }).click();
  const openAiDialog = page.getByRole("dialog", { name: "Connect provider" });
  await openAiDialog.getByLabel("OpenAI API key").fill("sk-browser-secret-1234");
  await page.route(
    "**/api/v1/ai-providers/openai",
    (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_api_key" }),
      }),
    { times: 1 },
  );
  await openAiDialog.getByRole("button", { name: "Connect provider" }).click();
  await expect(openAiDialog.getByRole("alert")).toContainText(
    "The provider rejected that API key",
  );
  await openAiDialog.getByRole("button", { name: "Connect provider" }).click();
  await expect(page.getByText("OpenAI connected. Assign it to a task below.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("sk-browser-secret-1234");

  await expect(progress).toContainText("Choose a Transcription model");
  await progress.getByRole("button", { name: "Choose models", exact: true }).click();
  await expect(page.getByLabel("Transcription provider")).toBeFocused();
  await expect.poll(async () => (await page.getByLabel("Transcription provider").boundingBox())!.y).toBeLessThan(844);

  const savedRequests: unknown[] = [];
  await page.route("**/api/v1/ai-settings", async (route) => {
    if (route.request().method() === "PUT")
      savedRequests.push(route.request().postDataJSON());
    await route.continue();
  });

  await page.getByLabel("Transcription provider").selectOption("openai");
  await expect(page.getByLabel("Transcription model")).toHaveValue(
    config.transcriptionModel,
  );

  await page.getByLabel("Analysis provider").selectOption("openai");
  await page.getByLabel("Analysis model").selectOption("gpt-6.1-sol");
  const thinking = page.getByLabel("Analysis thinking level");
  await thinking.selectOption("high");
  expect(savedRequests).toHaveLength(0);
  await expect(progress).toContainText("Save your task model changes");
  await progress.getByRole("button", { name: "Review changes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeFocused();
  await expect.poll(async () => {
    const box = await page.getByRole("button", { name: "Save changes", exact: true }).boundingBox();
    return box ? box.y >= 0 && box.y + box.height <= 844 : false;
  }).toBe(true);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();

  await page.getByRole("button", { name: "Run test" }).click();
  const dirtyDialog = page.getByRole("dialog", { name: "Test connection" });
  await expect(dirtyDialog).toContainText("Save changes before testing a connection.");
  await expect(dirtyDialog.getByRole("button", { name: "Test analysis" })).toBeDisabled();
  await dirtyDialog.getByRole("button", { name: "Close connection tests" }).click();

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("AI settings saved.")).toBeVisible();
  await expect(progress).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run test", exact: true })).toBeEnabled();
  expect(savedRequests).toEqual([
    {
      ask: null,
      transcription: { provider: "openai", model: config.transcriptionModel },
      analysis: { provider: "openai", model: "gpt-6.1-sol", thinkingLevel: "high" },
    },
  ]);
  await openAiTopic();
  await page.setViewportSize({ width: 1440, height: 1020 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(screenshotDir, "provider-settings-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({
    path: path.join(screenshotDir, "provider-settings-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1020 });

  await expect(page.getByLabel("Analysis model")).toHaveValue("gpt-6.1-sol");
  await expect(thinking).toHaveValue("high");

  await page.getByRole("button", { name: "Run test" }).click();
  const testDialog = page.getByRole("dialog", { name: "Test connection" });
  await expect(testDialog).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(testDialog.getByRole("button", { name: "Test ask" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    testDialog.getByRole("button", { name: "Close connection tests" }),
  ).toBeFocused();

  const transcriptionTest = page
    .locator(".ai-test-row")
    .filter({ has: page.getByRole("heading", { name: "Transcription" }) });
  await transcriptionTest.locator('input[type="file"]').setInputFiles(audioOne);
  await transcriptionTest.getByRole("button", { name: "Test transcription" }).click();
  await expect(transcriptionTest).toContainText("Passed in");

  const analysisTest = page
    .locator(".ai-test-row")
    .filter({ has: page.getByRole("heading", { name: "Analysis" }) });
  await analysisTest.getByRole("button", { name: "Test analysis" }).click();
  await expect(analysisTest).toContainText("Passed in");

  const askTest = page
    .locator(".ai-test-row")
    .filter({ has: page.getByRole("heading", { name: "Ask" }) });
  await expect(askTest.getByRole("button", { name: "Test ask" })).toBeEnabled();
  await askTest.getByRole("button", { name: "Test ask" }).click();
  await expect(askTest).toContainText("Passed in");
  await testDialog.getByRole("button", { name: "Close connection tests" }).click();
  await expect(page.getByRole("button", { name: "Run test" })).toBeFocused();
  await expect(progress).toHaveCount(0);

  // A distinct saved Ask model must pass rather than be discarded as stale.
  await page.getByLabel("Ask AI default provider").selectOption("openai");
  await page.getByLabel("Ask AI default model").selectOption("gpt-6-luna");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("AI settings saved.")).toBeVisible();
  await page.getByRole("button", { name: "Run test", exact: true }).click();
  await askTest.getByRole("button", { name: "Test ask" }).click();
  await expect(askTest).toContainText("Passed in");
  await expect(askTest).toContainText("openai · gpt-6-luna");
  await expect(askTest).not.toContainText("discarded");
  await testDialog.getByRole("button", { name: "Close connection tests" }).click();

  await thinking.selectOption("low");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();

  await openAiRow.getByRole("button", { name: "Change key" }).click();
  const manageDialog = page.getByRole("dialog", { name: "Manage provider" });
  await manageDialog.getByRole("button", { name: "Replace API key" }).click();
  await manageDialog.getByLabel("OpenAI API key").fill("sk-browser-secret-5678");
  await manageDialog.getByRole("button", { name: "Connect provider" }).click();
  await expect(thinking).toHaveValue("low");
  expect(store.aiTaskSelections(store.getUserByUsername("qa-user")!.id)).toMatchObject({
    analysisThinkingLevel: "high",
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("AI settings saved.")).toBeVisible();

  nextDiagnosticFailure = "quota";
  await page.getByRole("button", { name: "Run test" }).click();
  await expect(testDialog.getByRole("button", { name: "Test analysis" })).toBeEnabled();
  await testDialog.getByRole("button", { name: "Test analysis" }).click();
  await expect(testDialog).toContainText("Failed in");
  await expect(testDialog).toContainText("Add provider credits or increase its quota");
  await testDialog.getByRole("button", { name: "Close connection tests" }).click();

  await thinking.selectOption("high");
  await page.route(
    "**/api/v1/ai-settings",
    (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_thinking_level" }),
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
  await expect(thinking).toHaveValue("high");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(screenshotDir, "provider-settings-mobile-draft-error.png"),
    fullPage: true,
  });
});
