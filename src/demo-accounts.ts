import { hash } from "@node-rs/argon2";
import type { AppConfig } from "./config.js";
import type { JobStore } from "./db.js";

export async function ensureDemoAccounts(store: JobStore, config: AppConfig) {
  for (const account of config.demoAccounts) {
    store.upsertDemoUser(
      account.username,
      await hash(account.password),
      account.role,
    );
  }
}
