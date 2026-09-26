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
  attempts: options.attempts ?? 1,
  errorCode: options.errorCode ?? null,
  createdAt,
  updatedAt: createdAt,
  reachedStages: [options.stage ?? "added"],
  stages: stages(options.stage ?? "added", status === "failed"),
});

test("Activity uses safe inline logs, complete failure counts, and compact account controls", async ({ page, context }) => {
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
  const complete = job("complete", "complete", "2026-09-22T12:01:00.000Z", { title: "Saved capture", stage: "saved" });
  const olderComplete = job("older-complete", "complete", "2026-09-20T12:01:00.000Z", { title: "Older saved capture", stage: "saved" });
  const retried: string[] = [];

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/auth/me", (route) => route.fulfill({ contentType: "application/json", body: '{"user":{"id":"fixture-user","username":"Stephen","role":"admin"}}' }));
  await page.route("**/api/v1/capture-facets", (route) => route.fulfill({ contentType: "application/json", body: '{"categories":[],"topics":[]}' }));
  await page.route("**/api/v1/captures**", (route) => route.fulfill({ contentType: "application/json", body: '{"captures":[],"nextCursor":null}' }));
  await page.route("**/api/v1/inbox-analytics", (route) => route.fulfill({ contentType: "application/json", body: '{"totalCaptures":0,"capturesLast24Hours":0,"capturesLast7Days":0,"failedImports":0,"generatedAt":"2026-09-24T12:08:00.000Z"}' }));
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
        events: [
          { id: `${id}-created`, status: "queued", label: "Capture accepted", message: "URL accepted and queued", createdAt: "2026-09-24T12:00:00.000Z", durationMs: 124, state: "completed" },
          { id: `${id}-media`, status: "processing", label: "Media download", message: "secret=value /private/internal/cookie.txt", createdAt: "2026-09-24T12:00:08.000Z", durationMs: null, state: "running" },
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

  await page.goto("/");
  await page.getByRole("button", { name: "Activity", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Capture activity" })).toBeVisible();
  await expect(page.locator(".activity-kpi")).toHaveCount(4);
  await expect(page.locator(".activity-card")).toHaveCount(3);
  await expect(page.locator(".activity-card.expanded")).toContainText("Newest capture");
  await expect(page.locator(".activity-inline-log")).toContainText("URL accepted and queued");
  await expect(page.locator(".activity-inline-log")).not.toContainText("secret=value");
  await expect(page.locator(".activity-inline-log")).not.toContainText("/private/internal");
  await expect(page.locator(".activity-card.expanded .activity-stage").filter({ hasText: "Text" })).toHaveAttribute("title", /running/);
  await page.screenshot({ path: "test-results/activity-04d-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Copy logs" }).click();
  await expect(page.getByRole("status")).toContainText("Safe logs copied.");
  await expect(page.locator(".activity-attention-item")).toHaveCount(2);
  await expect(page.locator(".activity-attention")).toContainText("Highest priority first");

  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator(".activity-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Load more captures" }).click();
  await expect(page.locator(".activity-card")).toHaveCount(7);
  await page.getByRole("button", { name: "Retry all" }).click();
  await expect(page.getByRole("button", { name: "Retrying…" }).first()).toBeDisabled();
  await expect.poll(() => retried.sort()).toEqual(["failed-cookie", "failed-media"]);
  await expect(page.locator(".activity-feedback")).toContainText("2 captures re-queued.");

  await page.locator(".app-account-trigger").click();
  const accountMenu = page.getByRole("dialog");
  await expect(accountMenu.getByRole("button", { name: "Profile" })).toBeVisible();
  await expect(accountMenu.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect(accountMenu.getByRole("button", { name: "Log out" })).toBeVisible();
  await page.locator(".app-account-menu-layer").click({ position: { x: 500, y: 300 } });
  await expect(accountMenu).toHaveCount(0);
  await expect(page.locator('.app-sidebar .app-nav button[data-tab="settings"]')).toBeHidden();
  await page.locator(".app-profile-settings").click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".activity-card.expanded .activity-row-copy strong")).toHaveText("Newest capture");
  await expect(page.locator(".activity-card.expanded .activity-row-copy strong")).toBeVisible();
  await expect(page.getByLabel("Stage durations")).toContainText("Text running");
  await expect(page.locator('.app-nav button[data-tab="settings"]')).toBeVisible();
  await page.locator(".app-menu-trigger").click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/activity-04d-mobile.png", fullPage: true });
});
