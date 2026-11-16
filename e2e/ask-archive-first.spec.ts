import { expect, test } from "@playwright/test";
import { hash } from "@node-rs/argon2";
import type OpenAI from "openai";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AskService } from "../src/ask.js";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";

const port = 8814;
const question = "what perfumes are blind buy safe";
let root: string;
let store: JobStore;
let app: ReturnType<typeof buildApp>;
let ownerId: string;
let followUpChat: string;
let searches: string[];

test.beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "ask-archive-first-"));
  const config = testConfig(root);
  config.appUrl = `http://127.0.0.1:${port}`;
  await mkdir(config.dataDir, { recursive: true });
  store = new JobStore(config.databasePath);
  const user = store.createUser(
    "archive-first",
    await hash("synthetic-archive-password"),
  );
  ownerId = user.id;
  const { job } = store.createOrGet({
    ownerUserId: user.id,
    sourceUrl: "https://www.instagram.com/reel/synthetic-perfume/",
    normalizedUrl: "https://www.instagram.com/reel/synthetic-perfume/",
    sourceHash: "synthetic-perfume",
  });
  const capture = store.createCapture({
    job,
    sourceType: "video",
    sourceId: "synthetic-perfume",
    platform: "instagram",
    title: "Blind buy safe perfumes",
    creator: "Synthetic perfume reviewer",
    creatorUrl: null,
    description: "Sample A perfume recommendation",
    transcript:
      "The creator recommends Sample A as a blind buy safe perfume, but recommends sampling first.",
    sourceLanguage: "en",
    translatedTranscript: null,
    translationLanguage: null,
    comments: [],
    analysis: {
      title: "Blind buy safe perfumes",
      synopsis: "Sample A perfume recommendation",
      whyUseful: "Synthetic reference",
      takeaways: ["Try Sample A; preferences vary."],
      topics: ["perfumes"],
      entities: [],
      recommendations: [],
      claimsNeedingVerification: [],
      evidence: [],
      classification: {
        primaryDomain: "Learning",
        country: null,
        city: null,
        subcategory: "Reference",
        secondaryTopics: ["perfumes"],
        confidence: 1,
      },
    },
    publishedAt: null,
    durationSeconds: 30,
    notePath: "Synthetic/perfumes.md",
    assets: [],
  })!;
  store.complete(job.id, capture.notePath);
  store.saveAiProviderConnection(
    user.id,
    "openai",
    "synthetic-no-credential",
    "Simulated",
  );
  store.saveAiTaskSelections(user.id, {
    transcriptionProvider: "openai",
    transcriptionModel: "gpt-4o-mini-transcribe",
    analysisProvider: "openai",
    analysisModel: "gpt-6-luna",
    analysisThinkingLevel: "medium",
    askProvider: "openai",
    askModel: "gpt-6-luna",
    askThinkingLevel: "medium",
  });
  const oldChat = store.createConversation(
    user.id,
    "Earlier perfume question",
  )!;
  followUpChat = oldChat.id;
  store.addConversationMessage(user.id, oldChat.id, "user", question);
  store.addConversationMessage(
    user.id,
    oldChat.id,
    "assistant",
    "I can search your saved perfumes—want me to search?",
    [],
    null,
  );
  searches = [];
  const search = store.searchKnowledge.bind(store);
  store.searchKnowledge = (...args) => {
    searches.push(args[1]);
    return search(...args);
  };
  // Real AskService, retrieval, persistence and SSE. Only provider responses are
  // deterministic: this verifies orchestration, not a live model's intent quality.
  const client = {
    responses: {
      create: async (request: {
        stream?: boolean;
        input?: unknown;
        text?: { format?: { schema?: { required?: string[] } } };
      }) => {
        if (!request.stream) {
          expect(request.text?.format?.schema?.required).toContain(
            "retrievalBypassReason",
          );
          return {
            output_text: JSON.stringify({
              action: "clarify",
              standaloneQuestion: question,
              responseInstructions: "Ask permission to search",
              referencedCaptureIds: [],
              retrievalBypassReason: null,
            }),
          };
        }
        expect(JSON.stringify(request.input)).toContain(capture.id);
        const payload = JSON.stringify({
          answer:
            "Your saved reviewer recommends **Sample A**, while suggesting you sample first [1].",
          citedCaptureIds: [capture.id],
          sufficient: true,
        });
        return (async function* () {
          yield { type: "response.output_text.delta", delta: payload };
        })();
      },
    },
  } as unknown as OpenAI;
  app = buildApp(
    config,
    store,
    new EventHub(),
    undefined,
    undefined,
    new AskService(client, config, store),
  );
  await app.listen({ host: "127.0.0.1", port });
});

test.afterAll(async () => {
  await app?.close();
  store?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

for (const width of [1360, 390]) {
  test(`implicit perfume request answers immediately at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`http://127.0.0.1:${port}/app?tab=ask`);
    await page.getByLabel("Username", { exact: true }).fill("archive-first");
    await page
      .getByLabel("Password", { exact: true })
      .fill("synthetic-archive-password");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Ask your archive", exact: true }),
    ).toBeVisible();
    const before = searches.length;
    const previousIds = new Set(
      store.listConversations(ownerId).map((row) => row.id),
    );
    await page
      .getByRole("textbox", { name: "Ask your archive", exact: true })
      .fill(question);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const answer = page.locator(".ask-answer").last();
    await expect(answer).toContainText("Sample A");
    await expect(answer).toContainText("1 source");
    await expect(answer).not.toContainText("want me to search");
    expect(searches.slice(before)).toContain(question);
    const chat = store
      .listConversations(ownerId)
      .find(
        (row) =>
          !previousIds.has(row.id) &&
          store
            .getConversation(ownerId, row.id)
            ?.messages.some((message) => message.content.includes("Sample A")),
      );
    expect(chat).toBeDefined();
    const saved = store.getConversation(ownerId, chat!.id)!.messages.at(-1)!;
    expect(saved).toMatchObject({ status: "complete", sufficient: true });
    expect(saved.sources).toHaveLength(1);
    if (width === 1360) {
      await page
        .getByRole("button", { name: "Earlier perfume question", exact: true })
        .first()
        .click();
      const beforeFollowUp = searches.length;
      await page
        .getByRole("textbox", { name: "Ask your archive", exact: true })
        .fill("yes of course");
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.locator(".ask-answer").last()).toContainText(
        "Sample A",
      );
      expect(searches.slice(beforeFollowUp)).toContain(question);
      await expect
        .poll(
          () =>
            store.getConversation(ownerId, followUpChat)?.messages.at(-1)
              ?.status,
        )
        .toBe("complete");
      expect(
        store.getConversation(ownerId, followUpChat)?.messages.at(-1)?.sources,
      ).toHaveLength(1);
    }
  });
}
