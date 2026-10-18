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

  await expect(
    page.getByRole("button", { name: "Inbox", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".capture-card").first()).toBeVisible();
  await page.getByRole("button", { name: "+ Add filter" }).click();
  const platformFilter = page.getByLabel("Platform");
  await expect(platformFilter).toBeVisible();
  await platformFilter.selectOption("instagram");
  await expect(platformFilter).toHaveValue("instagram");
  await page.getByRole("button", { name: "Close filters" }).click();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.locator(".capture-card").first().click();
  const note = page.locator(".capture-note");
  await expect(note.locator(".note-media")).toBeVisible();
  await expect(
    note.getByRole("link", { name: /^Open original post on / }),
  ).toHaveAttribute("href", /^https:\/\//);
  await expect(
    note.getByRole("heading", { name: "Key takeaways" }),
  ).toBeVisible();
  await expect(note.locator(".note-takeaways li").first()).toBeVisible();
  await note.getByRole("button", { name: "Back to Inbox", exact: true }).click();
  await expect(note).toHaveCount(0);

  await page
    .getByRole("button", { name: "Knowledge base", exact: true })
    .click();
  const knowledge = page.locator(".kb-page");
  await expect(
    page.getByRole("heading", { level: 1, name: "Knowledge base" }),
  ).toBeVisible();
  await knowledge.getByRole("button", { name: "Travel", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Travel" }),
  ).toBeVisible();
  await expect(knowledge).not.toContainText("node_id:");
  await expect(knowledge).not.toContainText("node_type:");
  await expect(knowledge).not.toContainText("generated:");
  const topics = page.getByRole("group", { name: "Topics" });
  await topics.getByRole("button", { name: /^Portugal \d+$/ }).click();
  await topics.getByRole("button", { name: /^Lisbon \d+$/ }).click();
  await topics.getByRole("button", { name: /^Restaurants \d+$/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Restaurants" }),
  ).toBeVisible();
  await knowledge.locator(".kb-capture-row").first().click();
  await expect(note).not.toContainText("source_url:");
  await expect(note).not.toContainText("source_id:");
  await expect(
    note.getByRole("link", { name: /^Open original post on / }),
  ).toBeVisible();
  await note
    .getByRole("button", { name: "Back to Knowledge base", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Restaurants" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ask", exact: true }).click();
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
  await expect(note).toBeVisible();
  await note.getByRole("button", { name: "Back to Ask", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(
    page.locator(".chat-message.assistant .answer-sources button").first(),
  ).toBeVisible();
  await page
    .locator(".chat-message.assistant .answer-sources button")
    .first()
    .click();
  await expect(note).toBeVisible();
  await note.getByRole("button", { name: "Back to Ask", exact: true }).click();

  await page.getByRole("button", { name: "＋ New conversation" }).click();
  await expect(
    page.locator(".conversation-sidebar button.selected"),
  ).toBeVisible();
  await expect(page.locator(".ask-empty")).toBeVisible();
  await page.getByLabel("Ask your archive").fill("__smoke_stream__");
  await page.getByRole("button", { name: "Send" }).click();
  const streamedAnswer = page
    .locator(".chat-message.assistant .message-content")
    .last();
  await expect(page.locator(".chat-composer .stop-answer")).toBeVisible();
  await expect(streamedAnswer).toContainText("The first part of the answer", {
    timeout: 10000,
  });
  await expect(page.locator(".chat-composer .stop-answer")).toBeVisible();
  await expect(streamedAnswer).toContainText(
    "arrives before the answer is complete.",
    { timeout: 10000 },
  );
  await expect(page.locator(".chat-composer .stop-answer")).toHaveCount(0);

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
  const cancelledRetry = page
    .locator(".chat-message.assistant.cancelled")
    .getByRole("button", { name: "Retry" });
  await expect(cancelledRetry).toBeEnabled({ timeout: 10000 });
  await cancelledRetry.click();
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
  const failedRetry = page
    .locator(".chat-message.assistant.failed")
    .getByRole("button", { name: "Retry" });
  await expect(failedRetry).toBeEnabled({ timeout: 10000 });
  await failedRetry.click();
  await expect(
    page.locator(".chat-message.assistant.complete").last(),
  ).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: /activity/i }).click();
  await expect(page.locator(".activity-card").first()).toBeVisible();
  await expect(page.locator(".activity-stage").first()).toBeVisible();
  await page.locator(".activity-card").first().click();
  await expect(page.locator(".activity-inline-log")).toBeVisible();
  await expect(page.locator(".activity-card").first()).not.toContainText(
    "Command failed with exit code",
  );

  await page.locator(".app-profile-settings").click();
  await page
    .getByRole("button", { name: "Data & export", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Knowledge base", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Knowledge base" }),
  ).toBeVisible();
  await knowledge.getByRole("button", { name: "Travel", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Travel" }),
  ).toBeVisible();
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
