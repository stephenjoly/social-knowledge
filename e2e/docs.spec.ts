import { expect, test } from "@playwright/test";

test("homepage Docs entry opens the public reader and all guides resolve", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Page sections" })
    .getByRole("link", { name: "Docs", exact: true })
    .click();
  await expect(page).toHaveURL(/\/docs\/$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Overview" }),
  ).toBeVisible();
  const navigation = page.getByRole("navigation", {
    name: "Documentation",
    exact: true,
  });
  const links = await navigation
    .getByRole("link")
    .evaluateAll((items) =>
      items.map((item) => (item as HTMLAnchorElement).pathname),
    );
  expect(links).toHaveLength(9);
  for (const href of links) {
    const response = await request.get(href);
    expect(response.status(), href).toBe(200);
    const html = await response.text();
    expect(html.match(/<h1\b/g), href).toHaveLength(1);
    expect(html, href).not.toContain("__PUBLIC_ORIGIN__");
  }
  await navigation
    .getByRole("link", { name: "Getting started", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Getting started" }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Getting started", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const privatePage = await request.get("/app", { maxRedirects: 0 });
  expect(privatePage.status()).toBe(302);
  expect(privatePage.headers().location).toMatch(/^\/login\?/);
});

test("local search supports keyboard entry, results, and heading navigation", async ({
  page,
}) => {
  await page.goto("/docs/");
  await page.keyboard.press("ControlOrMeta+k");
  const search = page.getByRole("searchbox", { name: "Search documentation" });
  await expect(search).toBeFocused();
  await search.fill("MCP");
  const results = page.locator("[data-docs-results]");
  await expect(
    results.getByRole("link", { name: /API and MCP/ }),
  ).toBeVisible();
  await search.press("ArrowDown");
  await expect(results.getByRole("link").first()).toBeFocused();
  await results.getByRole("link", { name: /API and MCP/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "API and MCP" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "On this page" })
    .getByRole("link", { name: "API", exact: true })
    .click();
  await expect(page).toHaveURL(/#api$/);
  await expect(
    page.getByRole("heading", { name: "API", exact: true }),
  ).toBeInViewport();
});

test("search explains empty and unavailable results", async ({ page }) => {
  await page.goto("/docs/");
  const search = page.getByRole("searchbox", { name: "Search documentation" });
  await search.fill("nonexistent-zqxw-guide");
  await expect(page.locator("[data-docs-search-status]")).toHaveText(
    "No matching documentation.",
  );
  await expect(page.locator("[data-docs-results]")).toBeHidden();
  await page.route("**/docs/search-index.json", (route) => route.abort());
  await page.reload();
  await search.fill("MCP");
  await expect(page.locator("[data-docs-search-status]")).toHaveText(
    "Search unavailable. Browse the navigation links.",
  );
  await page
    .getByRole("navigation", { name: "Documentation", exact: true })
    .getByRole("link", { name: "Security", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Security" }),
  ).toBeVisible();
});

test("theme follows system and preserves an explicit reader choice", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/docs/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("phone entry, menu, article and code blocks fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Page sections" })
    .getByRole("link", { name: "Docs", exact: true })
    .click();
  const menu = page.locator("[data-docs-menu]");
  const navigation = page.getByRole("navigation", {
    name: "Documentation",
    exact: true,
  });
  await expect(navigation).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(navigation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  await menu.click();
  await navigation
    .getByRole("link", { name: "Getting started", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Getting started" }),
  ).toBeVisible();
  await expect(navigation).toBeHidden();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const href of [
      "/docs/getting-started/",
      "/docs/api-and-mcp/",
      "/docs/self-hosting/",
    ]) {
      await page.goto(href);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${href} at ${width}px`,
      ).toBe(true);
    }
    await page.goto("/");
    await expect(
      page
        .getByRole("navigation", { name: "Page sections" })
        .getByRole("link", { name: "Docs", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `homepage at ${width}px`,
    ).toBe(true);
  }
});
