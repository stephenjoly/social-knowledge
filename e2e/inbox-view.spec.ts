import { expect, test } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

test.skip(
  !username || !password,
  "Set E2E_USERNAME and E2E_PASSWORD for authenticated browser tests",
);

const captures = [
  {
    id: "a5d8bc45-0803-4e1d-a5c8-84ef23415d38",
    jobId: "c04cedd8-c8cf-4e32-b28d-6e0c36c8a4dc",
    title: "Weekend reading: creative routines",
    creator: "Maya Torres",
    platform: "instagram",
    sourceType: "reel",
    sourceUrl: "https://www.instagram.com/reel/example-one",
    synopsis: "A short reel on making space for a small creative habit.",
    topics: ["Creative practice"],
    createdAt: "2026-09-24T12:00:00.000Z",
    description: null,
    transcript: "",
    sourceLanguage: null,
    translatedTranscript: null,
    translationLanguage: null,
    comments: [],
    whyUseful: null,
    analysis: {
      recommendations: [],
      entities: [],
      evidence: [],
      claimsNeedingVerification: [],
    },
    assets: [],
    notePath: "",
  },
  {
    id: "b67853bb-b28f-46de-8cde-a30eb7182c17",
    jobId: "594d68a2-a6b6-4abb-840f-2436c86f48e3",
    title: "A simple way to organize references",
    creator: "The Design Archive",
    platform: "facebook",
    sourceType: "post",
    sourceUrl: "https://www.facebook.com/example-two",
    synopsis:
      "Practical ideas for collecting visual references without clutter.",
    topics: ["Organization"],
    createdAt: "2026-09-22T12:00:00.000Z",
    description: null,
    transcript: "",
    sourceLanguage: null,
    translatedTranscript: null,
    translationLanguage: null,
    comments: [],
    whyUseful: null,
    analysis: {
      recommendations: [],
      entities: [],
      evidence: [],
      claimsNeedingVerification: [],
    },
    assets: [],
    notePath: "",
  },
];

test("switches real Inbox controls over a sorted capture response", async ({
  page,
}) => {
  const captureQueries: URL[] = [];
  await page.route("**/api/v1/inbox-analytics", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        totalCaptures: captures.length,
        capturesLast24Hours: 1,
        capturesLast7Days: captures.length,
        failedImports: 0,
        generatedAt: "2026-09-24T12:00:00.000Z",
      }),
    });
  });
  await page.route("**/api/v1/captures?**", async (route) => {
    captureQueries.push(new URL(route.request().url()));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ captures, nextCursor: null }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Username").fill(username!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.locator(".inbox-tile")).toHaveCount(2);
  await expect(
    page.getByRole("group", { name: "Past 7 days: 2" }),
  ).toBeVisible();

  await page.getByLabel("Sort captures").selectOption("title:asc");
  await expect
    .poll(() =>
      captureQueries.some(
        (query) =>
          query.searchParams.get("sort") === "title" &&
          query.searchParams.get("direction") === "asc",
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Table" }).click();
  await expect(page.locator(".inbox-capture-table")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Title/ })).toBeVisible();

  await page.getByRole("button", { name: "+ Add filter" }).click();
  await page.getByLabel("Platform").selectOption("instagram");
  await page.getByRole("button", { name: "Close filters" }).click();
  await expect(
    page.getByRole("button", { name: /Platform: Instagram/ }),
  ).toBeVisible();
  await expect
    .poll(() =>
      captureQueries.some(
        (query) => query.searchParams.get("platform") === "instagram",
      ),
    )
    .toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".inbox-mobile-row").first()).toBeVisible();
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
