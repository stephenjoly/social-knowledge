import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium, type Page } from "playwright";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";
import { fixtureAccount, seedUiFixture } from "./ui-fixture.js";

/**
 * Captures every redesigned screen from a disposable, synthetically seeded app so
 * the result can be compared against docs/design/ui-v2/screens.
 *
 *   npx tsx scripts/ui-screens.ts [--width 1280] [--height 880] [--only 04,07]
 *
 * Chromium needs its system libraries on PATH; see docs/design/ui-v2-spec.md.
 */

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const width = Number(flag("width", "1280"));
const height = Number(flag("height", "880"));
const only = flag("only", "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const outDir = path.resolve(flag("out", "artifacts/ui-screens"));
const port = Number(flag("port", "8821"));
const base = `http://127.0.0.1:${port}`;

type Screen = { id: string; name: string; open: (page: Page) => Promise<void> };

// Opens a topic through the `?topic=` deep link that Settings reads on mount, then
// falls back to clicking the settings navigation labels (the shell's sidebar, or
// the pre-redesign in-page list) if the page heading did not change.
const settingsTopic =
  (topic: string, title: string, ...labels: string[]) =>
  async (page: Page) => {
    await page.goto(`${base}/?tab=settings&topic=${topic}`);
    const heading = page.getByRole("heading", { level: 1, name: title, exact: true });
    try {
      await heading.waitFor({ timeout: 5_000 });
      return;
    } catch {
      // fall through to the navigation labels
    }
    for (const label of [title, ...labels]) {
      const option = page
        .getByRole("button", { name: label, exact: true })
        .or(page.getByRole("link", { name: label, exact: true }))
        .first();
      if (await option.count()) {
        await option.click();
        await heading.waitFor({ timeout: 5_000 });
        return;
      }
    }
    throw new Error(`no settings topic matched: ${[title, ...labels].join(", ")}`);
  };

const screens: Screen[] = [
  {
    id: "01",
    name: "sign-in",
    open: async (page) => {
      await page.context().clearCookies();
      await page.goto(base);
      await page.getByLabel("Username").fill(fixtureAccount.username);
      await page.getByLabel("Password", { exact: true }).fill("design-12chr");
      await page.getByLabel("Password", { exact: true }).focus();
    },
  },
  { id: "02", name: "inbox", open: async (page) => void (await page.goto(base)) },
  {
    id: "03",
    name: "capture",
    open: async (page) => {
      await page.goto(base);
      await page
        .getByRole("button", { name: "Capture a post", exact: true })
        .first()
        .click();
    },
  },
  {
    id: "04",
    name: "activity",
    open: async (page) => void (await page.goto(`${base}/?tab=activity`)),
  },
  {
    id: "05",
    name: "knowledge-base",
    open: async (page) => void (await page.goto(`${base}/?tab=library`)),
  },
  {
    id: "06",
    name: "knowledge-topic",
    open: async (page) => {
      await page.goto(`${base}/?tab=library`);
      await page.getByRole("button", { name: "Travel" }).first().click();
      await page.getByRole("button", { name: "Lisbon" }).first().click();
    },
  },
  {
    id: "07",
    name: "capture-note",
    open: async (page) => {
      await page.goto(base);
      await page
        .getByRole("button", {
          name: /Pastel de nata: the bakery locals actually queue for/,
        })
        .first()
        .click();
    },
  },
  { id: "08", name: "ask", open: async (page) => void (await page.goto(`${base}/?tab=ask`)) },
  {
    id: "09",
    name: "ask-answer",
    open: async (page) => {
      await page.goto(`${base}/?tab=ask`);
      await page
        .getByRole("button", { name: /Lisbon food recommendations/ })
        .first()
        .click();
    },
  },
  { id: "10", name: "settings-my-account", open: settingsTopic("account", "My account") },
  {
    id: "11",
    name: "settings-ai-models",
    open: async (page) => {
      await settingsTopic("ai", "AI & models", "AI")(page);
      // The export shows an unsaved model change, so draw the save bar.
      await page.getByLabel("Analysis model").selectOption("gpt-5");
    },
  },
  {
    id: "12",
    name: "settings-connections",
    open: settingsTopic("connections", "Connections"),
  },
  { id: "13", name: "settings-api-keys", open: settingsTopic("api", "API keys") },
  {
    id: "14",
    name: "settings-data-export",
    open: settingsTopic("data", "Data & export"),
  },
  {
    id: "15",
    name: "settings-people-access",
    open: settingsTopic("people", "People & access"),
  },
];

const root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-ui-"));
const config = testConfig(root);
config.appUrl = base;
await mkdir(path.join(root, "data"), { recursive: true });
const store = new JobStore(config.databasePath);
const user = await seedUiFixture(store, config);
// seedUiFixture provides the verified analysis selection used by Ask and Settings.

// Older conversations for Ask's recent list, aged so their labels read as a weekday and a date.
const daysSinceTuesday = (new Date().getDay() + 5) % 7 || 7;
const earlierConversations = [
  ["Zone 2 vs. HIIT, from my saves", daysSinceTuesday],
  ["Gift ideas from cooking reels", 9],
] as const;
const agedConversations = new Database(config.databasePath);
for (const [title, daysAgo] of earlierConversations) {
  const older = store.createConversation(user.id, title);
  if (!older) throw new Error("Unable to seed a recent conversation");
  store.addConversationMessage(user.id, older.id, "user", title);
  agedConversations
    .prepare("UPDATE conversations SET updated_at=? WHERE id=?")
    .run(new Date(Date.now() - daysAgo * 86_400_000).toISOString(), older.id);
}
agedConversations.close();

const conversation = store.createConversation(user.id, "Lisbon food recommendations");
if (!conversation) throw new Error("Unable to seed the answer conversation");
store.addConversationMessage(
  user.id,
  conversation.id,
  "user",
  "Where should I eat in Lisbon, based on what I've saved?",
);
const lisbonCaptures = store.listCaptures({ userId: user.id, limit: 50 }).captures;
const lisbon = ["lisbonfoodie", "eatlisboa"].map(
  (creator) => lisbonCaptures.find((capture) => capture.creator === creator)!,
);
store.addConversationMessage(
  user.id,
  conversation.id,
  "assistant",
  [
    "Your saves point to three places worth planning around, plus one to avoid at peak times.",
    "",
    "- Manteigaria, Chiado. Go before 10am for warm pastel de nata; locals rate it above Belém. [1]",
    "- Taberna da Rua das Flores. Small plates, no bookings. Arrive at 7pm to avoid an hour's wait. [2]",
    "- Campo de Ourique market. A calmer alternative to Time Out Market, especially at lunch. [2]",
    "",
    "If you only have one morning, pair Manteigaria with a walk down to the river; both bakery posts mention it as the best start to the day.",
  ].join("\n"),
  lisbon.slice(0, 2).map((capture, index) => ({
    id: capture.id,
    citation: index + 1,
    title: capture.title,
    creator: capture.creator,
    platform: capture.platform,
    synopsis: capture.synopsis ?? "",
    sourceUrl: capture.sourceUrl,
    breadcrumb: ["Travel", "Lisbon"],
  })),
  true,
);

const app = buildApp(config, store, new EventHub());
await app.listen({ host: "127.0.0.1", port });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const browserErrors: string[] = [];
page.on("pageerror", (error) => browserErrors.push(error.message));

await mkdir(outDir, { recursive: true });
await page.goto(base);
await page.getByLabel("Username").fill(fixtureAccount.username);
await page.getByLabel("Password").fill(fixtureAccount.password);
await Promise.all([
  page.waitForResponse((response) => response.url().endsWith("/api/auth/login") && response.ok()),
  page.getByRole("button", { name: "Continue" }).click(),
]);
await page.waitForSelector(".app-frame, .app-sidebar, main", { timeout: 15_000 });
const storageState = await context.storageState();

const failures: string[] = [];
const measurements: Array<{ screen: string; viewport: number; document: number }> = [];
for (const screen of screens) {
  if (only.length && !only.includes(screen.id)) continue;
  try {
    if (screen.id !== "01") await context.addCookies(storageState.cookies);
    await screen.open(page);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(outDir, `${screen.id}-${screen.name}.png`),
    });
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    measurements.push({ screen: `${screen.id}-${screen.name}`, ...geometry });
    if (geometry.document > geometry.viewport)
      throw new Error(`horizontal overflow: ${geometry.document}px exceeds ${geometry.viewport}px`);
    console.log(`captured ${screen.id}-${screen.name}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    failures.push(`${screen.id}-${screen.name}: ${reason}`);
    console.error(`FAILED  ${screen.id}-${screen.name}: ${reason}`);
  }
}

await writeFile(
  path.join(outDir, "verification.json"),
  JSON.stringify({ width, height, measurements, failures, browserErrors }, null, 2) + "\n",
);
failures.push(...browserErrors.map((error) => `browser: ${error}`));

await browser.close();
await app.close();
store.close();
await rm(root, { recursive: true, force: true });

console.log(`\nScreens written to ${outDir}`);
if (failures.length) {
  console.error(`\n${failures.length} screen(s) could not be captured:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exitCode = 1;
}
