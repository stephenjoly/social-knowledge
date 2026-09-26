import { expect, test } from "@playwright/test";
import { hash } from "@node-rs/argon2";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";

const port = 8799;
let root = "";
let store: JobStore;
let app: ReturnType<typeof buildApp>;
let originalFetch: typeof fetch;
let config: ReturnType<typeof testConfig>;

test.beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-e2e-ai-"));
  await mkdir(path.join(root, "data"));
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
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
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

test("configures providers before assigning tasks and disconnects safely", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByLabel("Username").fill("qa-user");
  await page.getByLabel("Password").fill("a-strong-qa-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByRole("button", { name: "Capture a post", exact: true })
    .click();
  await page
    .getByLabel("Post URL")
    .fill("https://www.instagram.com/reel/qa-test/");
  await page.getByRole("button", { name: "Capture post", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Settings topics" })
    .getByRole("button", { name: "AI" })
    .click();

  await expect(page.getByText("No providers connected")).toBeVisible();
  await page.getByRole("button", { name: "Add provider" }).click();
  const openAiDialog = page.getByRole("dialog", { name: "Add provider" });
  await openAiDialog
    .getByLabel("OpenAI API key")
    .fill("sk-browser-secret-1234");
  await openAiDialog.getByLabel("Audio model").selectOption(config.transcriptionModel);
  await openAiDialog
    .getByLabel("Analysis model")
    .selectOption(config.analysisModel);
  await openAiDialog.getByLabel("Thinking level").selectOption("high");
  await page.route("**/api/v1/ai-providers/openai", route => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_api_key" }) }), { times: 1 });
  await openAiDialog
    .getByRole("button", { name: "Connect and save" })
    .click();
  await expect(openAiDialog.getByRole("alert")).toContainText("The provider rejected that API key");
  await page.screenshot({ path: "test-results/provider-dialog-desktop.png" });
  await openAiDialog.getByRole("button", { name: "Connect and save" }).click();
  await expect(
    page.getByText("OpenAI preferences saved. Assign it to a task below when ready."),
  ).toBeVisible();
  await expect(page.getByText("Capture needs setup")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    "sk-browser-secret-1234",
  );

  const transcriptionTask = page
    .locator(".ai-task")
    .filter({ has: page.getByRole("heading", { name: "Transcription" }) });
  await transcriptionTask.getByLabel("Provider").selectOption("openai");
  await expect(transcriptionTask).toContainText(config.transcriptionModel);
  await expect(transcriptionTask.locator("select")).toHaveCount(1);

  const openAiRow = page.locator(".ai-provider").filter({ hasText: "OpenAI" });
  await openAiRow.getByRole("button", { name: "Edit settings" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit provider" });
  await expect(editDialog.getByLabel("Thinking level")).toHaveValue("high");
  await editDialog.getByLabel("Audio model").selectOption("gpt-4o-transcribe");
  await editDialog.getByLabel("Analysis model").selectOption("gpt-5");
  await editDialog.getByLabel("Thinking level").selectOption("low");
  await editDialog.getByRole("button", { name: "Save provider settings" }).click();
  await expect(transcriptionTask).toContainText("gpt-4o-transcribe");
  await page.reload();
  await page.getByRole("navigation", { name: "Settings topics" }).getByRole("button", { name: "AI", exact: true }).click();
  await expect(openAiRow).toContainText("gpt-5 · low");
  await page.setViewportSize({ width: 390, height: 844 });
  await openAiRow.getByRole("button", { name: "Edit settings" }).click();
  await expect(editDialog.getByLabel("Thinking level")).toHaveValue("low");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/provider-dialog-mobile.png" });
  await editDialog.getByRole("button", { name: "Cancel" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole("button", { name: "Add provider" }).click();
  const cerebrasDialog = page.getByRole("dialog", { name: "Add provider" });
  await cerebrasDialog
    .getByRole("combobox", { name: "Provider", exact: true })
    .selectOption("cerebras");
  await cerebrasDialog
    .getByLabel("Cerebras API key")
    .fill("csk-browser-secret-1234");
  await cerebrasDialog
    .getByLabel("Analysis model")
    .selectOption("qwen-3.8-27b");
  await cerebrasDialog
    .getByRole("button", { name: "Connect and save" })
    .click();
  await expect(
    page.getByText("Cerebras preferences saved. Assign it to a task below when ready."),
  ).toBeVisible();
  const analysisTask = page
    .locator(".ai-task")
    .filter({ has: page.getByRole("heading", { name: "Analysis & Ask" }) })
  await analysisTask.getByLabel("Provider").selectOption("cerebras");
  await expect(analysisTask).toContainText("Cerebras · qwen-3.8-27b");
  await expect(page.getByText("Capture ready")).toBeVisible();
  await expect(page.getByText("Ask ready")).toBeVisible();
  await page.screenshot({ path: "test-results/provider-settings-desktop.png" });

  await page
    .locator(".ai-provider")
    .filter({ hasText: "OpenAI" })
    .getByRole("button", { name: "Disconnect" })
    .click();
  await expect(
    page.getByText(
      "OpenAI disconnected. Its assignments now need a provider.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Capture needs setup")).toBeVisible();
  await expect(page.getByText("Ask ready")).toBeVisible();
});
