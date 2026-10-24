import { expect, test, type Locator, type Page } from "@playwright/test";
import { hash } from "@node-rs/argon2";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import type { CaptureRecord } from "../src/types.js";
import { testConfig } from "../test/helpers.js";

// Self-contained synthetic owner and real HTTP/media routes. No provider calls,
// existing archive, committed media, or shared QA server are involved.
const port = 8812;
const origin = `http://127.0.0.1:${port}`;
const run = promisify(execFile);
const longToken = "SyntheticUnbrokenEvidence".repeat(35);
let root: string;
let store: JobStore;
let app: ReturnType<typeof buildApp>;
let userId: string;
let chatId: string;
let captures: CaptureRecord[];
let foreignCapture: CaptureRecord;
let releaseStream: (() => void) | undefined;
const title = "Modal acceptance conversation";

test.beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "note-modal-acceptance-"));
  const config = testConfig(root);
  config.appUrl = origin;
  await mkdir(config.dataDir, { recursive: true });
  const media = new Map<string, string>();
  for (const [name, size] of [
    ["portrait", "180x320"],
    ["landscape", "320x180"],
  ]) {
    const filename = path.join(root, `${name}.mp4`);
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=size=${size}:rate=12`,
      "-t",
      "8",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-y",
      filename,
    ]);
    media.set(name!, filename);
  }
  const photo = path.join(root, "photo.svg");
  await writeFile(
    photo,
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect width="240" height="320" fill="#376b69"/><text x="20" y="160" fill="white">Synthetic photo</text></svg>',
  );
  media.set("photo", photo);
  store = new JobStore(config.databasePath);
  userId = store.createUser(
    "modal-review",
    await hash("synthetic-modal-password"),
  ).id;
  // Synthetic readiness only; the injected answer service below owns all
  // generation. This marker is never used as an outbound provider credential.
  store.saveAiProviderConnection(
    userId,
    "openai",
    "synthetic-modal-no-credential",
    "Simulated",
  );
  store.saveAiTaskSelections(userId, {
    transcriptionProvider: "openai",
    transcriptionModel: "gpt-4o-mini-transcribe",
    analysisProvider: "openai",
    analysisModel: "gpt-6-luna",
    analysisThinkingLevel: "medium",
    askProvider: "openai",
    askModel: "gpt-6-luna",
    askThinkingLevel: "medium",
  });
  const otherUserId = store.createUser(
    "other-modal-owner",
    await hash("synthetic-other-password"),
  ).id;
  async function seed(kind: string, index: number, ownerUserId = userId) {
    const sourceUrl = `https://www.instagram.com/reel/modal-${kind}-${index}/`;
    const job = store.createOrGet({
      ownerUserId,
      sourceUrl,
      normalizedUrl: sourceUrl,
      sourceHash: `modal-${kind}-${index}`,
    }).job;
    const filename = media.get(kind);
    const sizeBytes = filename ? (await stat(filename)).size : 0;
    const capture = store.createCapture({
      job,
      sourceType: kind === "photo" ? "image" : "video",
      sourceId: `modal-${index}`,
      platform: "instagram",
      title: `Modal ${kind} ${String(index).padStart(2, "0")}`,
      creator: "synthetic.author",
      creatorUrl: null,
      description: `Synthetic source description ${longToken}`,
      transcript: `Plain transcript without segment timing. ${longToken}\n${"Synthetic transcript paragraph. ".repeat(300)}`,
      sourceLanguage: "fr",
      translatedTranscript: "Synthetic translation",
      translationLanguage: "en",
      comments: [
        {
          author: "synthetic.reader",
          text: "Synthetic retained comment",
          likeCount: 2,
          isPinned: true,
        },
      ],
      analysis: {
        title: `Modal ${kind} ${String(index).padStart(2, "0")}`,
        synopsis: `Synthetic bottom line ${longToken}`,
        whyUseful: "Synthetic use case",
        takeaways: Array.from(
          { length: 32 },
          (_, n) =>
            `Takeaway ${n + 1}. ${"Synthetic useful evidence. ".repeat(6)}`,
        ),
        topics: ["modal acceptance"],
        entities: [
          {
            name: "Synthetic place",
            type: "place",
            location: "Synthetic city",
            description: "Synthetic entity detail",
            confidence: 0.9,
          },
        ],
        recommendations: ["Synthetic retained action"],
        claimsNeedingVerification: ["Synthetic unverified claim"],
        evidence: [
          {
            claim: "Synthetic timed evidence",
            source: "transcript",
            timestampSeconds: kind === "portrait" ? 2 : null,
            quote: "Synthetic quote",
          },
        ],
        classification: {
          primaryDomain: "Learning",
          country: null,
          city: null,
          subcategory: "Reference",
          secondaryTopics: [],
          confidence: 0.9,
        },
      },
      publishedAt: null,
      durationSeconds: filename && kind !== "photo" ? 8 : null,
      notePath: `Synthetic/modal-${kind}-${index}.md`,
      assets: filename
        ? Array.from({ length: kind === "photo" ? 2 : 1 }, (_, position) => ({
            kind: kind === "photo" ? ("image" as const) : ("video" as const),
            path: filename,
            mimeType: kind === "photo" ? "image/svg+xml" : "video/mp4",
            sizeBytes,
            position,
          }))
        : [],
    })!;
    store.assignClassification(capture.id, capture.analysis.classification);
    store.complete(job.id, capture.notePath);
    return capture;
  }
  captures = await Promise.all([
    seed("portrait", 0),
    seed("landscape", 1),
    seed("photo", 2),
    seed("text", 3),
    ...Array.from({ length: 18 }, (_, n) => seed("filler", n + 4)),
  ]);
  foreignCapture = await seed("private-other-owner", 99, otherUserId);
  const sources = [captures[0]!, captures[2]!, captures[1]!, captures[3]!].map(
    (capture, n) => ({
      id: capture.id,
      citation: n + 1,
      title: capture.title,
      creator: capture.creator,
      platform: capture.platform,
      synopsis: capture.synopsis,
      sourceUrl: capture.sourceUrl,
      breadcrumb: ["Learning", "Reference"],
    }),
  );
  chatId = store.createConversation(userId, title)!.id;
  const first = store.beginConversationTurn(
    userId,
    chatId,
    "Earlier answer with a different source",
    "modal-earlier-turn",
  );
  store.completeConversationAttempt(
    userId,
    chatId,
    first.assistantId,
    "Earlier synthetic answer [1]",
    [{ ...sources[3]!, citation: 1 }],
    true,
  );
  const turn = store.beginConversationTurn(
    userId,
    chatId,
    "Inspect these four synthetic sources",
    "modal-current-turn",
  );
  store.completeConversationAttempt(
    userId,
    chatId,
    turn.assistantId,
    Array.from(
      { length: 28 },
      (_, n) =>
        `Synthetic answer paragraph ${n}. ${"Retain reading position. ".repeat(12)} [${(n % 4) + 1}]`,
    ).join("\n\n"),
    sources,
    true,
  );
  app = buildApp(config, store, new EventHub(), undefined, undefined, {
    answer: async (input) => {
      input.onDelta("Synthetic stream remains owned by this chat. ");
      await new Promise<void>((resolve) => {
        releaseStream = resolve;
      });
      const answer =
        "Synthetic stream remains owned by this chat. Completed while inspecting note.";
      input.onDelta("Completed while inspecting note.");
      store.completeConversationAttempt(
        input.userId,
        input.conversationId,
        input.assistantId,
        answer,
        sources,
        true,
      );
      return {
        answer,
        sources,
        sufficient: true,
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
  });
  await app.listen({ host: "127.0.0.1", port });
});

