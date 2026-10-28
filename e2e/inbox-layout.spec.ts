import { expect, test, type Page } from "@playwright/test";
import { fixtureAccount } from "../scripts/ui-fixture.js";
import { browserApi } from "./ui-qa-api.js";

test.skip(process.env.E2E_UI_FIXTURE !== "true", "Run with scripts/ui-e2e.ts");

async function login(page: Page, username = fixtureAccount.username, password = fixtureAccount.password) {
  await page.goto("/app");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
}

test("09–10 rows default; keyboard toggle retains full query, loaded IDs and browsing anchor", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const seededResponse = await browserApi(page, "/api/v1/captures?limit=48");
  expect(seededResponse.status()).toBe(200);
  const seeded = await seededResponse.json();
  const facetsResponse = await browserApi(page, "/api/v1/capture-facets");
  expect(facetsResponse.status()).toBe(200);
  const facets = await facetsResponse.json();
  const category = facets.categories.find((item: { label: string }) => item.label === "Travel");
  expect(category).toBeTruthy();
  const template = seeded.captures[0];
  expect(template).toBeTruthy();
  const captures = Array.from({ length: 60 }, (_, index) => ({
    ...template, id: `qa-layout-${index}`, title: `Anchor capture ${String(index).padStart(2, "0")}`,
    assets: [],
  }));
  const queries: string[] = [];
  await page.route("**/api/v1/captures?**", (route) => {
    const url = new URL(route.request().url());
    queries.push(url.search);
    return route.fulfill({ json: {
      captures: url.searchParams.has("cursor") ? captures.slice(48) : captures.slice(0, 48),
      nextCursor: url.searchParams.has("cursor") ? null : "qa-page-2",
    } });
  });
  await page.reload();
  const rows = page.getByRole("button", { name: "Rows", exact: true });
  const tiles = page.getByRole("button", { name: "Tiles", exact: true });
  await expect(rows).toHaveAttribute("aria-pressed", "true");
  await expect(tiles).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("Search your archive").fill("Anchor");
  await page.getByLabel("Sort captures").selectOption("title:asc");
  await page.getByRole("button", { name: "Add filter", exact: true }).click();
  await page.getByRole("combobox", { name: "Platform", exact: true }).selectOption("instagram");
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption(category.id);
  await page.getByRole("combobox", { name: "Topic", exact: true }).selectOption("restaurants");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(() => queries.some((query) => {
    const params = new URLSearchParams(query);
    return params.get("search") === "Anchor" && params.get("platform") === "instagram" && params.get("nodeId") === category.id
      && params.get("topic") === "restaurants" && params.get("sort") === "title" && params.get("direction") === "asc";
  })).toBe(true);
  await expect(page.locator(".inbox-row")).toHaveCount(48);
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.locator(".inbox-row")).toHaveCount(60);
  const titleText = async () => page.locator(".inbox-row-title").allTextContents();
  const before = await titleText();
  const queryCount = queries.length;
  // Keep a deep item as the browsing anchor, then activate the view control
  // without scrolling it into view. Pointer auto-scroll would hide regressions.
  await page.getByText("Anchor capture 50", { exact: true }).scrollIntoViewIfNeeded();
  const anchor = await page.locator(".inbox-row").evaluateAll((elements) => {
    const first = elements.find((element) => element.getBoundingClientRect().bottom > 0);
    return first ? { title: first.querySelector(".inbox-row-title")?.textContent, y: first.getBoundingClientRect().top } : null;
  });
  expect(anchor).toBeTruthy();
  await tiles.evaluate((element: HTMLButtonElement) => element.focus({ preventScroll: true }));
  await page.keyboard.press("Enter");
  await expect(tiles).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".inbox-tile")).toHaveCount(60);
  expect(await page.locator(".inbox-tile-title").allTextContents()).toEqual(before);
  await expect(page.getByLabel("Search your archive")).toHaveValue("Anchor");
  await expect(page.getByLabel("Sort captures")).toHaveValue("title:asc");
  await expect(page.getByRole("button", { name: /Platform: Instagram/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Category: Travel/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Topic: restaurants/ })).toHaveCount(1);
  expect(queries).toHaveLength(queryCount);
  await expect.poll(async () => {
    const box = await page.locator(".inbox-tile").filter({ hasText: anchor!.title! }).boundingBox();
    return box ? Math.abs(box.y - anchor!.y) : Infinity;
  }).toBeLessThan(100);
  await rows.evaluate((element: HTMLButtonElement) => element.focus({ preventScroll: true }));
  await page.keyboard.press("Space");
  await expect(page.locator(".inbox-row")).toHaveCount(60);
  expect(await titleText()).toEqual(before);
  await expect.poll(async () => {
    const box = await page.locator(".inbox-row").filter({ hasText: anchor!.title! }).boundingBox();
    return box ? Math.abs(box.y - anchor!.y) : Infinity;
  }).toBeLessThan(100);
});

