import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "npm run build && npx tsx scripts/qa-server.ts",
    url: "http://127.0.0.1:4185",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4185",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
