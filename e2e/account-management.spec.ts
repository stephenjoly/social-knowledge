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
}

async function openSettings(page: Page) {
  const openSettings = page.getByRole("button", { name: "Open Settings", exact: true });
  if (await openSettings.isVisible()) await openSettings.click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
}

async function chooseSettingsTopic(page: Page, name: string) {
  const desktopButton = page
    .getByRole("navigation", { name: "Settings topics" })
    .getByRole("button", { name, exact: true });
  if (await desktopButton.isVisible()) {
    await desktopButton.click();
    return;
  }
  await page.getByLabel("More settings topics").selectOption({ label: name });
}

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
    await openSettings(page);
    const settingsTopics = page.getByRole("navigation", { name: "Settings topics" }).first();
    await expect(settingsTopics.getByRole("button", { name: "My account", exact: true })).toBeVisible();
    await expect(settingsTopics.getByRole("button", { name: "People & access", exact: true })).toBeVisible();
    await chooseSettingsTopic(page, "My account");

    const profileCard = page.locator(".profile-card");
    const profileBounds = await profileCard.boundingBox();
    expect(profileBounds).not.toBeNull();
    expect(profileBounds!.x + profileBounds!.width).toBeLessThanOrEqual(1440);
    await page.screenshot({
      path: "/private/tmp/social-knowledge-my-account-desktop.png",
      fullPage: true,
    });

    await page.getByLabel("Display name").fill("Archive Owner");
    await page.getByLabel("Username").fill("renamed-admin");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText("Profile saved.");

    await page.getByRole("button", { name: "Change avatar" }).click();
    await expect(page.getByRole("dialog", { name: "Choose avatar color" })).toBeVisible();
    await page.getByRole("button", { name: "Use #355f78" }).click();
    await expect(page.getByRole("dialog", { name: "Choose avatar color" })).toHaveCount(0);

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
    await openSettings(freshPage);
    await chooseSettingsTopic(freshPage, "My account");
    await expect(freshPage.getByLabel("Display name")).toHaveValue("Archive Owner");
    await expect(freshPage.getByLabel("Username")).toHaveValue("renamed-admin");
    await freshContext.close();
  });

  test("administrator changes role, confirms suspension, and restores access", async ({ browser, page }) => {
    await signIn(page, "renamed-admin", updatedAdminPassword);
    await openSettings(page);
    await chooseSettingsTopic(page, "People & access");

    const memberRow = page.locator(".people-table-row").filter({ hasText: "account-member" });
    const roleTrigger = memberRow.getByRole("button", { name: /^Member/ });
    await roleTrigger.click();
    const roleMenu = page.getByRole("menu", { name: "Role for account-member" });
    const administratorRole = roleMenu.getByRole("menuitemradio", { name: /^Administrator/ });
    await expect(administratorRole).toBeFocused();
    await page.screenshot({
      path: "/private/tmp/social-knowledge-people-role-menu-desktop.png",
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(roleTrigger).toBeFocused();
    await expect(roleTrigger).toHaveAttribute("aria-expanded", "false");

    await roleTrigger.click();
    await roleMenu.getByRole("menuitemradio", { name: /^Administrator/ }).click();
    await expect(page.getByRole("status")).toContainText("Account updated.");
    const administratorTrigger = memberRow.getByRole("button", { name: /^Administrator/ });
    await expect(administratorTrigger).toBeVisible();
    await administratorTrigger.click();
    await page.getByRole("menu", { name: "Role for account-member" })
      .getByRole("menuitemradio", { name: /^Member/ })
      .click();
    await expect(memberRow.getByRole("button", { name: /^Member/ })).toBeVisible();

    await page.getByRole("button", { name: "Actions for account-member" }).click();
    await page.getByRole("menuitem", { name: "Suspend access…" }).click();
    const confirm = page.getByRole("dialog", { name: "Suspend account-member’s access?" });
    await expect(confirm).toContainText("archive and credentials stay intact and private");
    await confirm.getByRole("button", { name: "Suspend access" }).click();
    await expect(page.getByText("Suspended", { exact: true })).toBeVisible();

    const suspendedContext = await browser.newContext();
    const suspendedPage = await suspendedContext.newPage();
    await signIn(suspendedPage, "account-member", memberPassword);
    await expect(suspendedPage.getByRole("alert")).toContainText("Incorrect username or password.");
    await suspendedContext.close();

    await page.getByRole("button", { name: "Actions for account-member" }).click();
    await page.getByRole("menuitem", { name: "Restore access" }).click();
    await expect(page.getByText("Active", { exact: true }).last()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const peopleTable = page.locator(".people-table");
    expect(
      await peopleTable.evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "/private/tmp/social-knowledge-people-mobile.png",
      fullPage: true,
    });
    const mobileRole = memberRow.getByRole("button", { name: /^Member/ });
    await mobileRole.scrollIntoViewIfNeeded();
    await mobileRole.click();
    await page.getByRole("menu", { name: "Role for account-member" })
      .getByRole("menuitemradio", { name: /^Administrator/ })
      .click();
    const mobileAdminRole = memberRow.getByRole("button", { name: /^Administrator/ });
    await mobileAdminRole.click();
    await page.getByRole("menu", { name: "Role for account-member" })
      .getByRole("menuitemradio", { name: /^Member/ })
      .click();
    const mobileActions = page.getByRole("button", { name: "Actions for account-member" });
    await mobileActions.scrollIntoViewIfNeeded();
    await mobileActions.click();
    await page.getByRole("menuitem", { name: "Suspend access…" }).click();
    const mobileConfirm = page.getByRole("dialog", { name: "Suspend account-member’s access?" });
    await expect(mobileConfirm).toBeVisible();
    const dialogBounds = await mobileConfirm.boundingBox();
    expect(dialogBounds).not.toBeNull();
    expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(390);
    await mobileConfirm.getByRole("button", { name: "Cancel" }).click();
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
    await openSettings(page);
    await chooseSettingsTopic(page, "People & access");

    await expect(page.getByText("No invitations yet.")).toBeVisible();
    await page.getByRole("button", { name: "Create invitation" }).click();
    await expect(page.getByRole("status")).toContainText("Invitation created.");
    let invitation = page.locator(".invitation-row").filter({ hasText: "Invite link 1" });
    await expect(invitation.getByRole("button", { name: "Copy link" })).toBeVisible();
    await expect(page.locator('input[value*="#invite="]')).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("#invite=");
    await invitation.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByRole("status")).toContainText("Invitation link copied.");
    expect(
      await page.evaluate(
        () => (window as Window & { __invitationCopyValid?: boolean }).__invitationCopyValid,
      ),
    ).toBe(true);

    await page.reload();
    await chooseSettingsTopic(page, "People & access");
    invitation = page.locator(".invitation-row").filter({ hasText: "Invite link 1" });
    await expect(invitation).toContainText("Pending");
    await expect(invitation.getByRole("button", { name: "Copy link" })).toHaveCount(0);

    await invitation.getByRole("button", { name: "Regenerate" }).click();
    await expect(page.getByRole("status")).toContainText("New invitation link created.");
    invitation = page.locator(".invitation-row").filter({ hasText: "Invite link 1" });
    await expect(invitation.getByRole("button", { name: "Copy link" })).toBeVisible();
    await expect(page.locator('input[value*="#invite="]')).toHaveCount(0);
    await invitation.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByRole("status")).toContainText("Invitation link copied.");

    await invitation.getByRole("button", { name: "Revoke" }).click();
    await expect(invitation).toContainText("Revoked");
    await expect(invitation.getByRole("button", { name: "Copy link" })).toHaveCount(0);
    await expect(invitation.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  });

  test("member remains isolated and can navigate account settings on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "account-member", memberPassword);
    await openSettings(page);

    const forbidden = await page.evaluate(async () => {
      const response = await fetch("/api/v1/admin/users");
      return response.status;
    });
    expect(forbidden).toBe(403);

    await expect(
      page.getByRole("button", { name: "People & access", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("More settings topics").locator('option[value="people"]'),
    ).toHaveCount(0);

    await page.getByLabel("More settings topics").selectOption("account");
    await expect(page.getByRole("heading", { name: "My account", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
    const mobileProfile = await page.locator(".profile-card").boundingBox();
    expect(mobileProfile).not.toBeNull();
    expect(mobileProfile!.x).toBeGreaterThanOrEqual(0);
    expect(mobileProfile!.x + mobileProfile!.width).toBeLessThanOrEqual(390);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
});
