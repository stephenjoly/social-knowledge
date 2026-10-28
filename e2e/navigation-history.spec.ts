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
  await page.route("**/api/v1/conversations", async (route) => {
    await route.fulfill({
      json: {
        conversations: ["Synthetic leadership notes", "Synthetic travel plans"].map((title, index) => ({
          id: `navigation-search-${index}`,
          title,
          pinnedAt: null,
          selection: null,
          createdAt: "2026-10-23T12:00:00.000Z",
          updatedAt: "2026-10-23T12:00:00.000Z",
        })),
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
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
  await expect(page).toHaveURL(/tab=activity&capture=1/);
  await expect(page.getByRole("dialog", { name: "Capture a post" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "Capture a post" })).toHaveCount(0);
  await page.goForward();
  await page.getByRole("button", { name: "Close capture" }).click();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page).not.toHaveURL(/capture=1/);
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  const baseline = await page.locator(".shell").boundingBox();
  const navBaseline = await page.locator('.app-nav button[data-tab="inbox"]').boundingBox();
  for (const name of ["Knowledge base", "New chat", "Inbox", "Activity"]) {
    await page.getByRole("button", { name, exact: true }).click();
    const geometry = await page.locator(".shell").boundingBox();
    expect(geometry?.x).toBe(baseline?.x);
    expect(geometry?.width).toBe(baseline?.width);
    expect(await page.locator('.app-nav button[data-tab="inbox"]').boundingBox()).toEqual(navBaseline);
  }

  for (const [key, heading] of [
    ["i", "Inbox"], ["a", "Activity"], ["k", "Knowledge base"],
    ["q", "What do you want to find?"],
  ]) {
    await page.keyboard.press("g");
    await page.keyboard.press(key!);
    await expect(page.getByRole("heading", { level: 1, name: heading!, exact: true })).toBeVisible();
  }
  const question = page.getByLabel("Ask your archive");
  await question.fill("gi");
  await expect(page).toHaveURL(/tab=ask/);

  await page.getByRole("button", { name: "Hide sidebar", exact: true }).click();
  const showSidebar = page.getByRole("button", { name: "Show sidebar", exact: true });
  await expect(showSidebar).toHaveAttribute("aria-expanded", "false");
  await question.focus();
  await page.keyboard.press("/");
  await expect(question).toHaveValue("gi/");
  await expect(question).toBeFocused();
  await expect(showSidebar).toBeVisible();

  await page.getByRole("heading", { level: 1, name: "What do you want to find?", exact: true }).click();
  await page.keyboard.press("/");
  const chatSearch = page.getByRole("searchbox", { name: "Search chats by title" });
  await expect(showSidebar).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hide sidebar", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(chatSearch).toBeFocused();
  await page.keyboard.type("leadership");
  const chats = page.getByRole("navigation", { name: "Chats", exact: true });
  await expect(chats.getByRole("button", { name: "Synthetic leadership notes", exact: true })).toBeVisible();
  await expect(chats.getByRole("button", { name: "Synthetic travel plans", exact: true })).toHaveCount(0);

  await page.getByRole("heading", { level: 1, name: "What do you want to find?", exact: true }).click();
  await page.keyboard.press("/");
  await expect(chatSearch).toBeFocused();
  await page.keyboard.type("travel");
  await expect(chatSearch).toHaveValue("travel");
  await expect(chats.getByRole("button", { name: "Synthetic travel plans", exact: true })).toBeVisible();
  await expect(chats.getByRole("button", { name: "Synthetic leadership notes", exact: true })).toHaveCount(0);

  // A normal remount must not replay the already-consumed search request.
  await page.getByRole("button", { name: "Hide sidebar", exact: true }).click();
  await showSidebar.click();
  await expect(page.getByRole("button", { name: "Hide sidebar", exact: true })).toBeFocused();
  await expect(chatSearch).not.toBeFocused();

  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Go to", exact: true });
  const search = palette.getByRole("combobox");
  await expect(search).toBeFocused();
  await search.fill("Knowledge");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(palette).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "Knowledge base", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { level: 1, name: "Knowledge base", exact: true }).click();
  await page.keyboard.press("/");
  await expect(page.getByRole("button", { name: "Open menu", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(chatSearch).toBeFocused();
  await page.getByRole("button", { name: "Close menu", exact: true }).click();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Open Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "My account" })).toBeVisible();
  for (const name of ["AI & models", "Connections", "API keys", "Data & export", "My account"]) {
    await page.getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: name === "Connections" ? /^Connections/ : name, exact: name !== "Connections" }).click();
    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Close Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Knowledge base", exact: true })).toBeVisible();
});
