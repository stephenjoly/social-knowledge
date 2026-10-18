import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

// Accepts the redesigned label first and the pre-redesign label as a fallback so
// the harness keeps working while screens are migrated one at a time.
const settingsTopic =
  (...labels: string[]) =>
  async (page: Page) => {
    await page.goto(`${base}/?tab=settings`);
    for (const label of labels) {
      const option = page
        .getByRole("button", { name: label, exact: true })
        .first();
      if (await option.count()) {
        await option.click();
        return;
      }
    }
    throw new Error(`no settings topic matched: ${labels.join(", ")}`);
  };

const screens: Screen[] = [
  {
    id: "01",
    name: "sign-in",
    open: async (page) => {
      await page.context().clearCookies();
      await page.goto(base);
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
        .getByRole("button", { name: /Where should I eat in Lisbon/ })
        .first()
        .click();
    },
  },
  { id: "10", name: "settings-my-account", open: settingsTopic("My account") },
  {
    id: "11",
    name: "settings-ai-models",
    open: settingsTopic("AI & models", "AI"),
  },
  { id: "12", name: "settings-connections", open: settingsTopic("Connections") },
  { id: "13", name: "settings-api-keys", open: settingsTopic("API keys") },
  { id: "14", name: "settings-data-export", open: settingsTopic("Data & export") },
  {
    id: "15",
    name: "settings-people-access",
    open: settingsTopic("People & access"),
  },
];

const root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-ui-"));
const config = testConfig(root);
config.appUrl = base;
await mkdir(path.join(root, "data"), { recursive: true });
const store = new JobStore(config.databasePath);
const user = await seedUiFixture(store, config);

const conversation = store.createConversation(user.id, "New conversation");
store.addConversationMessage(
  user.id,
  conversation.id,
  "user",
  "Where should I eat in Lisbon, based on what I've saved?",
);
const lisbon = store
  .listCaptures({ userId: user.id, limit: 50 })
  .captures.filter((capture) => capture.title.toLowerCase().includes("lisbo"));
store.addConversationMessage(
  user.id,
  conversation.id,
  "assistant",
  [
    "Your saves point to two places worth planning around.",
    "",
    "- Manteigaria, Chiado. Go before 10am for warm pastel de nata. [1]",
    "- Taberna da Rua das Flores. No bookings, so arrive at 7pm. [2]",
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

await mkdir(outDir, { recursive: true });
await page.goto(base);
await page.getByLabel("Username").fill(fixtureAccount.username);
await page.getByLabel("Password").fill(fixtureAccount.password);
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForSelector(".app-frame, .app-sidebar, main", { timeout: 15_000 });
const storageState = await context.storageState();

const failures: string[] = [];
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
    console.log(`captured ${screen.id}-${screen.name}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    failures.push(`${screen.id}-${screen.name}: ${reason}`);
    console.error(`FAILED  ${screen.id}-${screen.name}: ${reason}`);
  }
}

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
