import { expect, test, type Page } from "@playwright/test";
import { fixtureAccount } from "../scripts/ui-fixture.js";
import { browserApi } from "./ui-qa-api.js";

// This suite mutates only the disposable seeded UI server. Never run against a
// preview or real account; all provider boundaries remain synthetic.
test.skip(process.env.E2E_UI_FIXTURE !== "true", "Run with scripts/ui-e2e.ts");

async function login(page: Page, account = fixtureAccount) {
  await page.goto("/app");
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
}

async function submit(page: Page, url: string) {
  await page.getByRole("button", { name: "Capture a post", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Capture a post", exact: true });
  await dialog.getByLabel("Post link").fill(url);
  await dialog.getByRole("button", { name: "Save to archive", exact: true }).click();
  return page.getByRole("dialog");
}

for (const scenario of [
  { name: "queued", account: fixtureAccount, status: 202, primary: "View progress", title: "Post queued" },
  { name: "retained 428 setup", account: { username: "maya", password: "fixture-maya-password", displayName: "Maya Chen" }, status: 428, primary: "Set up AI", title: "Link saved — AI setup needed" },
]) {
  test(`F1 02,03,28 keyboard focus survives ${scenario.name} receipt and Capture another`, async ({ page }) => {
    await login(page, scenario.account);
    const opener = page.getByRole("button", { name: "Capture a post", exact: true });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    const link = dialog.getByLabel("Post link", { exact: true });
    await expect(link).toBeFocused();
    const url = `https://www.instagram.com/reel/qa-keyboard-${scenario.status}/`;
    await link.fill(url);
    const response = page.waitForResponse((item) => item.url().endsWith("/api/v1/jobs") && item.request().method() === "POST");
    // Submit from the focused field using only the keyboard. The disappearing
    // field must transfer focus to the receipt action rather than document.body.
    await page.keyboard.press("Enter");
    const receipt = await response;
    expect(receipt.status()).toBe(scenario.status);
    const body = await receipt.json();
    expect(body.job.status).toBe(scenario.status === 428 ? "failed" : "queued");
    if (scenario.status === 428) {
      expect(body.job.errorCode).toBe("ai_setup_required");
      const stored = await browserApi(page, `/api/v1/jobs/${body.job.id}`);
      expect(stored.status()).toBe(200);
      expect((await stored.json()).job.normalizedUrl).toBe(url.replace(/\/$/, ""));
    }
    await expect(dialog.getByRole("heading", { name: scenario.title, exact: true })).toBeVisible();
    const primary = dialog.getByRole("button", { name: scenario.primary, exact: true });
    await expect(primary).toBeFocused();
    const close = dialog.getByRole("button", { name: "Close capture", exact: true });
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(primary).toBeFocused();
    for (const key of ["Tab", "Shift+Tab"]) {
      for (let step = 0; step < 6; step++) {
        await page.keyboard.press(key);
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      }
    }
    // Programmatic outside focus can occur during DOM replacement or browser
    // integration. Tab must recover into the modal in either direction.
    await opener.evaluate((element: HTMLButtonElement) => element.focus());
    await expect(opener).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await opener.evaluate((element: HTMLButtonElement) => element.focus());
    await page.keyboard.press("Shift+Tab");
    await expect(primary).toBeFocused();
    const another = dialog.getByRole("button", { name: "Capture another", exact: true });
    for (let step = 0; step < 5; step++) {
      if (await another.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press("Shift+Tab");
    }
    await expect(another).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("heading", { name: "Capture a post", exact: true })).toBeVisible();
    await expect(link).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}

test("02 receipts distinguish queued, saved, processing, and retained unsupported URLs", async ({ page }) => {
  await login(page);
  const cases = [
    { slug: "qa-new-queued", title: "Post queued", text: "Queued for processing", steps: true },
    { slug: "pastel-de-nata", title: "Already in your archive", text: "Saved earlier", steps: false },
    { slug: "fixture-in-flight", title: "Already processing", text: "Already in progress", steps: false },
  ];
  for (const receipt of cases) {
    const response = page.waitForResponse((res) => res.url().endsWith("/api/v1/jobs") && res.request().method() === "POST");
    const dialog = await submit(page, `https://www.instagram.com/reel/${receipt.slug}/`);
    const body = await (await response).json();
    expect(body.job.status).toBe(receipt.slug === "pastel-de-nata" ? "complete" : receipt.slug === "fixture-in-flight" ? "transcribing" : "queued");
    await expect(dialog.getByRole("heading", { name: receipt.title, exact: true })).toBeVisible();
    await expect(dialog.getByRole("status")).toContainText(receipt.text);
    await expect(dialog.getByLabel("What happens next")).toHaveCount(receipt.steps ? 1 : 0);
    if (!receipt.steps) await expect(dialog).not.toContainText("Your post is in the processing queue");
    if (receipt.slug === "qa-new-queued") await expect(dialog).not.toContainText("Processing has started");
    await dialog.getByRole("button", { name: "Close capture" }).click();
  }
  // No worker is running: a duplicate queued receipt must not claim active
  // processing or imply the retained URL is already a completed capture.
  const queuedResponse = page.waitForResponse((res) => res.url().endsWith("/api/v1/jobs") && res.request().method() === "POST");
  const queuedDialog = await submit(page, "https://www.instagram.com/reel/qa-new-queued/");
  const queuedBody = await (await queuedResponse).json();
  expect(queuedBody.created).toBe(false);
  expect(queuedBody.job.status).toBe("queued");
  await expect(queuedDialog).toContainText(/already.*queued|already.*queue/i);
  await expect(queuedDialog).not.toContainText(/already processing|already being processed|processing has started|already in your archive/i);
  await expect(queuedDialog.getByLabel("What happens next")).toHaveCount(0);
  await queuedDialog.getByRole("button", { name: "Close capture" }).click();
  const url = "https://example.com/qa-retained-receipt";
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = page.waitForResponse((res) => res.url().endsWith("/api/v1/jobs") && res.request().method() === "POST");
    const dialog = await submit(page, url);
    const body = await (await response).json();
    expect(body.created).toBe(attempt === 0);
    expect(body.job.errorCode).toBe("unsupported_platform");
    await expect(dialog.getByRole("heading", { name: attempt === 0 ? "Bookmark saved" : "Already saved as a bookmark", exact: true })).toBeVisible();
    await expect(dialog.getByRole("status")).toContainText("Kept as a bookmark");
    await expect(dialog).toContainText("nothing will be downloaded or analysed");
    await expect(dialog.getByLabel("What happens next")).toHaveCount(0);
    await expect(dialog).not.toContainText(/processing queue|already processing/i);
    await dialog.getByRole("button", { name: "Close capture" }).click();
  }
});

test("03,18 missing AI retains the URL and opens setup with a return/retry route", async ({ page }) => {
  await login(page, { username: "maya", password: "fixture-maya-password", displayName: "Maya Chen" });
  await expect(page.locator(".inbox-empty")).toContainText(/capture/i);
  await expect(page.locator(".inbox-empty").getByRole("button", { name: /AI|setup/i })).toBeVisible();
  await page.locator(".inbox-empty").getByRole("button", { name: "Capture your first post", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Capture a post", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close capture", exact: true }).click();
  await page.locator(".inbox-empty").getByRole("button", { name: "Finish AI setup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI & models", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to archive", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  const url = "https://www.instagram.com/reel/qa-missing-ai/";
  const response = page.waitForResponse((res) => res.url().endsWith("/api/v1/jobs") && res.request().method() === "POST");
  const dialog = await submit(page, url);
  const retained = await response;
  expect(retained.status()).toBe(428);
  const body = await retained.json();
  expect(body.job.errorCode).toBe("ai_setup_required");
  await expect(dialog.getByRole("heading", { name: "Link saved — AI setup needed", exact: true })).toBeVisible();
  await expect(dialog).toContainText("Your link is kept in Activity");
  await expect(dialog.getByLabel("What happens next")).toHaveCount(0);
  const stored = await browserApi(page, `/api/v1/jobs/${body.job.id}`);
  expect(stored.ok()).toBeTruthy();
  expect((await stored.json()).job.normalizedUrl).toBe(url.replace(/\/$/, ""));
  await dialog.getByRole("button", { name: /set up AI|AI setup|open AI/i }).click();
  await expect(page.getByRole("heading", { name: "AI & models", exact: true })).toBeVisible();
  const banner = page.getByRole("region", { name: "Saved link waiting for AI setup", exact: true });
  await expect(banner).toContainText("qa-missing-ai");
  const retry = page.waitForResponse((res) => res.url().endsWith(`/jobs/${body.job.id}/retry`) && res.request().method() === "POST");
  await banner.getByRole("button", { name: "Retry saved link", exact: true }).click();
  expect((await retry).status()).toBe(428);
  await expect(banner.getByRole("status")).toContainText("AI setup isn’t finished yet");
  const stillRetained = await (await browserApi(page, `/api/v1/jobs/${body.job.id}`)).json();
  expect(stillRetained.job.status).toBe("failed");
  expect(stillRetained.job.errorCode).toBe("ai_setup_required");
  expect(stillRetained.job.normalizedUrl).toBe(url.replace(/\/$/, ""));
  await page.getByRole("button", { name: /back to capture|return to capture/i }).click();
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
  await expect(page.locator(`[data-job-row="${body.job.id}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Capture details" })).toContainText(/AI|setup/i);
  await expect(page.getByRole("region", { name: "Capture details" }).getByRole("button", { name: /retry/i })).toBeVisible();
});

test("01,07,28 expired connection opens Connections and returns to the same mobile item", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const failures = await (await browserApi(page, "/api/v1/jobs/failed?limit=50")).json();
  const affected = failures.failures.find((job: { normalizedUrl: string }) => job.normalizedUrl.includes("fixture-failed"));
  expect(affected).toBeTruthy();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const failure = page.locator(`[data-job-id="${affected.id}"]`);
  await expect(failure).toContainText(/reconnect.*retry/i);
  await failure.getByRole("button", { name: "Reconnect Facebook", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connections", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/tab=settings/);
  await page.getByRole("button", { name: /back to capture|return to capture/i }).click();
  const inspector = page.getByRole("region", { name: "Capture details" });
  await expect(inspector).toContainText("fixture-failed");
  await expect(inspector).toBeInViewport();
  await expect(inspector).toContainText(/reconnect.*retry/i);
  await inspector.getByRole("button", { name: /back to captures/i }).click();
  await expect(page.locator(`[data-job-row="${affected.id}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`[data-job-row="${affected.id}"]`)).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("08 archive/restore uses real API, updates attention, and preserves URL and history", async ({ page, browser }) => {
  await login(page);
  const url = "https://example.com/qa-archive-restore";
  const created = await browserApi(page, "/api/v1/jobs", "POST", { url });
  expect(created.status()).toBe(202);
  const id = (await created.json()).job.id as string;
  const before = await (await browserApi(page, `/api/v1/jobs/${id}`)).json();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const attention = page.locator(`[data-job-id="${id}"]`);
  await expect(attention).toBeVisible();
  const attentionBefore = Number(await page.locator(".activity-stat.attention strong").textContent());
  const archived = page.waitForResponse((res) => res.url().endsWith(`/jobs/${id}/archive`) && res.request().method() === "POST");
  await attention.getByRole("button", { name: /^Archive bookmark / }).click();
  expect((await archived).status()).toBe(200);
  await expect(attention).toHaveCount(0);
  await expect(page.locator(".activity-stat.attention strong")).toHaveText(String(attentionBefore - 1));
  const after = await (await browserApi(page, `/api/v1/jobs/${id}`)).json();
  expect(after.job.normalizedUrl).toBe(before.job.normalizedUrl);
  expect(after.events).toEqual(before.events);
  expect(after.job.archivedAt).toBeTruthy();
  const duplicate = page.waitForResponse((res) => res.url().endsWith("/api/v1/jobs") && res.request().method() === "POST");
  const archivedReceipt = await submit(page, url);
  const duplicateBody = await (await duplicate).json();
  expect(duplicateBody.created).toBe(false);
  expect(duplicateBody.job.id).toBe(id);
  expect(duplicateBody.job.archivedAt).toBe(after.job.archivedAt);
  await expect(archivedReceipt.getByRole("heading", { name: "Already saved as an archived bookmark", exact: true })).toBeVisible();
  await expect(archivedReceipt.getByLabel("What happens next")).toHaveCount(0);
  await expect(archivedReceipt).toContainText("Restore it from Activity");
  await archivedReceipt.getByRole("button", { name: "Close capture" }).click();
  const outsider = await browser.newContext();
  try {
    const other = await outsider.newPage();
    await login(other, { username: "joao", password: "fixture-joao-password", displayName: "João Ribeiro" });
    expect((await browserApi(other, `/api/v1/jobs/${id}`)).status()).toBe(404);
    expect((await browserApi(other, `/api/v1/jobs/${id}/restore`, "POST")).status()).toBe(404);
  } finally { await outsider.close(); }
  await page.getByLabel("Filter captures").selectOption("archived");
  const row = page.locator(`[data-job-row="${id}"]`);
  await expect(row).toBeVisible();
  await row.click();
  const restored = page.waitForResponse((res) => res.url().endsWith(`/jobs/${id}/restore`) && res.request().method() === "POST");
  await page.getByRole("region", { name: "Capture details" }).getByRole("button", { name: "Restore", exact: true }).click();
  expect((await restored).status()).toBe(200);
  await expect(row).toHaveCount(0);
  await expect(page.locator(".activity-stat.attention strong")).toHaveText(String(attentionBefore));
  const final = await (await browserApi(page, `/api/v1/jobs/${id}`)).json();
  expect(final.job.archivedAt).toBeNull();
  expect(final.job.normalizedUrl).toBe(url);
  expect(final.events).toEqual(before.events);
  // Return disposable fixture state to its initial visibility after the probe.
  expect((await browserApi(page, `/api/v1/jobs/${id}/archive`, "POST")).ok()).toBeTruthy();
});

test("17,20 navigation palette wording and iPhone guided setup work by keyboard/mobile", async ({ page }) => {
  await login(page);
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: /go to/i });
  await expect(palette).toBeVisible();
  const search = palette.getByRole("combobox");
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute("placeholder", /go to|destination/i);
  await search.fill("Pastel de nata");
  await expect(palette).toContainText("No matching pages or actions");
  await expect(palette).toContainText("Search saved posts in Inbox, or ask a question in Ask");
  await search.fill("Knowledge");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Knowledge base", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Capture a post", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /iPhone/i }).click();
  await expect(page.getByRole("heading", { name: "API keys", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/tab=settings/);
  await expect(page.getByRole("region", { name: "Social Knowledge Shortcut" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setup guide", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Create Shortcut key", exact: true })).toBeVisible();
});
