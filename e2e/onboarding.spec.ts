import { expect, test } from "@playwright/test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";

const port = 8800;
let root = "";
let store: JobStore;
let app: ReturnType<typeof buildApp>;

test.beforeAll(async () => {
  root = await mkdtemp(
    path.join(os.tmpdir(), "social-knowledge-e2e-onboarding-"),
  );
  await mkdir(path.join(root, "data"));
  const config = testConfig(root);
  config.appUrl = `http://127.0.0.1:${port}`;
  store = new JobStore(config.databasePath);
  app = buildApp(config, store, new EventHub());
  await app.listen({ host: "127.0.0.1", port });
});

test.afterAll(async () => {
  await app.close();
  store.close();
  await rm(root, { recursive: true, force: true });
});

test("claims a fresh archive without a setup token and onboards an invited member", async ({
  browser,
  page,
}) => {
  const baseUrl = `http://127.0.0.1:${port}`;
  await page.goto(baseUrl);
  await page.getByLabel("Username").fill("first-admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-strong-admin-password");
  await page.getByLabel("Confirm password").fill("a-strong-admin-password");
  await page
    .getByText(
      "I understand this is an administrator account and can manage access to this archive.",
    )
    .click();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Transcribe your captures" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Set up later" }).click();

  await page.goto(`${baseUrl}/?tab=settings`);
  await page
    .getByRole("navigation", { name: "Settings topics" })
    .getByRole("button", { name: "Account" })
    .click();
  await expect(
    page.getByRole("heading", { name: "People and access" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(
    page.getByText("Member invitation created. It expires in 24 hours."),
  ).toBeVisible();
  const invitationUrl = await page
    .getByLabel("New invitation link")
    .inputValue();
  expect(invitationUrl).toContain("#invite=");

  const invitedContext = await browser.newContext();
  const invitedPage = await invitedContext.newPage();
  await invitedPage.goto(invitationUrl);
  await expect(
    invitedPage.getByRole("heading", { name: "Join this private archive" }),
  ).toBeVisible();
  await invitedPage.getByLabel("Username").fill("invited-member");
  await invitedPage
    .getByLabel("Password", { exact: true })
    .fill("a-strong-member-password");
  await invitedPage
    .getByLabel("Confirm password")
    .fill("a-strong-member-password");
  await invitedPage.getByRole("button", { name: "Create account" }).click();
  await expect(
    invitedPage.getByRole("heading", { name: "Transcribe your captures" }),
  ).toBeVisible();
  await invitedPage.getByRole("button", { name: "Set up later" }).click();
  await expect(
    invitedPage.getByRole("button", { name: "Settings" }),
  ).toBeVisible();
  await invitedPage.setViewportSize({ width: 390, height: 844 });
  for (const label of [
    "Inbox",
    "Activity",
    "Knowledge base",
    "Ask",
    "Settings",
  ])
    await expect(
      invitedPage.getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
  await expect(
    invitedPage.getByRole("button", { name: "Capture a post", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      invitedPage.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await invitedPage
    .getByRole("button", { name: "Activity", exact: true })
    .click();
  await expect(
    invitedPage.getByRole("heading", { name: "Activity" }),
  ).toBeVisible();
  await invitedPage
    .getByRole("button", { name: "Knowledge base", exact: true })
    .click();
  await expect(
    invitedPage.getByRole("heading", { name: "Home" }),
  ).toBeVisible();
  await invitedPage.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(
    invitedPage.getByRole("heading", { name: "Ask AI" }),
  ).toBeVisible();
  await invitedPage
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(
    invitedPage.getByRole("heading", { name: "Settings" }),
  ).toBeVisible();
  await invitedPage
    .getByRole("button", { name: "Capture a post", exact: true })
    .click();
  await expect(
    invitedPage.getByRole("heading", { name: "Capture a post" }),
  ).toBeVisible();
  await invitedPage.getByRole("button", { name: "Close capture" }).click();
  await invitedPage.getByRole("button", { name: "Inbox", exact: true }).click();
  await expect(
    invitedPage.getByRole("heading", { name: "Ideas worth keeping." }),
  ).toBeVisible();
  await invitedPage.getByRole("button", { name: "Open account menu" }).click();
  const accountMenu = invitedPage.getByRole("dialog");
  await expect(
    accountMenu.getByRole("button", { name: "Sign out" }),
  ).toBeVisible();
  await accountMenu.getByRole("button", { name: "Sign out" }).click();
  await expect(
    invitedPage.getByRole("heading", { name: "Invitation unavailable" }),
  ).toBeVisible();
  await invitedContext.close();
});
