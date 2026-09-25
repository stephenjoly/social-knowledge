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

test.beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-e2e-ai-"));
  await mkdir(path.join(root, "data"));
  const config = testConfig(root);
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

test("configures transcription and analysis independently and disconnects safely", async ({
  page,
}) => {
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
  await page.getByRole("button", { name: "Save post", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.getByRole("button", { name: "Connect OpenAI" }).click();
  await page.getByLabel("OpenAI API key").fill("sk-browser-secret-1234");
  await page.getByRole("button", { name: "Verify and use" }).click();
  await expect(
    page.getByText("OpenAI connected. Review the task selections above."),
  ).toBeVisible();
  await expect(page.getByText("Capture ready")).toBeVisible();
  await expect(page.getByText("Ask is ready.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    "sk-browser-secret-1234",
  );

  await page.getByRole("button", { name: "Connect Cerebras" }).click();
  await page.getByLabel("Cerebras API key").fill("csk-browser-secret-1234");
  await page.getByRole("button", { name: "Verify and use" }).click();
  await expect(
    page.getByText("Cerebras connected. Review the task selections above."),
  ).toBeVisible();
  await page
    .locator(".ai-task")
    .filter({ has: page.getByRole("heading", { name: "Analysis & Ask" }) })
    .getByLabel("Provider")
    .selectOption("cerebras");
  await expect(page.getByText("Analysis selection updated.")).toBeVisible();
  await expect(page.getByText(/Cerebras · qwen-3.8-27b/)).toBeVisible();

  await page.getByRole("button", { name: "Disconnect OpenAI" }).click();
  await expect(
    page.getByText(
      "OpenAI disconnected. Any task that used it now needs a provider.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Capture needs transcription and analysis"),
  ).toBeVisible();
  await expect(page.getByText("Ask is ready.")).toBeVisible();
});
