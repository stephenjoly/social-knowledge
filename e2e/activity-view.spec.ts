import { expect, test } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

test.skip(
  !username || !password,
  "Set E2E_USERNAME and E2E_PASSWORD for authenticated browser tests",
);

test("Activity expands one safe inline log and retries every failure", async ({ page }) => {
  const jobs = [
    { id: "failed-cookie", status: "failed", errorCode: "authentication_required", displayTitle: "Reconnect account", createdAt: "2026-09-24T12:00:00.000Z", updatedAt: "2026-09-24T12:01:00.000Z" },
    { id: "failed-media", status: "failed", errorCode: "processing_failed", displayTitle: "Media issue", createdAt: "2026-09-24T12:02:00.000Z", updatedAt: "2026-09-24T12:03:00.000Z" },
    { id: "active-old", status: "downloading", errorCode: null, displayTitle: "Earlier capture", createdAt: "2026-09-24T12:04:00.000Z", updatedAt: "2026-09-24T12:05:00.000Z" },
    { id: "active-new", status: "processing", errorCode: null, displayTitle: "Newest capture", createdAt: "2026-09-24T12:06:00.000Z", updatedAt: "2026-09-24T12:07:00.000Z" },
    { id: "complete", status: "complete", errorCode: null, displayTitle: "Saved capture", createdAt: "2026-09-22T12:00:00.000Z", updatedAt: "2026-09-22T12:01:00.000Z" },
  ].map((job) => ({ ...job, normalizedUrl: `https://www.instagram.com/reel/${job.id}/`, attempts: 1, error: null, errorDetail: null, resultNotePath: null, reachedStages: ["queued", job.status], stageDurations: { queued: 1, [job.status]: 8 } }));
  const retried: string[] = [];
  await page.route("**/api/v1/jobs?limit=100", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ jobs }) }));
  await page.route(/\/api\/v1\/jobs\/[^/?]+$/, (route) => {
    const id = route.request().url().split("/").pop()!;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({
      job: jobs.find((job) => job.id === id),
      events: [
        { id: `${id}-queued`, status: "queued", message: "Capture accepted", createdAt: "2026-09-24T12:00:00.000Z" },
        { id: `${id}-active`, status: "processing", message: "secret=value /private/internal/cookie.txt", createdAt: "2026-09-24T12:00:08.000Z" },
      ],
    }) });
  });
  await page.route("**/api/v1/jobs/retry-failed", async (route) => {
    retried.push("failed-cookie", "failed-media");
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ contentType: "application/json", body: '{"retried":2}' });
  });

  await page.goto("/");
  await page.getByLabel("Username").fill(username!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByRole("button", { name: /Active 2/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".activity-card")).toHaveCount(2);
  await expect(page.locator(".activity-card.expanded")).toContainText("Newest capture");
  await expect(page.locator(".activity-inline-log")).toContainText("8s");
  await expect(page.locator(".activity-inline-log")).not.toContainText("secret=value");
  await expect(page.locator(".activity-inline-log")).not.toContainText("/private/internal");
  await expect(page.locator(".activity-stage").first()).toHaveAttribute("title", /1s/);
  await page.getByRole("button", { name: /Earlier capture/ }).click();
  await expect(page.locator(".activity-card.expanded")).toContainText("Earlier capture");
  await expect(page.locator(".activity-inline-log")).toHaveCount(1);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator(".activity-card")).toHaveCount(5);
  await expect(page.locator(".activity-attention-item").first()).toContainText("Reconnect account");
  await page.getByRole("button", { name: "Retry all" }).click();
  await expect(page.getByRole("button", { name: "Retrying…" }).first()).toBeDisabled();
  await expect.poll(() => retried.sort()).toEqual(["failed-cookie", "failed-media"]);
  await expect(page.getByRole("status")).toContainText("2 captures re-queued.");
  await page.locator(".app-account-trigger").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close account menu" }).click();
  await page.locator(".app-profile-settings").click();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".app-menu-trigger").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
