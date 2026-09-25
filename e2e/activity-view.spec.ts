import { expect, test } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

test.skip(
  !username || !password,
  "Set E2E_USERNAME and E2E_PASSWORD for authenticated browser tests",
);

test("groups live jobs and keeps failure details and retry usable", async ({
  page,
}) => {
  const jobs = [
    {
      id: "failed-job",
      status: "failed",
      normalizedUrl: "https://www.instagram.com/reel/failed/",
      displayTitle: "Weekend reading",
      attempts: 1,
      error: null,
      errorCode: "private_post",
      errorDetail: null,
      resultNotePath: null,
      createdAt: "2026-09-24T12:00:00.000Z",
      updatedAt: "2026-09-24T12:01:00.000Z",
    },
    {
      id: "active-job",
      status: "downloading",
      normalizedUrl: "https://www.instagram.com/reel/active/",
      displayTitle: "One good question",
      attempts: 1,
      error: null,
      errorCode: null,
      errorDetail: null,
      resultNotePath: null,
      createdAt: "2026-09-24T12:00:00.000Z",
      updatedAt: "2026-09-24T12:01:00.000Z",
    },
    {
      id: "complete-job",
      status: "complete",
      normalizedUrl: "https://www.facebook.com/complete/",
      displayTitle: "Organize references",
      attempts: 1,
      error: null,
      errorCode: null,
      errorDetail: null,
      resultNotePath: "/private/internal-note.md",
      createdAt: "2026-09-22T12:00:00.000Z",
      updatedAt: "2026-09-22T12:01:00.000Z",
    },
  ];
  let retried = false;
  await page.route("**/api/v1/jobs?limit=100", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ jobs }),
    });
  });
  await page.route("**/api/v1/jobs/failed-job", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        job: jobs[0],
        events: [
          {
            id: "failed-event",
            status: "failed",
            message: "Post unavailable",
            createdAt: "2026-09-24T12:01:00.000Z",
          },
        ],
      }),
    });
  });
  await page.route("**/api/v1/jobs/failed-job/retry", async (route) => {
    retried = true;
    await route.fulfill({ contentType: "application/json", body: "{}" });
  });

  await page.goto("/");
  await page.getByLabel("Username").fill(username!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.locator(".activity-group")).toHaveCount(3);
  await expect(page.locator(".activity-card")).toHaveCount(3);
  await expect(page.getByText("The post is private")).toBeVisible();
  await page
    .locator(".activity-card")
    .first()
    .getByRole("button", { name: "Technical details" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Processing details" });
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText("/private/internal-note.md");
  await page.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => retried).toBe(true);
  await expect(page.getByRole("status")).toContainText(
    "Capture re-queued successfully.",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
});