test("10 preference survives reload and is scoped per signed-in account in one browser", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Tiles", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Tiles", exact: true })).toHaveAttribute("aria-pressed", "true");
  await browserApi(page, "/api/auth/logout", "POST");
  await login(page, "maya", "fixture-maya-password");
  await expect(page.getByRole("button", { name: "Rows", exact: true })).toHaveAttribute("aria-pressed", "true");
  await browserApi(page, "/api/auth/logout", "POST");
  await login(page);
  await expect(page.getByRole("button", { name: "Tiles", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("10 owner isolation clears Activity and capture draft across SPA sign-out without reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.getByRole("button", { name: "Tiles", exact: true }).click();
  await page.getByRole("button", { name: "Capture a post", exact: true }).click();
  const capture = page.getByRole("dialog", { name: "Capture a post", exact: true });
  await capture.getByLabel("Post link").fill("https://www.instagram.com/reel/private-owner-draft/");
  await capture.getByLabel(/Note for your future self/).fill("Private synthetic owner draft note");
  await capture.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.locator(".activity-row").filter({ hasText: "Pastel de nata" }).first()).toBeVisible();

  let holdNextAccount = false;
  let heldRequests = 0;
  let release = () => {};
  let releasePriorOwner = () => {};
  let priorOwnerCaptured = false;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const priorOwnerBarrier = new Promise<void>((resolve) => { releasePriorOwner = resolve; });
  await page.route("**/api/v1/jobs**", async (route) => {
    const url = new URL(route.request().url());
    if (!holdNextAccount && !priorOwnerCaptured && url.pathname === "/api/v1/jobs" && url.searchParams.get("filter") === "active") {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      expect((await response.json()).jobs.some((item: { displayTitle: string | null }) => item.displayTitle?.includes("Pastel de nata"))).toBe(true);
      priorOwnerCaptured = true;
      await priorOwnerBarrier;
      await route.fulfill({ response });
      return;
    }
    if (holdNextAccount && route.request().method() === "GET" &&
      (url.pathname === "/api/v1/jobs" || url.pathname === "/api/v1/jobs/failed")) {
      heldRequests++;
      await barrier;
    }
    await route.continue();
  });
  // A window sentinel proves this transition did not reload the document.
  await page.evaluate(() => { Object.assign(window, { __qaSpaSentinel: "same-document" }); });
  await page.getByLabel("Filter captures").selectOption("active");
  await expect.poll(() => priorOwnerCaptured).toBe(true);
  await page.getByRole("button", { name: "Open account menu", exact: true }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  holdNextAccount = true;
  try {
    await page.getByLabel("Username").fill("maya");
    await page.getByLabel("Password", { exact: true }).fill("fixture-maya-password");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("button", { name: "Open account menu", exact: true })).toContainText("Maya Chen");
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await expect.poll(() => heldRequests).toBeGreaterThan(0);
    await expect(page.locator(".activity-row")).toHaveCount(0);
    await expect(page.locator(".activity-attention-item")).toHaveCount(0);
    const staleResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/v1/jobs" && url.searchParams.get("filter") === "active";
    });
    releasePriorOwner();
    await (await staleResponse).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    // The old owner's actual response arrived after Maya signed in. It must
    // remain invalid while her own requests are still held at the boundary.
    await expect(page.locator(".activity-row")).toHaveCount(0);
    await expect(page.locator(".app-processing")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Capture details" })).not.toContainText("Pastel de nata");
    await expect(page.locator("body")).not.toContainText("private-owner-draft");
    await page.getByRole("button", { name: "Capture a post", exact: true }).click();
    await expect(capture.getByLabel("Post link")).toHaveValue("");
    await expect(capture.getByLabel(/Note for your future self/)).toHaveValue("");
    await capture.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Inbox", exact: true }).click();
    await expect(page.getByRole("button", { name: "Rows", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => Reflect.get(window, "__qaSpaSentinel"))).toBe("same-document");
  } finally {
    holdNextAccount = false;
    releasePriorOwner();
    release();
  }
});

test("11 mobile tiles use stored thumbnails, stable missing/broken fallback, and open notes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Tiles", exact: true }).click();
  const pastry = page.locator(".inbox-tile").filter({ hasText: "Pastel de nata: the bakery locals actually queue for" });
  const image = pastry.locator("img");
  await expect(image).toHaveCount(1);
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(image).toHaveAttribute("src", /^\/api\/v1\/captures\/[^/]+\/assets\//);
  await expect(pastry).toContainText("@lisbonfoodie");
  await expect(pastry).toContainText("Instagram");
  const missing = page.locator(".inbox-tile").filter({ hasText: "One-pan miso salmon in 15 minutes" });
  await expect(missing.locator("img")).toHaveCount(0);
  await expect(missing.locator(".inbox-tile-fallback")).toBeVisible();
  const tiles = page.locator(".inbox-tile");
  const first = await tiles.nth(0).boundingBox();
  const second = await tiles.nth(1).boundingBox();
  expect(first).toBeTruthy(); expect(second).toBeTruthy();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
  expect(Math.abs(first!.x - second!.x)).toBeLessThan(2);
  const src = await image.getAttribute("src");
  await page.route(`**${src}`, (route) => route.abort());
  await page.reload();
  await expect(pastry.locator("img")).toHaveCount(0);
  await expect(pastry.locator(".inbox-tile-fallback")).toBeVisible();
  await expect(pastry).toContainText("@lisbonfoodie");
  await pastry.getByRole("button").click();
  await expect(page.getByRole("heading", { name: "Pastel de nata: the bakery locals actually queue for", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
