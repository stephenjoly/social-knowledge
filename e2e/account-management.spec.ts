import { expect, test, type Page } from "@playwright/test";
import { hash } from "@node-rs/argon2";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";

const port = 8805;
const baseUrl = `http://127.0.0.1:${port}`;
const adminPassword = "a-strong-admin-password";
const updatedAdminPassword = "an-updated-admin-password";
const memberPassword = "a-strong-member-password";
let root = "";
let store: JobStore;
let app: ReturnType<typeof buildApp>;

async function signIn(page: Page, username: string, password: string) {
  await page.goto(`${baseUrl}/?tab=settings`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "My account", exact: true })).toBeVisible();
}

async function openTopic(page: Page, topic: string, heading: string) {
  await page.goto(`${baseUrl}/?tab=settings&topic=${topic}`);
  await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
}

async function expectColumnGeometry(page: Page, viewportWidth: 1440 | 1800) {
  await page.setViewportSize({ width: viewportWidth, height: 1020 });
  const column = await page.locator(".st-column").boundingBox();
  expect(column).not.toBeNull();
  expect(column!.width).toBeCloseTo(780, 0);
  const cards = page.locator(".st-column .st-card");
  expect(await cards.count()).toBeGreaterThan(0);
  for (let index = 0; index < await cards.count(); index += 1) {
    const card = await cards.nth(index).boundingBox();
    expect(card).not.toBeNull();
    expect(card!.x).toBeCloseTo(column!.x, 0);
    expect(card!.width).toBeCloseTo(column!.width, 0);
  }
}

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe.serial("account profile and access management", () => {
  test.beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-e2e-account-"));
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    config.appUrl = baseUrl;
    store = new JobStore(config.databasePath);
    store.createUser("account-admin", await hash(adminPassword), "admin");
    store.createUser("account-member", await hash(memberPassword), "member");
    app = buildApp(config, store, new EventHub());
    await app.listen({ host: "127.0.0.1", port });
  });

  test.afterAll(async () => {
    if (app) await app.close();
    if (store) store.close();
    await rm(root, { recursive: true, force: true });
  });

  test("saves profile and avatar changes and accepts the new password", async ({ browser, page }) => {
    await signIn(page, "account-admin", adminPassword);
    await expect(page.getByRole("navigation", { name: "Settings topics" })).toHaveCount(0);
    await expectColumnGeometry(page, 1440);

    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    await page.getByLabel("Display name").fill("Archive Owner");
    await page.getByLabel("Username").fill("renamed-admin");
    await expect(page.getByText("Your display name and username changed.")).toBeVisible();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText("Profile saved.");
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);

    const blue = page.getByRole("button", { name: "Blue avatar colour" });
    await expect(blue).toHaveAttribute("aria-pressed", "false");
    await blue.click();
    await expect(page.getByRole("status")).toContainText("Avatar colour saved.");
    await expect(blue).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Change password" }).click();
    const passwordDialog = page.getByRole("dialog", { name: "Change password" });
    const currentPassword = passwordDialog.getByLabel("Current password");
    const newPassword = passwordDialog.getByLabel("New password");
    await currentPassword.pressSequentially("wrong-password");
    await expect(currentPassword).toBeFocused();
    await newPassword.pressSequentially("too-short");
    await expect(newPassword).toBeFocused();
    await expect(newPassword).toHaveAttribute("minlength", "12");
    expect((await newPassword.inputValue()).length).toBeLessThan(12);
    await newPassword.fill(updatedAdminPassword);
    await passwordDialog.getByRole("button", { name: "Change password and sign out" }).click();
    await expect(passwordDialog.getByRole("alert")).toBeVisible();
    await expect(passwordDialog).toBeVisible();

    await currentPassword.fill(adminPassword);
    await passwordDialog.getByRole("button", { name: "Change password and sign out" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await signIn(freshPage, "renamed-admin", updatedAdminPassword);
    await expect(freshPage.getByLabel("Display name")).toHaveValue("Archive Owner");
    await expect(freshPage.getByLabel("Username")).toHaveValue("renamed-admin");
    await expect(freshPage.getByRole("button", { name: "Blue avatar colour" })).toHaveAttribute("aria-pressed", "true");
    await freshContext.close();
  });

  test("administrator changes role, confirms suspension, and restores access", async ({ browser, page }) => {
    await signIn(page, "renamed-admin", updatedAdminPassword);
    await openTopic(page, "people", "People & access");
    await expectColumnGeometry(page, 1440);

    const ownerRow = page.locator(".st-people-row").filter({ hasText: "@renamed-admin" });
    await expect(ownerRow).toContainText("you");
    await expect(ownerRow.getByRole("combobox")).toHaveCount(0);
    await expect(ownerRow.getByRole("button", { name: /^Actions for/ })).toHaveCount(0);

    const memberRow = page.locator(".st-people-row").filter({ hasText: "@account-member" });
    const role = memberRow.getByLabel("Role for account-member");
    const roleBounds = await memberRow.locator(".ui-select").boundingBox();
    expect(roleBounds).not.toBeNull();
    expect(roleBounds!.height).toBeCloseTo(32, 0);
    await expect(role).toHaveValue("member");
    await role.selectOption("admin");
    await expect(page.getByRole("status").first()).toContainText("Account updated.");
    expect(store.getUserByUsername("account-member")!.role).toBe("admin");
    await role.selectOption("member");
    await expect(role).toHaveValue("member");
    await expect.poll(() => store.getUserByUsername("account-member")!.role).toBe("member");

    const actions = page.getByRole("button", { name: "Actions for account-member" });
    await actions.click();
    await expect(page.getByRole("menuitem", { name: "Suspend access…" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(actions).toBeFocused();
    await expect(actions).toHaveAttribute("aria-expanded", "false");

    await actions.click();
    await page.getByRole("menuitem", { name: "Suspend access…" }).click();
    const confirm = page.getByRole("dialog", { name: "Suspend account-member’s access?" });
    await expect(confirm).toContainText("archive and credentials stay intact and private");
    await confirm.getByRole("button", { name: "Suspend access" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(memberRow).toContainText("suspended");

    const suspendedContext = await browser.newContext();
    const suspendedPage = await suspendedContext.newPage();
    await suspendedPage.goto(`${baseUrl}/?tab=settings`);
    await suspendedPage.getByLabel("Username").fill("account-member");
    await suspendedPage.getByLabel("Password").fill(memberPassword);
    await suspendedPage.getByRole("button", { name: "Continue" }).click();
    await expect(suspendedPage.getByRole("alert")).toContainText("Incorrect username or password.");
    await suspendedContext.close();

    await actions.click();
    await page.getByRole("menuitem", { name: "Restore access" }).click();
    await expect(memberRow).not.toContainText("suspended");

    await expectColumnGeometry(page, 1800);
    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await noHorizontalOverflow(page)).toBe(true);
      await expect(role).toBeVisible();
      await expect(actions).toBeVisible();
      await actions.click();
      await expect(page.getByRole("menuitem", { name: "Suspend access…" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(actions).toBeFocused();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const people = page.locator(".st-people");
    expect(await people.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await noHorizontalOverflow(page)).toBe(true);
    await role.scrollIntoViewIfNeeded();
    await role.selectOption("admin");
    await expect.poll(() => store.getUserByUsername("account-member")!.role).toBe("admin");
    await role.selectOption("member");
    await expect.poll(() => store.getUserByUsername("account-member")!.role).toBe("member");
    await actions.scrollIntoViewIfNeeded();
    await actions.click();
    await page.getByRole("menuitem", { name: "Suspend access…" }).click();
    const mobileConfirm = page.getByRole("dialog", { name: "Suspend account-member’s access?" });
    await expect(mobileConfirm).toBeVisible();
    const dialogBounds = await mobileConfirm.boundingBox();
    expect(dialogBounds).not.toBeNull();
    expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(390);
    await mobileConfirm.getByRole("button", { name: "Cancel" }).click();
    await expect(mobileConfirm).toHaveCount(0);
  });

  test("invitation links remain session-only across create, reload, regenerate, and revoke", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (window as Window & { __invitationCopyValid?: boolean }).__invitationCopyValid =
              value.startsWith(window.location.origin) && value.includes("#invite=");
          },
        },
      });
    });
    await signIn(page, "renamed-admin", updatedAdminPassword);
    await openTopic(page, "people", "People & access");
    const copyValid = () =>
      page.evaluate(() => (window as Window & { __invitationCopyValid?: boolean }).__invitationCopyValid);

    await expect(page.getByText("No open invitations.")).toBeVisible();
    await page.getByRole("button", { name: "Invite someone" }).click();
    const inviteDialog = page.getByRole("dialog", { name: "Invite someone" });
    await expect(inviteDialog.getByLabel("Invitation role")).toHaveValue("member");
    await inviteDialog.getByRole("button", { name: "Create invitation" }).click();
    await expect(page.getByText("Invitation created.")).toBeVisible();
    await expect(page.locator('input[value*="#invite="]')).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("#invite=");
    await inviteDialog.getByRole("button", { name: "Copy link" }).click();
    await expect(inviteDialog.getByRole("status")).toContainText("Invitation link copied.");
    expect(await copyValid()).toBe(true);
    await inviteDialog.getByRole("button", { name: "Done" }).click();
    await expect(inviteDialog).toHaveCount(0);

    let invitation = page.locator(".ui-card-row").filter({ hasText: "Member invite" });
    await expect(invitation).toContainText("Created by Archive Owner · expires");
    await expect(invitation.getByRole("button", { name: "Copy link" })).toBeVisible();

    await openTopic(page, "people", "People & access");
    invitation = page.locator(".ui-card-row").filter({ hasText: "Member invite" });
    await expect(invitation.getByRole("button", { name: "Copy link" })).toHaveCount(0);
    await invitation.getByRole("button", { name: "New link" }).click();
    await expect(page.getByText("New invitation link created.")).toBeVisible();
    await expect(invitation.getByRole("button", { name: "Copy link" })).toBeVisible();
    await expect(page.locator('input[value*="#invite="]')).toHaveCount(0);
    await page.evaluate(() => {
      (window as Window & { __invitationCopyValid?: boolean }).__invitationCopyValid = false;
    });
    await invitation.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText("Invitation link copied.")).toBeVisible();
    expect(await copyValid()).toBe(true);

    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("synthetic_clipboard_unavailable");
          },
        },
      });
    });
    await invitation.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText("Select and copy the invitation link above.")).toBeVisible();
    await expect(page.getByLabel("New invitation link")).toHaveValue(/#invite=/);

    await invitation.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText("Invitation revoked.")).toBeVisible();
    await expect(page.getByLabel("New invitation link")).toHaveCount(0);
    await expect(page.locator(".ui-card-row").filter({ hasText: "Member invite" })).toHaveCount(0);
    await expect(page.getByText("No open invitations.")).toBeVisible();
  });

  test("member remains isolated and sees only their own account settings on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "account-member", memberPassword);

    const forbidden = await page.evaluate(async () => {
      const response = await fetch("/api/v1/admin/users");
      return response.status;
    });
    expect(forbidden).toBe(403);

    await openTopic(page, "people", "My account");
    await expect(page.getByRole("button", { name: "Invite someone" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
    const profile = await page.locator(".st-card").first().boundingBox();
    expect(profile).not.toBeNull();
    expect(profile!.x).toBeGreaterThanOrEqual(0);
    expect(profile!.x + profile!.width).toBeLessThanOrEqual(390);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});