test.afterAll(async () => {
  releaseStream?.();
  await app?.close();
  store?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

async function login(page: Page) {
  await page.goto(`${origin}/app`);
  await page.getByLabel("Username").fill("modal-review");
  await page.getByLabel("Password").fill("synthetic-modal-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".inbox-row-button").first()).toBeVisible();
}
async function openChat(page: Page) {
  const menu = page.getByRole("button", { name: "Open menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(page.locator(".ask-thread")).toContainText(
    "Synthetic answer paragraph",
  );
  const sourcesToggle = page.getByTitle("Show or hide sources (S)", {
    exact: true,
  });
  if ((await sourcesToggle.getAttribute("aria-pressed")) === "false")
    await sourcesToggle.click();
}
function dialog(page: Page) {
  return page.locator('.capture-note[role="dialog"]');
}
async function openSource(page: Page, index = 0) {
  const trigger = page.locator(".ask-source-open").nth(index);
  await trigger.focus();
  await trigger.press("Enter");
  await expect(dialog(page)).toBeVisible();
  return trigger;
}
async function noHorizontalMovement(page: Page) {
  const root = await page.evaluate(() => ({
    x: scrollX,
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(root.x).toBe(0);
  expect(root.width).toBe(root.viewport);
  const overflow = await dialog(page).evaluate((root) =>
    [
      root,
      ...root.querySelectorAll<HTMLElement>(
        ".nv-body, .nv-media, [role=tabpanel]",
      ),
    ]
      .filter(
        (element) =>
          element.clientWidth > 0 &&
          (element.scrollWidth > element.clientWidth ||
            element.scrollLeft !== 0),
      )
      .map((element) => ({
        className: element.className,
        extra: element.scrollWidth - element.clientWidth,
      })),
  );
  expect(overflow).toEqual([]);
}
async function reachable(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(
    await locator.evaluate((element) => {
      const r = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return Boolean(hit && element.contains(hit));
    }),
  ).toBe(true);
}

test("Ask modal preserves mounted chat, exact scroll/focus, source order and all dismissal paths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 1000 });
  await login(page);
  await openChat(page);
  const thread = page.locator(".ask-thread");
  await thread.hover();
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => thread.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  for (const dismissal of ["close", "escape", "scrim"]) {
    const opener = page.locator(".ask-source-open").first();
    await opener.focus();
    const before = await thread.evaluate((element) => element.scrollTop);
    const shell = await page.locator(".shell").boundingBox();
    await opener.press("Enter");
    const note = dialog(page);
    await expect(note).toHaveAccessibleName(captures[0]!.title);
    expect(await page.locator(".ask-thread").count()).toBe(1);
    expect(await page.locator(".shell").boundingBox()).toEqual(shell);
    expect(
      await thread.evaluate((element) => element.closest("[inert]") !== null),
    ).toBe(true);
    await expect(
      note.getByRole("button", { name: "Previous note", exact: true }),
    ).toBeDisabled();
    await note.getByRole("button", { name: "Next note", exact: true }).click();
    await expect(note).toHaveAccessibleName(captures[2]!.title);
    await note.getByRole("button", { name: "Next note", exact: true }).click();
    await expect(note).toHaveAccessibleName(captures[1]!.title);
    await note.getByRole("button", { name: "Next note", exact: true }).click();
    await expect(note).toHaveAccessibleName(captures[3]!.title);
    await expect(
      note.getByRole("button", { name: "Next note", exact: true }),
    ).toBeDisabled();
    if (dismissal === "close")
      await note
        .getByRole("button", { name: "Close note", exact: true })
        .click();
    else if (dismissal === "escape") await page.keyboard.press("Escape");
    else await page.mouse.click(5, 5);
    await expect(note).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await thread.evaluate((element) => element.scrollTop)).toBe(before);
    expect(await page.locator(".shell").boundingBox()).toEqual(shell);
    expect(
      await thread.evaluate((element) => element.closest("[inert]") !== null),
    ).toBe(false);
  }
});

test("keyboard trap, nested filing Escape, retained detail content and genuine source link", async ({
  page,
}) => {
  await login(page);
  await openChat(page);
  const opener = await openSource(page);
  const note = dialog(page);
  for (let n = 0; n < 35; n++) {
    await page.keyboard.press(n < 20 ? "Tab" : "Shift+Tab");
    expect(
      await note.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await note.getByRole("tab", { name: /^Details\s*\d+$/ }).click();
  await expect(note).toContainText("Synthetic place");
  await expect(note).toContainText("Synthetic retained comment");
  await expect(note).toContainText("French");
  await note.getByRole("button", { name: "Move", exact: true }).click();
  const nested = page.getByRole("dialog", {
    name: "Move to a category",
    exact: true,
  });
  await expect(
    nested.getByRole("searchbox", { name: "Filter categories" }),
  ).toBeFocused();
  for (let n = 0; n < 12; n++) {
    await page.keyboard.press("Tab");
    expect(
      await nested.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(nested).toHaveCount(0);
  await expect(note).toBeVisible();
  await expect(
    note.getByRole("button", { name: "Move", exact: true }),
  ).toBeFocused();
  await expect(
    note.getByRole("link", { name: "Open original post on Instagram" }),
  ).toHaveAttribute("href", captures[0]!.sourceUrl);
  await note.getByRole("tab", { name: "Transcript", exact: true }).click();
  await expect(note).toContainText("Plain transcript without segment timing");
  await expect(note).toContainText("Synthetic translation");
  await expect(
    note.getByRole("button", { name: /seek|\d+:\d\d/i }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});

for (const viewport of [
  { width: 1360, height: 1000 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`real media and long content fit ${viewport.width}x${viewport.height} without root or pane movement`, async ({
    page,
    browserName,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page);
    await openChat(page);
    await openSource(page);
    const note = dialog(page);
    await reachable(
      note.getByRole("button", { name: "Close note", exact: true }),
    );
    await noHorizontalMovement(page);
    // Actual video bytes and HTMLMediaElement advancement, not a mocked play().
    const play = note.getByRole("button", { name: "Play video", exact: true });
    await expect(play).toBeVisible();
    await expect
      .poll(() =>
        note.locator("video").evaluate((v: HTMLVideoElement) => v.videoWidth),
      )
      .toBe(180);
    expect(
      await note
        .locator("video")
        .evaluateAll((videos) =>
          videos.every((v) => (v as HTMLVideoElement).paused),
        ),
    ).toBe(true);
    await reachable(play);
    await page.screenshot({
      path: testInfo.outputPath(
        `note-modal-${browserName}-${viewport.width}-portrait.png`,
      ),
    });
    await play.click();
    const video = note.locator("video");
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(0.1);
    expect(
      await video.evaluate(
        (v: HTMLVideoElement) => v.videoWidth / v.videoHeight,
      ),
    ).toBeCloseTo(9 / 16, 3);
    const videoBox = await video.boundingBox();
    expect(videoBox!.width / videoBox!.height).toBeCloseTo(9 / 16, 2);
    // Approved phone composition scrolls the fullscreen dialog; desktop keeps
    // its reading column independent from media and the originating workspace.
    const reader = viewport.width <= 760 ? note : note.locator(".nv-body");
    const background = await page
      .locator(".ask-thread")
      .evaluate((element) => element.scrollTop);
    await reader.hover();
    await page.mouse.wheel(0, 650);
    await expect
      .poll(() => reader.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(
      await page
        .locator(".ask-thread")
        .evaluate((element) => element.scrollTop),
    ).toBe(background);
    if (viewport.width > 600)
      expect(await video.boundingBox()).toEqual(videoBox);
    await noHorizontalMovement(page);
    await reachable(
      note.getByRole("button", { name: "Close note", exact: true }),
    );
    // Keep a reference to the removed element to prove switch/close pause it.
    const oldVideo = await video.elementHandle();
    await note.getByRole("button", { name: "Next note", exact: true }).click();
    await expect(note).toHaveAccessibleName(captures[2]!.title);
    expect(await oldVideo!.evaluate((v: HTMLVideoElement) => v.paused)).toBe(
      true,
    );
    await expect(note.locator("img").first()).toBeVisible();
    await expect(
      note.getByRole("button", { name: "Previous photo", exact: true }),
    ).toBeDisabled();
    await note.getByRole("button", { name: "Next photo", exact: true }).click();
    await expect(
      note.getByRole("button", { name: "Next photo", exact: true }),
    ).toBeDisabled();
    await expect(
      note.getByRole("button", { name: "Previous photo", exact: true }),
    ).toBeEnabled();
    await noHorizontalMovement(page);
    await note.getByRole("button", { name: "Next note", exact: true }).click();
    await expect(note).toHaveAccessibleName(captures[1]!.title);
    await note.getByRole("button", { name: "Play video", exact: true }).click();
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(0.1);
    const landscape = await video.boundingBox();
    expect(landscape!.width / landscape!.height).toBeCloseTo(16 / 9, 2);
    await noHorizontalMovement(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `note-modal-${browserName}-${viewport.width}-landscape.png`,
      ),
    });
    const landscapeVideo = await video.elementHandle();
    await note.getByRole("button", { name: "Close note", exact: true }).click();
    expect(
      await landscapeVideo!.evaluate((v: HTMLVideoElement) => v.paused),
    ).toBe(true);
    await openSource(page, 3);
    await expect(note).toHaveAccessibleName(captures[3]!.title);
    await expect(note.locator("video, img")).toHaveCount(0);
    await noHorizontalMovement(page);
    await note.getByRole("tab", { name: "Transcript", exact: true }).click();
    await noHorizontalMovement(page);
    await note.getByRole("tab", { name: /^Details\s*\d+$/ }).click();
    await noHorizontalMovement(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `note-modal-${browserName}-${viewport.width}.png`,
      ),
    });
    await page.keyboard.press("Escape");
  });
}

test("stored evidence seeks real video; plain transcript and untimed evidence do not invent timestamps", async ({
  page,
}) => {
  await login(page);
  await openChat(page);
  await openSource(page);
  const note = dialog(page);
  const timestamp = note.getByRole("button", { name: /0:02/ });
  await expect(timestamp).toHaveCount(1);
  await timestamp.click();
  await expect
    .poll(() =>
      note.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeGreaterThanOrEqual(2);
  await note.getByRole("button", { name: "Next note", exact: true }).click();
  await expect(note.getByRole("button", { name: /\d+:\d\d/ })).toHaveCount(0);
});

test("Inbox filtered order and Library node context survive modal navigation", async ({
  page,
}) => {
  await login(page);
  const search = page.getByRole("searchbox", { name: "Search your archive" });
  await search.fill("Modal filler");
  const rows = page.locator(".inbox-row-button");
  await expect(rows).toHaveCount(18);
  const order = await rows.locator(".inbox-row-title").allTextContents();
  const opener = rows.nth(5);
  await opener.focus();
  const before = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  await opener.press("Enter");
  const note = dialog(page);
  await expect(note).toHaveAccessibleName(order[5]!);
  await note.getByRole("button", { name: "Next note", exact: true }).click();
  await expect(note).toHaveAccessibleName(order[6]!);
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("Modal filler");
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(
    before,
  );
  expect(await rows.locator(".inbox-row-title").allTextContents()).toEqual(
    order,
  );
  await page
    .getByRole("button", { name: "Knowledge base", exact: true })
    .click();
  await page
    .locator(".kb-home")
    .getByRole("button", { name: "Learning", exact: true })
    .click();
  const library = page.locator(".kb-capture-row");
  await expect(library.first()).toBeVisible();
  const libraryTitles = await library
    .locator(".kb-capture-text strong")
    .allTextContents();
  await library.first().focus();
  await library.first().press("Enter");
  await expect(note).toHaveAccessibleName(libraryTitles[0]!);
  await note.getByRole("button", { name: "Next note", exact: true }).click();
  await expect(note).toHaveAccessibleName(libraryTitles[1]!);
  await page.keyboard.press("Escape");
  await expect(library.first()).toBeFocused();
  expect(
    await library.locator(".kb-capture-text strong").allTextContents(),
  ).toEqual(libraryTitles);
});

test("pending Ask stream completes in its owning chat while modal is open", async ({
  page,
}) => {
  await login(page);
  await openChat(page);
  await page
    .getByRole("textbox", { name: "Ask your archive" })
    .fill("Synthetic pending modal stream");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ask-answer").last()).toContainText(
    "Synthetic stream remains owned by this chat",
  );
  // Activate a citation from a completed answer while the next turn streams.
  await page
    .locator(".ask-answer.complete .ask-cite, .ask-message.complete .ask-cite")
    .last()
    .click();
  const opener = await openSource(page);
  const originalOpener = await opener.elementHandle();
  try {
    releaseStream?.();
    releaseStream = undefined;
    await expect
      .poll(
        () => store.getConversation(userId, chatId)?.messages?.at(-1)?.status,
      )
      .toBe("complete");
    await expect(dialog(page)).toBeVisible();
    expect(
      await originalOpener!.evaluate((element) => element.isConnected),
    ).toBe(true);
  } finally {
    releaseStream?.();
    releaseStream = undefined;
  }
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(page.locator(".ask-answer").last()).toContainText(
    "Completed while inspecting note",
  );
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toHaveCount(0);
});

test("capture loading/failure stays inside closable dialog; foreign owner stays inaccessible", async ({
  page,
}) => {
  await login(page);
  await openChat(page);
  let releaseResponse: (() => void) | undefined;
  await page.route(
    `**/api/v1/captures/${captures[0]!.id}`,
    async (route) => {
      await new Promise<void>((resolve) => {
        releaseResponse = resolve;
      });
      await route.fulfill({
        status: 503,
        json: { error: "synthetic_unavailable" },
      });
    },
    { times: 1 },
  );
  await openSource(page);
  await expect(dialog(page).getByRole("status")).toContainText("Loading");
  releaseResponse?.();
  await expect(dialog(page).getByRole("alert")).toContainText(
    "could not be loaded",
  );
  await dialog(page)
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  await expect(dialog(page)).toHaveAccessibleName(captures[0]!.title);
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      async (id) => (await fetch(`/api/v1/captures/${id}`)).status,
      foreignCapture.id,
    ),
  ).toBe(404);
  await expect(page.locator(".ask-thread")).toBeVisible();
});

test("media failure remains inside modal with real source recovery", async ({
  page,
}) => {
  await login(page);
  await openChat(page);
  await page.route(`**/api/v1/captures/${captures[0]!.id}/assets/*`, (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await openSource(page);
  const alert = dialog(page).getByRole("alert");
  await expect(alert).toContainText("Media unavailable");
  await expect(
    alert.getByRole("link", { name: "Open original", exact: true }),
  ).toHaveAttribute("href", captures[0]!.sourceUrl);
  await dialog(page)
    .getByRole("button", { name: "Close note", exact: true })
    .click();
  await expect(page.locator(".ask-thread")).toBeVisible();
});

test("Ask about this preserves title prefill without submitting or inventing context", async ({
  page,
}) => {
  await login(page);
  await openChat(page);
  await openSource(page);
  const question = `What does "${captures[0]!.title}" say?`;
  const ask = dialog(page).getByRole("link", {
    name: "Ask about this capture",
    exact: true,
  });
  await expect(ask).toHaveAttribute(
    "href",
    `/app?tab=ask&q=${encodeURIComponent(question)}`,
  );
  let submissions = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/v1\/conversations\//.test(request.url())
    )
      submissions++;
  });
  await ask.click();
  await expect(
    page.getByRole("textbox", { name: "Ask your archive" }),
  ).toHaveValue(question);
  expect(submissions).toBe(0);
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toHaveCount(0);
});

test("Settings retains its own Escape and focus return after note inspection", async ({
  page,
}) => {
  await login(page);
  await openChat(page);
  await openSource(page);
  await page.keyboard.press("Escape");
  const settingsTrigger = page.locator(".app-profile-settings");
  await settingsTrigger.focus();
  await settingsTrigger.press("Enter");
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(
    await settings.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
  await expect(settingsTrigger).toBeFocused();
  await expect(page.locator(".ask-thread")).toBeVisible();
});
