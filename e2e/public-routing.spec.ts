import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";

// Own a disposable server; E2E_BASE_URL disables the shared QA server/build.
let root: string;
let baseUrl: string;
let app: ReturnType<typeof buildApp>;
let store: JobStore;
let adminCookie: string;
const username = "routing-admin";
const password = "synthetic-routing-password";

test.beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-e2e-routing-"));
  await mkdir(path.join(root, "data"));
  const config = testConfig(root);
  // Synthetic advertised issuer; browser traffic uses the ephemeral listener.
  config.appUrl = "http://127.0.0.1";
  store = new JobStore(config.databasePath);
  app = buildApp(config, store, new EventHub());
  baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });
  const setup = await app.inject({ method: "POST", url: "/api/auth/setup", payload: {
    username, password, administratorAcknowledged: true,
  } });
  expect(setup.statusCode).toBe(201);
  adminCookie = String(setup.headers["set-cookie"]).split(";")[0]!;
});

test.afterAll(async () => {
  await app.close();
  store.close();
  await rm(root, { recursive: true, force: true });
});

async function login(page: Page) {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

test("public session links remain usable offline and open app when signed in", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.abort());
  await page.goto(`${baseUrl}/`);
  const links = page.locator("[data-session-link]");
  expect(await links.count()).toBeGreaterThan(0);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("href", "/login");
    await expect(link).toHaveText("Sign in");
  }
  await page.unroute("**/api/auth/session");
  await page.goto(`${baseUrl}/login`);
  await login(page);
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  await page.goto(`${baseUrl}/`);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("href", "/app");
    await expect(link).toHaveText("Open app");
  }
  await links.first().click();
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
});

test("legacy capture bookmark survives rejected login and returns to its dialog", async ({ page }) => {
  await page.goto(`${baseUrl}/?capture=1`);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/app?capture=1");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-fixture-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Incorrect username or password.");
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/app?capture=1");
  await login(page);
  await expect(page).toHaveURL(`${baseUrl}/app?capture=1`);
  await expect(page.getByRole("dialog", { name: "Capture a post" })).toBeVisible();
});

test("legacy tab and job bookmark stays inside app after sign-in", async ({ page }) => {
  await page.goto(`${baseUrl}/?tab=activity&job=missing-fixture-job`);
  await login(page);
  await expect(page).toHaveURL(`${baseUrl}/app?tab=activity&job=missing-fixture-job`);
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
});

test("unsafe post-login destination falls back to private app", async ({ page }) => {
  await page.goto(`${baseUrl}/login?${new URLSearchParams({ returnTo: "//outside.invalid/app" })}`);
  await login(page);
  await expect(page).toHaveURL(`${baseUrl}/app`);
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
});

for (const route of ["/", "/login"]) {
  test(`invitation at ${route} reaches registration and removes fragment without URL leakage`, async ({ page }) => {
    const invitation = await app.inject({ method: "POST", url: "/api/v1/admin/invitations", headers: { cookie: adminCookie }, payload: {} });
    expect(invitation.statusCode).toBe(201);
    const fragment = new URL(invitation.json().invitationUrl).hash;
    const token = new URLSearchParams(fragment.slice(1)).get("invite")!;
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(`${baseUrl}${route}${fragment}`);
    await expect(page.getByRole("heading", { name: "Join this private archive" })).toBeVisible();
    await expect(page).toHaveURL(`${baseUrl}/login`);
    expect(requests.every((url) => !url.includes(token))).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });
}

test("OAuth login resumes exact authorization request at consent", async ({ page }) => {
  const registration = await app.inject({ method: "POST", url: "/oauth/register", payload: {
    client_name: "Synthetic routing client", redirect_uris: ["https://client.invalid/callback"],
  } });
  expect(registration.statusCode).toBe(201);
  const metadata = (await app.inject("/.well-known/oauth-protected-resource")).json();
  const fields = {
    response_type: "code", client_id: registration.json().client_id as string,
    redirect_uri: "https://client.invalid/callback", scope: "knowledge:read",
    state: "synthetic state & continuation", code_challenge_method: "S256",
    code_challenge: createHash("sha256").update("v".repeat(64)).digest("base64url"),
    resource: metadata.resource as string,
  };
  const destination = `/oauth/authorize?${new URLSearchParams(fields)}`;
  await page.goto(`${baseUrl}${destination}`);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(destination);
  await login(page);
  await expect(page).toHaveURL(`${baseUrl}${destination}`);
  await expect(page.getByRole("heading", { name: "Connect Synthetic routing client?" })).toBeVisible();
  for (const [name, value] of Object.entries(fields)) {
    await expect(page.locator(`input[name="${name}"]`)).toHaveValue(value);
  }
});

test("expired session redirects API-driven navigation and can resume after login", async ({ page, context }) => {
  await page.goto(`${baseUrl}/login`);
  await login(page);
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  await page.evaluate(() => { window.location.hash = "source"; });
  await context.clearCookies();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/app?tab=activity#source");
  await login(page);
  await expect(page).toHaveURL(`${baseUrl}/app?tab=activity#source`);
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
});

test("logout leaves private app and prevents browser Back from restoring its session", async ({ page }) => {
  await page.goto(`${baseUrl}/login`);
  await login(page);
  await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(`${baseUrl}/login`);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/login");
  expect((await page.request.get(`${baseUrl}/api/auth/session`)).status()).toBe(200);
  expect(await (await page.request.get(`${baseUrl}/api/auth/session`)).json()).toEqual({ authenticated: false });
});
