import { expect, test } from "@playwright/test";

test("Inbox starts with capture controls and coalesces live refreshes", async ({ page }) => {
  let captureRequests = 0;
  let analyticsRequests = 0;
  page.on("request", (request) => {
    if (/\/api\/v1\/captures(?:\?|$)/.test(request.url())) captureRequests += 1;
    if (request.url().includes("/inbox-analytics")) analyticsRequests += 1;
  });
  await page.addInitScript(() => {
    class TestEventSource extends EventTarget {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      constructor() {
        super();
        (window as unknown as { testEventSource: TestEventSource }).testEventSource = this;
      }
      close() {}
      emit(data: string) { this.onmessage?.(new MessageEvent("message", { data })); }
    }
    Object.defineProperty(window, "EventSource", { configurable: true, value: TestEventSource });
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user: { id: "fixture-user", username: "Stephen", role: "admin" } } }));
  await page.route("**/api/v1/captures**", (route) => route.fulfill({ json: { captures: [], nextCursor: null } }));
  await page.route("**/api/v1/capture-facets", (route) => route.fulfill({ json: { categories: [], topics: [] } }));
  await page.route("**/api/v1/jobs**", (route) => route.fulfill({ json: {
    jobs: [], failures: [], nextCursor: null, total: 0,
    generatedAt: new Date().toISOString(),
    counts: { active: 0, queued: 0, failed: 0, savedToday: 0, recentEvents: 0 },
  } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Search titles, notes, or creators")).toBeVisible();
  await expect(page.locator(".analytics-card, .inbox-analytics")).toHaveCount(0);
  const initialRequests = captureRequests;
  await page.evaluate(() => {
    const source = (window as unknown as { testEventSource: { emit: (data: string) => void } }).testEventSource;
    for (let index = 0; index < 8; index++) source.emit(JSON.stringify({ type: "capture", payload: { status: "complete" } }));
  });
  await expect.poll(() => captureRequests).toBe(initialRequests + 1);
  expect(analyticsRequests).toBe(0);
  await page.screenshot({ path: "test-results/inbox-refined-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByPlaceholder("Search titles, notes, or creators")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
