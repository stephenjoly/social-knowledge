import { expect, test } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

test.skip(
  !username || !password,
  "Set E2E_USERNAME and E2E_PASSWORD for authenticated browser tests",
);

test("archive navigation, detail, capture feedback, and responsive layout", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByLabel("Username").fill(username!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("button", { name: "inbox" })).toBeVisible();
  await expect(page.locator(".capture-card").first()).toBeVisible();
  const travelFilter = page
    .locator(".filter-group", { hasText: "Categories" })
    .getByRole("button", { name: /Travel/ });
  await expect(travelFilter).toBeVisible();
  await travelFilter.click();
  await expect(travelFilter).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Clear" }).click();
  await page.locator(".capture-card").first().click();
  await expect(page.locator(".drawer video")).toBeVisible();
  await expect(
    page.locator(".drawer").getByRole("heading", { name: "Key takeaways" }),
  ).toBeVisible();
  await expect(page.locator(".drawer .takeaways li").first()).toBeVisible();
  await page.locator(".close").click();

  await page.getByRole("button", { name: "library" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Expand Travel" }),
  ).toBeVisible();
  await expect(
    page.locator(".library-tree button", { hasText: "Lisbon" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Travel" }).click();
  await page.getByRole("button", { name: "Expand Portugal" }).click();
  await page.getByRole("button", { name: "Expand Lisbon" }).click();
  await page
    .locator(".library-tree button", { hasText: "Travel" })
    .first()
    .click();
  await expect(
    page.locator(".markdown").getByRole("heading", { name: "Travel" }),
  ).toBeVisible();
  await expect(page.locator(".markdown")).not.toContainText("node_id:");
  await expect(page.locator(".markdown")).not.toContainText("node_type:");
  await expect(page.locator(".markdown")).not.toContainText("generated:");
  await page
    .locator(".library-tree button", { hasText: "Lisbon" })
    .first()
    .click();
  await page
    .locator(".library-tree button", { hasText: "Restaurants" })
    .filter({ hasText: "2" })
    .first()
    .click();
  const captureLink = page.locator(".markdown .markdown-link").first();
  await expect(captureLink).toBeVisible();
  await captureLink.click();
  await expect(page.locator(".markdown")).not.toContainText("source_url:");
  await expect(page.locator(".markdown")).not.toContainText("source_id:");
  await expect(
    page
      .locator(".library-toolbar")
      .getByRole("button", { name: "Open capture" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "ask" }).click();
  await expect(page.getByRole("heading", { name: "Ask AI" })).toBeVisible();
  await page.getByRole("button", { name: "＋ New conversation" }).click();
  await expect(
    page.locator(".conversation-sidebar button.selected"),
  ).toBeVisible();
  await expect(page.locator(".ask-empty")).toBeVisible();
  await page
    .getByRole("button", {
      name: "What Lisbon restaurants have I saved?",
      exact: true,
    })
    .click();
  await expect(page.locator(".chat-composer .stop-answer")).toBeVisible();
  await expect(
    page.locator(".chat-message.assistant .message-content").last(),
  ).not.toContainText("Searching your archive", { timeout: 60000 });
  await expect(
    page.locator(".chat-message.assistant .answer-sources button").first(),
  ).toBeVisible({ timeout: 60000 });
  const inlineCaptureLink = page
    .locator(".chat-message.assistant .inline-capture-link")
    .first();
  await expect(inlineCaptureLink).toBeVisible();
  await expect(inlineCaptureLink.locator("svg")).toBeVisible();
  await expect(
    page.locator(".chat-message.assistant .message-content"),
  ).toContainText(/Lisbon|restaurant/i);
  await inlineCaptureLink.click();
  await expect(page.locator(".drawer")).toBeVisible();
  await page.locator(".close").click();
  await page.reload();
  await page.getByRole("button", { name: "ask" }).click();
  await expect(
    page.locator(".chat-message.assistant .answer-sources button").first(),
  ).toBeVisible();
  await page
    .locator(".chat-message.assistant .answer-sources button")
    .first()
    .click();
  await expect(page.locator(".drawer")).toBeVisible();
  await page.locator(".close").click();

  await page.getByRole("button", { name: "＋ New conversation" }).click();
  await expect(
    page.locator(".conversation-sidebar button.selected"),
  ).toBeVisible();
  await expect(page.locator(".ask-empty")).toBeVisible();
  await page.getByLabel("Ask your archive").fill("__smoke_slow__");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.locator(".chat-message.assistant.cancelled")).toBeVisible({
    timeout: 10000,
  });
  await page
    .locator(".chat-message.assistant.cancelled")
    .getByRole("button", { name: "Retry" })
    .click();
  await expect(
    page.locator(".chat-message.assistant.complete").last(),
  ).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "＋ New conversation" }).click();
  await expect(
    page.locator(".conversation-sidebar button.selected"),
  ).toBeVisible();
  await expect(page.locator(".ask-empty")).toBeVisible();
  await page.getByLabel("Ask your archive").fill("__smoke_failure__");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".chat-message.assistant.failed")).toBeVisible({
    timeout: 10000,
  });
  await page
    .locator(".chat-message.assistant.failed")
    .getByRole("button", { name: "Retry" })
    .click();
  await expect(
    page.locator(".chat-message.assistant.complete").last(),
  ).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: /activity/i }).click();
  await expect(page.locator(".job-list article").first()).toBeVisible();
  const completedJob = page
    .locator(".job-list article:has(.complete-summary)")
    .first();
  await expect(completedJob.locator(".complete-summary")).toHaveText(
    /Complete/,
  );
  await expect(completedJob.locator(".stage-breadcrumbs")).toHaveCount(0);
  await expect(completedJob.locator(".platform-icon")).toBeVisible();
  await page
    .locator(".job-list article")
    .first()
    .getByRole("button", { name: /view details/i })
    .click();
  await expect(
    page.getByRole("dialog", { name: /processing details/i }),
  ).toBeVisible();
  await expect(page.locator(".event-log li").first()).toBeVisible();
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.locator(".job-list article").first()).not.toContainText(
    "Command failed with exit code",
  );

  await page.getByRole("button", { name: "settings" }).click();
  const languageSelect = page.getByRole("combobox", {
    name: "Default language",
  });
  await expect(languageSelect).toBeVisible();
  const originalLanguage = await languageSelect.inputValue();
  await languageSelect.selectOption("French");
  await page.getByRole("button", { name: "Save language settings" }).click();
  await expect(page.getByText("Language preferences saved.")).toBeVisible();
  await languageSelect.selectOption(originalLanguage);
  await page.getByRole("button", { name: "Save language settings" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "library" }).click();
  await expect(page.locator(".library-layout")).toBeVisible();
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
