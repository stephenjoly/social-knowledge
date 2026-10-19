import { spawn } from "node:child_process";
import { fixtureAccount } from "./ui-fixture.js";

// Runs all authenticated journeys against the disposable synthetic QA server.
// No provider requests or production credentials are needed.
if (process.env.E2E_BASE_URL)
  throw new Error("Unset E2E_BASE_URL: UI fixture tests require the local disposable server.");
const child = spawn("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    E2E_UI_FIXTURE: "true",
    E2E_USERNAME: fixtureAccount.username,
    E2E_PASSWORD: fixtureAccount.password,
  },
});
child.on("error", () => { process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
