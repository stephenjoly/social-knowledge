import type { Page } from "@playwright/test";

/**
 * Use the authenticated browser's real network stack. The app's Secure session
 * cookie works on Chromium's trusted loopback origin; APIRequestContext does
 * not send that cookie over the QA server's plain HTTP loopback URL.
 */
export async function browserApi(page: Page, pathname: string, method: "GET" | "POST" = "GET", data?: unknown) {
  const result = await page.evaluate(async ({ pathname, method, data }) => {
    const response = await fetch(pathname, {
      method,
      ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    });
    return { status: response.status, ok: response.ok, body: await response.json() };
  }, { pathname, method, data });
  return { status: () => result.status, ok: () => result.ok, json: async () => result.body };
}
