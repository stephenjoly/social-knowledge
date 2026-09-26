import { expect, test } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

test.skip(
  !username || !password,
  "Set E2E_USERNAME and E2E_PASSWORD for authenticated browser tests",
);

test("restores page and dialog navigation with browser history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByLabel("Username").fill(username!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page).toHaveURL(/tab=activity/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Inbox", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();

  await page.getByRole("button", { name: "Capture a post" }).click();
  await expect(page).toHaveURL(/tab=capture/);
  await page.getByRole("button", { name: "Close capture" }).click();
  await expect(
    page.getByRole("heading", { name: "Inbox", exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/tab=capture/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  const baseline = await page.locator(".shell").boundingBox();
  const navBaseline = await page.locator('.app-nav button[data-tab="inbox"]').boundingBox();
  for (const name of ["Knowledge base", "Ask", "Inbox", "Activity"]) {
    await page.getByRole("button", { name, exact: true }).click();
    const geometry = await page.locator(".shell").boundingBox();
    expect(geometry?.x).toBe(baseline?.x);
    expect(geometry?.width).toBe(baseline?.width);
    expect(await page.locator('.app-nav button[data-tab="inbox"]').boundingBox()).toEqual(navBaseline);
  }
});
