import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";

const root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-qa-"));
const config = testConfig(root);
config.appUrl = "http://127.0.0.1:4185";
await mkdir(path.dirname(config.databasePath), { recursive: true });
const store = new JobStore(config.databasePath);
const app = buildApp(config, store, new EventHub());
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await app.close();
  store.close();
  await rm(root, { recursive: true, force: true });
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => { void close().then(() => process.exit(0)); });
}
try {
  await app.listen({ host: "127.0.0.1", port: 4185 });
} catch (error) {
  await close();
  throw error;
}
