import { expect, test } from "@playwright/test";

const stages = (
  active: "added" | "found" | "media" | "text" | "saved",
  failed = false,
) =>
  (["added", "found", "media", "text", "saved"] as const).map((name) => ({
    name,
    state: failed && name === active
      ? "failed"
      : name === active
        ? "active"
        : ["added", "found", "media", "text", "saved"].indexOf(name) <
            ["added", "found", "media", "text", "saved"].indexOf(active)
          ? "completed"
          : "queued",
    durationMs: name === active ? 1840 : null,
  }));

const job = (
  id: string,
  status: string,
  createdAt: string,
  options: { errorCode?: string; title?: string; stage?: "added" | "found" | "media" | "text" | "saved"; attempts?: number } = {},
) => ({
  id,
  status,
  normalizedUrl: `https://www.instagram.com/reel/${id}/`,
  displayTitle: options.title ?? id,
  attempts: options.attempts ?? 0,
  errorCode: options.errorCode ?? null,
  createdAt,
  updatedAt: createdAt,
  reachedStages: [options.stage ?? "added"],
  stages: status === "complete"
    ? stages("saved").map((stage) => ({ ...stage, state: "completed", durationMs: 1000 }))
    : stages(options.stage ?? "added", status === "failed"),
});

test("Activity inspects safe logs, complete failure counts, and compact account controls", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const failedCookie = job("failed-cookie", "failed", "2026-09-24T12:01:00.000Z", {
    errorCode: "authentication_required",
    title: "Reconnect account",
    stage: "found",
    attempts: 2,
  });
  const failedMedia = job("failed-media", "failed", "2026-09-24T12:03:00.000Z", {
    errorCode: "processing_failed",
    title: "Media issue",
    stage: "media",
  });
  const activeOld = job("active-old", "downloading", "2026-09-24T12:05:00.000Z", {
    title: "Earlier capture",
    stage: "media",
  });
  const activeNew = job("active-new", "processing", "2026-09-24T12:07:00.000Z", {
    title: "Newest capture",
    stage: "text",
  });
  const queued = job("queued", "queued", "2026-09-24T12:04:00.000Z", { title: "Queued capture" });
  const complete = job("complete", "complete", "2026-09-22T12:01:00.000Z", { title: "Saved capture", stage: "saved", attempts: 1 });
  const olderComplete = job("older-complete", "complete", "2026-09-20T12:01:00.000Z", { title: "Older saved capture", stage: "saved" });
  const retried: string[] = [];

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/auth/me", (route) => route.fulfill({ contentType: "application/json", body: '{"user":{"id":"fixture-user","username":"stephen","displayName":"Stephen","role":"admin"}}' }));
  await page.route("**/api/v1/capture-facets", (route) => route.fulfill({ contentType: "application/json", body: '{"categories":[],"topics":[]}' }));
  await page.route("**/api/v1/captures**", (route) => route.fulfill({ contentType: "application/json", body: '{"captures":[],"nextCursor":null}' }));
  await page.route("**/api/v1/events", (route) => route.abort());
  await page.route("**/api/v1/jobs**", (route) => {
    const request = new URL(route.request().url());
    if (request.pathname.endsWith("/retry-failed")) return route.fallback();
    if (request.pathname.endsWith("/jobs/failed")) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ failures: [failedCookie, failedMedia], nextCursor: null, total: 2 }) });
    }
    if (request.pathname.includes("/jobs/") && request.pathname !== "/api/v1/jobs") {
      const id = request.pathname.split("/").pop()!;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({
        job: [failedCookie, failedMedia, activeOld, activeNew, queued, complete, olderComplete].find((item) => item.id === id),
        events: id === "complete" ? [
          ...Array.from({ length: 30 }, (_, index) => ({ id: `history-${index}`, status: "processing", label: "Processing media", message: "Media prepared", createdAt: "2026-09-22T10:00:00.000Z", durationMs: 1000, state: "completed" })),
          { id: "prior-failure", attempt: 1, failureCode: "processing_failed", status: "failed", label: "Capture failed", message: null, createdAt: "2026-09-22T11:00:00.000Z", durationMs: 0, state: "failed" },
          { id: "retry", attempt: 2, status: "queued", label: "Queued", message: "Manual retry requested", createdAt: "2026-09-22T12:00:00.000Z", durationMs: 124, state: "completed" },
          { id: "saved", attempt: 2, status: "complete", label: "Saved", message: "Capture archived", createdAt: "2026-09-22T12:01:00.000Z", durationMs: 0, state: "completed" },
        ] : [
          { id: `${id}-created`, status: "queued", label: "Queued", message: "Capture accepted", createdAt: "2026-09-24T12:00:00.000Z", durationMs: 124, state: "completed" },
          { id: `${id}-media`, status: "processing", label: "Processing media", message: "secret=value /private/internal/cookie.txt", createdAt: "2026-09-24T12:00:08.000Z", durationMs: null, state: "running" },
        ],
      }) });
    }
    const all = [activeOld, activeNew, queued, failedCookie, failedMedia, complete];
    const pageTwo = request.searchParams.get("cursor") === "page-2";
    const filter = request.searchParams.get("filter");
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({
      jobs: pageTwo ? [olderComplete] : filter === "active" ? [activeOld, activeNew, queued] : all,
      nextCursor: filter === "all" && !pageTwo ? "page-2" : null,
      generatedAt: "2026-09-24T12:08:00.000Z",
      counts: { active: 2, queued: 1, failed: 2, savedToday: 12, recentEvents: 19 },
    }) });
  });
  await page.route("**/api/v1/jobs/retry-failed", async (route) => {
    retried.push("failed-cookie", "failed-media");
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ contentType: "application/json", body: '{"requested":2,"retried":2}' });
  });
  await page.route("**/api/v1/jobs/*/retry", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));

  await page.goto("/app");
  const inboxNavigation = await page.locator('.app-nav button[data-tab="inbox"]').boundingBox();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  expect(await page.locator('.app-nav button[data-tab="inbox"]').boundingBox()).toEqual(inboxNavigation);

  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
  await expect(page.locator(".activity-stat")).toHaveCount(4);
  await expect(page.locator(".activity-stat.attention strong")).toHaveText("2");
  await expect(page.locator(".activity-stat.saved strong")).toHaveText("12");
  await expect(page.locator(".activity-row")).toHaveCount(6);
  await expect(page.getByLabel("Filter captures")).toHaveValue("all");
  await expect(page.locator(".activity-row.selected")).toContainText("Newest capture");
  const inspector = page.getByRole("region", { name: "Capture details" });
  await expect(inspector.getByRole("heading", { name: "Newest capture" })).toBeVisible();
  await expect(inspector.locator(".activity-log")).toBeHidden();
  await expect(inspector.locator(".activity-check.active")).not.toContainText("0:01");
  await inspector.getByRole("button", { name: "Show timing and logs", exact: true }).click();
  await expect(inspector.getByRole("button", { name: "Hide timing and logs", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(inspector.locator(".activity-log")).toContainText("Capture accepted");
  await expect(inspector.locator(".activity-log")).not.toContainText("secret=value");
  await expect(inspector.locator(".activity-log")).not.toContainText("/private/internal");
  await expect(inspector.locator(".activity-check.active")).toContainText("Transcribing");
  await expect(inspector.locator(".activity-check.active")).toContainText("0:01");
  await expect(page.locator(".activity-row.selected .activity-tracker-step")).toHaveCount(5);
  await page.screenshot({ path: "test-results/activity-04-desktop.png" });

  await page.locator(".activity-row").filter({ hasText: "Earlier capture" }).click();
  await expect(page.locator(".activity-row.selected")).toHaveCount(1);
  await expect(page.locator(".activity-row.selected")).toContainText("Earlier capture");
  await expect(inspector.getByRole("heading", { name: "Earlier capture" })).toBeVisible();
  await expect(page.locator(".activity-row.selected")).toHaveCSS("outline-style", "none");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".activity-row.selected")).toHaveCSS("outline-style", "solid");
  await page.locator(".activity-row").filter({ hasText: "Newest capture" }).click();
  await page.getByRole("button", { name: "Copy safe logs" }).click();
  await expect(inspector.getByRole("status")).toContainText("Safe logs copied.");
  const copiedSafeLogs = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedSafeLogs).toContain("Capture accepted");
  expect(copiedSafeLogs).not.toContain("secret=value");
  expect(copiedSafeLogs).not.toContain("/private/internal");

  const attention = page.locator(".activity-attention-item");
  await expect(attention).toHaveCount(2);
  await expect(page.locator(".activity-attention")).toContainText("2 captures need a decision from you");
  await expect(attention.first()).toContainText("Instagram session expired");
  await expect(attention.first()).toContainText("Reconnect account");
  await expect(attention.first()).not.toContainText(/failed at|attempt 3/);
  await expect(attention.getByRole("button", { name: "Reconnect Instagram", exact: true })).toHaveCount(1);
  await expect(attention.getByRole("button", { name: /^Retry / })).toHaveCount(2);
  await attention.first().locator(".activity-attention-copy").click();
  await expect(inspector.getByText("Download attempts this run: 2", { exact: true })).toBeVisible();
  await expect(page.locator(".activity-row").filter({ hasText: "Reconnect account" })).not.toContainText("Instagram session expired");
  await attention.nth(1).locator(".activity-attention-copy").click();
  await expect(inspector).toContainText("The post downloaded, but its video or audio could not be processed.");

  // Type follows the reader's browser text size.
  await page.evaluate(() => { document.documentElement.style.fontSize = "20px"; });
  await expect(page.locator(".activity-header h1")).toHaveCSS("font-size", "35px");
  await expect(page.locator(".activity-attention-copy span").first()).toHaveCSS("font-size", "15px");
  for (const width of [1440, 1024, 720, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Retry all failed" })).toBeVisible();
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.locator(".activity-row").filter({ hasText: "Saved capture" }).click();
  await expect(inspector.locator(".activity-log")).toContainText("Saved");
  await expect(inspector.locator(".activity-log")).toContainText("Capture archived");
  await expect(inspector.locator(".activity-log")).toContainText("Includes previous attempts");
  const logEntries = page.getByLabel("Processing log entries");
  expect(await logEntries.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await logEntries.focus();
  await page.keyboard.press("End");
  await expect.poll(() => logEntries.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(inspector.locator(".activity-log li.failed")).toHaveCount(1);
  await expect(inspector.locator(".activity-log")).toContainText("The post downloaded, but its video or audio could not be processed.");
  await expect(inspector.locator(".activity-log")).toContainText("attempt 2");
  await expect(inspector.locator(".activity-log")).toContainText("Manual retry requested");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Copy safe logs" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Saved");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Attempt 2");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Manual retry requested");

  await page.getByLabel("Filter captures").selectOption("active");
  await expect(page.locator(".activity-row")).toHaveCount(3);
  await page.getByLabel("Filter captures").selectOption("all");
  await expect(page.locator(".activity-row")).toHaveCount(6);
  await page.locator(".activity-row").filter({ hasText: "Newest capture" }).click();
  await page.getByRole("button", { name: "Load more captures" }).click();
  await expect(page.locator(".activity-row")).toHaveCount(7);
  await page.getByRole("button", { name: "Retry all failed" }).click();
  await expect(page.getByRole("button", { name: "Retrying…" }).first()).toBeDisabled();
  await expect.poll(() => retried.sort()).toEqual(["failed-cookie", "failed-media"]);
  await expect(page.locator(".activity-feedback")).toContainText("2 captures re-queued.");

  await page.locator(".app-account-trigger").click();
  const accountMenu = page.getByRole("dialog");
  await expect(accountMenu.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(accountMenu.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
  await page.locator(".app-account-menu-layer").click({ position: { x: 500, y: 300 } });
  await expect(accountMenu).toHaveCount(0);
  await page.locator(".app-profile-settings").click();
  await expect(page.getByRole("heading", { level: 1, name: "My account" })).toBeVisible();
  await page.getByRole("button", { name: "Back to archive" }).click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.setViewportSize({ width: 900, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".activity-row.selected strong")).toHaveText("Newest capture");
  await expect(page.locator(".activity-row.selected strong")).toBeVisible();
  await expect(page.getByLabel("Stages")).toContainText("Transcribing");
  await page.screenshot({ path: "test-results/activity-04d-mobile.png", fullPage: true });
  await page.locator(".app-menu-trigger").click();
  await expect(page.locator(".app-sidebar").getByRole("button", { name: "Open Settings" })).toBeVisible();
  await expect(page.locator(".app-sidebar .app-processing")).toBeVisible();
  await page.getByRole("button", { name: "Close menu" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.route(/\/api\/v1\/jobs\/failed\?/, (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.reload();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.locator(".activity-attention")).toContainText("2 captures need a decision from you");
  await expect(page.getByRole("button", { name: "Retry all failed" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Retry list" })).toBeVisible();
});


test("unsupported URL bookmarks stay visible without misleading retry or platform labels", async ({ page }) => {
  const bookmark = { ...job("bookmark", "failed", "2026-10-03T12:00:00.000Z", { errorCode: "unsupported_platform" }), normalizedUrl: "https://www.tiktok.com/@example/video/123", displayTitle: null };
  await page.route("**/api/auth/me", (route) => route.fulfill({ contentType: "application/json", body: '{"user":{"id":"fixture-user","username":"stephen","displayName":"Stephen","role":"admin"}}' }));
  await page.route("**/api/v1/capture-facets", (route) => route.fulfill({ contentType: "application/json", body: '{"categories":[],"topics":[]}' }));
  await page.route("**/api/v1/captures**", (route) => route.fulfill({ contentType: "application/json", body: '{"captures":[],"nextCursor":null}' }));
  await page.route("**/api/v1/events", (route) => route.abort());
  await page.route("**/api/v1/jobs**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname.endsWith("/failed") ? { failures: [bookmark], nextCursor: null, total: 1 }
      : pathname.endsWith("/bookmark") ? { job: bookmark, events: [] }
      : { jobs: [bookmark], nextCursor: null, generatedAt: "2026-10-03T12:01:00.000Z", counts: { active: 0, queued: 0, failed: 1, savedToday: 0, recentEvents: 1 } };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const attention = page.locator(".activity-attention-item");
  await expect(attention).toHaveCount(1);
  await expect(attention).toContainText("tiktok.com/@example/video/123");
  await expect(attention).toContainText("URL saved; platform not supported");
  await expect(attention).not.toContainText("Facebook");
  await expect(attention.getByRole("button", { name: /^Retry / })).toHaveCount(0);
  await expect(attention.getByRole("button", { name: /^Reconnect / })).toHaveCount(0);
  await expect(page.locator(".activity-row")).toContainText("Bookmark");
  await expect(page.locator(".activity-row")).not.toContainText("Failed at Added");
  await expect(page.locator(".activity-row")).toContainText("www.tiktok.com");
  await expect(page.getByRole("region", { name: "Capture details" })).toContainText("Your URL is retained here");
});
