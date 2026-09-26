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
    return originalFetch(input, init);
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

test("saves an explicit AI draft and runs diagnostics without archive data", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1020 });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByLabel("Username").fill("qa-user");
  await page.getByLabel("Password").fill("a-strong-qa-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Capture a post", exact: true }).click();
  await page.getByLabel("Post URL").fill("https://www.instagram.com/reel/qa-test/");
  await page.getByRole("button", { name: "Capture post", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Settings topics" })
    .getByRole("button", { name: "AI" })
    .click();

  const openAiRow = page.locator(".ai-provider").filter({ hasText: "OpenAI" });
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

  const savedRequests: unknown[] = [];
  await page.route("**/api/v1/ai-settings", async (route) => {
    if (route.request().method() === "PUT")
      savedRequests.push(route.request().postDataJSON());
    await route.continue();
  });

  const transcriptionTask = page
    .locator(".ai-task")
    .filter({ has: page.getByRole("heading", { name: "Transcription" }) });
  await transcriptionTask.getByLabel("Provider").selectOption("openai");
  await expect(transcriptionTask.getByLabel("Model")).toHaveValue(
    config.transcriptionModel,
  );

  const analysisTask = page
    .locator(".ai-task")
    .filter({ has: page.getByRole("heading", { name: "Analysis" }) });
  await analysisTask.getByLabel("Provider").selectOption("openai");
  await analysisTask.getByLabel("Model").selectOption("gpt-5");
  const thinking = analysisTask.getByRole("group", { name: "Thinking level" });
  await thinking.getByRole("button", { name: "high" }).click();
  expect(savedRequests).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();

  await page.getByRole("button", { name: "Test connection" }).click();
  const dirtyDialog = page.getByRole("dialog", { name: "Test connection" });
  await expect(dirtyDialog).toContainText("Save changes before testing a connection.");
  await expect(dirtyDialog.getByRole("button", { name: "Test analysis" })).toBeDisabled();
  await dirtyDialog.getByRole("button", { name: "Close connection tests" }).click();

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("AI settings saved.")).toBeVisible();
  expect(savedRequests).toEqual([
    {
      transcription: { provider: "openai", model: config.transcriptionModel },
      analysis: { provider: "openai", model: "gpt-5", thinkingLevel: "high" },
    },
  ]);
  await page.reload();
  await page
    .getByRole("navigation", { name: "Settings topics" })
    .getByRole("button", { name: "AI" })
    .click();
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

  const persistedAnalysis = page
    .locator(".ai-task")
    .filter({ has: page.getByRole("heading", { name: "Analysis" }) });
  await expect(persistedAnalysis.getByLabel("Model")).toHaveValue("gpt-5");
  await expect(
    persistedAnalysis
      .getByRole("group", { name: "Thinking level" })
      .getByRole("button", { name: "high" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Test connection" }).click();
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
  await expect(page.getByRole("button", { name: "Test connection" })).toBeFocused();

  await persistedAnalysis
    .getByRole("group", { name: "Thinking level" })
    .getByRole("button", { name: "low" })
    .click();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();

  await openAiRow.getByRole("button", { name: "Change key" }).click();
  const manageDialog = page.getByRole("dialog", { name: "Manage provider" });
  await manageDialog.getByRole("button", { name: "Replace API key" }).click();
  await manageDialog.getByLabel("OpenAI API key").fill("sk-browser-secret-5678");
  await manageDialog.getByRole("button", { name: "Connect provider" }).click();
  await expect(
    persistedAnalysis
      .getByRole("group", { name: "Thinking level" })
      .getByRole("button", { name: "low" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(store.aiTaskSelections(store.getUserByUsername("qa-user")!.id)).toMatchObject({
    analysisThinkingLevel: "high",
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("AI settings saved.")).toBeVisible();

  nextDiagnosticFailure = "quota";
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(testDialog.getByRole("button", { name: "Test analysis" })).toBeEnabled();
  await testDialog.getByRole("button", { name: "Test analysis" }).click();
  await expect(testDialog).toContainText("Failed in");
  await expect(testDialog).toContainText("Add provider credits or increase its quota");
  await testDialog.getByRole("button", { name: "Close connection tests" }).click();

  await persistedAnalysis
    .getByRole("group", { name: "Thinking level" })
    .getByRole("button", { name: "high" })
    .click();
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
  await expect(
    persistedAnalysis
      .getByRole("group", { name: "Thinking level" })
      .getByRole("button", { name: "high" }),
  ).toHaveAttribute("aria-pressed", "true");

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
