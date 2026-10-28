import { expect, test } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

test.skip(
  !username || !password,
  "Set E2E_USERNAME and E2E_PASSWORD for authenticated browser tests",
);

test("keeps invalid links in the capture dialog and confirms submission", async ({
  page,
}) => {
  let submissions = 0;
  await page.route("**/api/v1/jobs", async (route) => {
    submissions += 1;
    if (submissions === 1) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_url" }),
      });
      return;
    }
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        created: true,
        job: { id: "synthetic-job", status: "queued" },
      }),
    });
  });

  await page.goto("/app");
  await page.getByLabel("Username").fill(username!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Continue" }).click();
  const trigger = page.getByRole("button", { name: "Capture a post" });
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Capture a post" });
  await expect(dialog.getByLabel("Post link")).toBeFocused();
  await dialog.getByLabel("Post link").fill("https://example.com/post");
  await dialog.getByRole("button", { name: "Save to archive" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Enter a valid Facebook or Instagram post URL.",
  );
  await dialog
    .getByLabel("Post link")
    .fill("https://www.instagram.com/reel/synthetic/");
  await expect(dialog.getByText("Instagram reel detected")).toBeVisible();
  await dialog.getByRole("button", { name: "Save to archive" }).click();
  await expect(
    page.getByRole("dialog", { name: "Post queued" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Queued for processing",
  );
  expect(submissions).toBe(2);
  await page.getByRole("button", { name: "View progress", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
});
