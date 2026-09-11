import { expect, test, type Page } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

test.skip(
  !username || !password,
  "Set E2E_USERNAME and E2E_PASSWORD for authenticated browser tests",
);

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill(username!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "inbox" })).toBeVisible();
}

test("shows account-wide analytics independently from filters and at mobile width", async ({
  page,
}) => {
  await signIn(page);
  const cards = page.locator(".analytics-card:not(.analytics-skeleton)");
  await expect(cards).toHaveCount(3);
  await expect(
    page.getByRole("group", { name: /Total captures:/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: /Saved in 24 hours:/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: /Failed imports:/ }),
  ).toBeVisible();
  await expect(page.locator(".capture-count-context")).toContainText(
    /captures loaded/,
  );
  const initialValues = await cards.locator("strong").allTextContents();

  const travelFilter = page
    .locator(".filter-group", { hasText: "Categories" })
    .getByRole("button", { name: /Travel/ });
  if (await travelFilter.count()) {
    await travelFilter.click();
    await expect(travelFilter).toHaveAttribute("aria-pressed", "true");
    expect(await cards.locator("strong").allTextContents()).toEqual(
      initialValues,
    );
  }

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
  await expect(cards).toHaveCount(3);
});

test("ignores an older analytics response that finishes last", async ({
  page,
}) => {
  let analyticsCalls = 0;
  let staleResponseSent = false;
  let releaseStale!: () => void;
  const staleResponse = new Promise<void>((resolve) => {
    releaseStale = resolve;
  });
  await page.addInitScript(() => {
    class TestEventSource extends EventTarget {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      constructor() {
        super();
        (
          window as unknown as { testEventSource: TestEventSource }
        ).testEventSource = this;
      }
      close() {}
      emit(data: string) {
        this.onmessage?.(new MessageEvent("message", { data }));
      }
    }
    Object.defineProperty(window, "EventSource", {
      configurable: true,
      value: TestEventSource,
    });
  });
  await page.route("**/api/v1/inbox-analytics", async (route) => {
    analyticsCalls += 1;
    if (analyticsCalls === 2) {
      await staleResponse;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          totalCaptures: 11,
          capturesLast24Hours: 2,
          failedImports: 1,
          generatedAt: "2026-09-10T11:59:00.000Z",
        }),
      });
      staleResponseSent = true;
      return;
    }
    const latest = analyticsCalls > 2;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        totalCaptures: latest ? 13 : 12,
        capturesLast24Hours: latest ? 4 : 3,
        failedImports: latest ? 0 : 1,
        generatedAt: latest
          ? "2026-09-10T12:01:00.000Z"
          : "2026-09-10T12:00:00.000Z",
      }),
    });
  });

  await signIn(page);
  await expect(
    page.getByRole("group", { name: "Total captures: 12" }),
  ).toBeVisible();
  const emitCaptureEvent = () =>
    page.evaluate(() => {
      const source = (
        window as unknown as {
          testEventSource: { emit: (data: string) => void };
        }
      ).testEventSource;
      source.emit(
        JSON.stringify({ type: "capture", payload: { status: "complete" } }),
      );
    });

  await emitCaptureEvent();
  await expect.poll(() => analyticsCalls).toBe(2);
  await emitCaptureEvent();
  await expect.poll(() => analyticsCalls).toBe(3);
  await expect(
    page.getByRole("group", { name: "Total captures: 13" }),
  ).toBeVisible();

  releaseStale();
  await expect.poll(() => staleResponseSent).toBe(true);
  await page.waitForTimeout(100);
  await expect(
    page.getByRole("group", { name: "Total captures: 13" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Total captures: 11" }),
  ).toHaveCount(0);
});

test("keeps last values on refresh failure and coalesces live refreshes", async ({
  page,
}) => {
  let analyticsCalls = 0;
  let dashboardCalls = 0;
  page.on("request", (request) => {
    if (/\/api\/v1\/(captures|jobs|capture-facets)(?:\?|$)/.test(request.url()))
      dashboardCalls += 1;
  });
  let releaseInitial!: () => void;
  const initialResponse = new Promise<void>((resolve) => {
    releaseInitial = resolve;
  });
  await page.addInitScript(() => {
    class TestEventSource extends EventTarget {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      constructor() {
        super();
        (
          window as unknown as { testEventSource: TestEventSource }
        ).testEventSource = this;
      }
      close() {}
      emit(data: string) {
        this.onmessage?.(new MessageEvent("message", { data }));
      }
    }
    Object.defineProperty(window, "EventSource", {
      configurable: true,
      value: TestEventSource,
    });
  });
  await page.route("**/api/v1/inbox-analytics", async (route) => {
    analyticsCalls += 1;
    if (analyticsCalls === 1) {
      await initialResponse;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          totalCaptures: 12,
          capturesLast24Hours: 3,
          failedImports: 1,
          generatedAt: "2026-09-10T12:00:00.000Z",
        }),
      });
      return;
    }
    if (analyticsCalls === 2) {
      await route.abort();
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        totalCaptures: 13,
        capturesLast24Hours: 4,
        failedImports: 0,
        generatedAt: "2026-09-10T12:01:00.000Z",
      }),
    });
  });

  await signIn(page);
  await expect(page.locator(".analytics-skeleton")).toHaveCount(3);
  releaseInitial();
  await expect(
    page.getByRole("group", { name: "Total captures: 12" }),
  ).toBeVisible();

  await page.evaluate(() => {
    const source = (
      window as unknown as {
        testEventSource: { emit: (data: string) => void };
      }
    ).testEventSource;
    source.emit(
      JSON.stringify({ type: "capture", payload: { status: "complete" } }),
    );
  });
  await expect.poll(() => analyticsCalls).toBe(2);
  await expect(page.getByText("Summary temporarily stale.")).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Total captures: 12" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByRole("group", { name: "Total captures: 13" }),
  ).toBeVisible();
  await expect(page.getByText("Summary temporarily stale.")).toHaveCount(0);

  const dashboardCallsBeforeBurst = dashboardCalls;
  await page.evaluate(() => {
    const source = (
      window as unknown as {
        testEventSource: { emit: (data: string) => void };
      }
    ).testEventSource;
    for (let index = 0; index < 8; index += 1)
      source.emit(
        JSON.stringify({ type: "capture", payload: { status: "complete" } }),
      );
  });
  await expect.poll(() => analyticsCalls).toBe(4);
  await expect.poll(() => dashboardCalls - dashboardCallsBeforeBurst).toBe(3);
  await expect(
    page.getByRole("group", { name: "Total captures: 13" }),
  ).toBeVisible();
});
