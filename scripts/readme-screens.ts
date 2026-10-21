import { mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";
import { fixtureAccount, seedUiFixture } from "./ui-fixture.js";

// Run after npm run build. --only inbox supports the first capture review.
const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : undefined;
if (only && !["inbox", "capture-detail", "ask"].includes(only))
  throw new Error("Unknown screenshot selection");
const outDir = path.resolve("docs/screenshots");
const root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-readme-"));
const config = testConfig(root);
const originalFetch = globalThis.fetch;
let store: JobStore | undefined;
let app: ReturnType<typeof buildApp> | undefined;
let browser: Browser | undefined;
const errors: string[] = [];
const measurements: Array<{ screen: string; bytes: number; viewport: number; document: number }> = [];

async function ready(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, async (image) => {
      if (!image.complete) await new Promise<void>((resolve, reject) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => reject(new Error("Image failed to load")), { once: true });
      });
      if (!image.naturalWidth) throw new Error("Image has no pixels");
      await image.decode();
    }));
    // CSS background thumbnails are not included in document.images.
    const backgrounds = Array.from(document.querySelectorAll("*"))
      .flatMap((element) => Array.from(getComputedStyle(element).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g), (match) => match[1]!));
    await Promise.all(backgrounds.map(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
    }));
  });
}

async function capture(page: Page, screen: string) {
  await ready(page);
  const geometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    unsafe: /\/Users\/|\/private\/|fixture-not-a-real|test-token-that/.test(document.body.innerText),
  }));
  if (geometry.document > geometry.viewport) throw new Error(`${screen}: horizontal overflow`);
  if (geometry.unsafe) throw new Error(`${screen}: internal fixture detail visible`);
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  const file = path.join(outDir, `${screen}.png`);
  // Ask's current shell is slightly taller than its viewport; include the
  // complete native page so the follow-up composer stays visible.
  await page.screenshot({ path: file, fullPage: screen === "ask" });
  measurements.push({ screen, bytes: (await stat(file)).size, viewport: geometry.viewport, document: geometry.document });
  console.log(`Captured ${screen}`);
}

try {
  // This process must never call social sites or model providers.
  globalThis.fetch = (async () => { throw new Error("Screenshot fixture blocks outbound fetch"); }) as typeof fetch;
  await mkdir(path.dirname(config.databasePath), { recursive: true });
  store = new JobStore(config.databasePath);
  const user = await seedUiFixture(store, config);
  const conversation = store.createConversation(user.id, "Seeded sample: Lisbon food recommendations");
  if (!conversation) throw new Error("Sample conversation was not created");
  store.addConversationMessage(user.id, conversation.id, "user", "Where should I eat in Lisbon, based on these sample saves?");
  const captures = store.listCaptures({ userId: user.id, limit: 50 }).captures;
  const sources = ["lisbonfoodie", "eatlisboa"].map((creator, index) => {
    const item = captures.find((capture) => capture.creator === creator);
    if (!item) throw new Error("Sample citation capture missing");
    return { id: item.id, citation: index + 1, title: item.title, creator: item.creator,
      platform: item.platform, synopsis: item.synopsis ?? "", sourceUrl: item.sourceUrl,
      breadcrumb: ["Travel", "Lisbon"] };
  });
  store.addConversationMessage(user.id, conversation.id, "assistant", [
    "These sample saves suggest a bakery stop and a small-plates dinner:", "",
    "- **Manteigaria, Chiado.** Go before 10am, eat the pastel de nata warm, and ask for the newest tray. [1]",
    "- **Taberna da Rua das Flores.** Arrive at 7pm for small plates; the saved post says there are no bookings. [2]", "",
    "Start with the bakery if you only have one morning. Open the saved posts to check the original context before planning your visit.",
  ].join("\n"), sources, true);
  app = buildApp(config, store, new EventHub());
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture listener");
  const base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin !== base) {
      errors.push("Blocked outbound browser request");
      await route.abort();
    } else await route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  // Login intentionally probes the anonymous session and optional demo accounts.
  // Neither endpoint is part of the authenticated screens being captured.
  const expectedLoginProbe = (url: string, status?: number) => {
    const pathname = new URL(url).pathname;
    return (pathname === "/api/auth/me" && (status === undefined || status === 401))
      || (pathname === "/api/auth/demo-accounts" && (status === undefined || status === 404));
  };
  page.on("console", (message) => {
    if (message.type() === "error" && !expectedLoginProbe(message.location().url || base)) errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !expectedLoginProbe(response.url(), response.status()))
      errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
  });
  await mkdir(outDir, { recursive: true });
  await page.goto(`${base}/login`);
  await page.getByLabel("Username").fill(fixtureAccount.username);
  await page.getByLabel("Password", { exact: true }).fill(fixtureAccount.password);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/auth/login") && response.ok()),
    page.getByRole("button", { name: "Continue", exact: true }).click(),
  ]);
  await page.waitForURL((url) => url.pathname === "/app");
  await page.getByRole("heading", { name: "Inbox", exact: true }).waitFor();
  await page.getByRole("button", { name: /Pastel de nata: the bakery locals actually queue for/ }).first().waitFor();
  if (!only || only === "inbox") await capture(page, "inbox");
  if (!only || only === "capture-detail") {
    await page.getByRole("button", { name: /Pastel de nata: the bakery locals actually queue for/ }).first().click();
    await page.getByRole("heading", { name: "Key takeaways", exact: true }).waitFor();
    await capture(page, "capture-detail");
  }
  if (!only || only === "ask") {
    await page.goto(`${base}/app?tab=ask`);
    await page.getByRole("button", { name: /Seeded sample: Lisbon food recommendations/ }).first().click();
    await page.getByRole("heading", { name: "Sources", exact: true }).waitFor();
    await page.getByText("2 saved posts", { exact: true }).waitFor();
    await capture(page, "ask");
  }
  console.log(JSON.stringify({ measurements, browserErrors: errors }, null, 2));
} finally {
  try {
    const cleanup = await Promise.allSettled([browser?.close(), app?.close()]);
    for (const result of cleanup) if (result.status === "rejected") console.error("Resource cleanup failed", result.reason);
  } finally {
    try { store?.close(); } finally {
      globalThis.fetch = originalFetch;
      await rm(root, { recursive: true, force: true });
    }
  }
  console.log("Cleanup complete: browser, server, disposable database, media and vault removed.");
}
