import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "../test/helpers.js";
import { seedUiFixture } from "./ui-fixture.js";
import type { AskService } from "../src/ask.js";

const root = await mkdtemp(path.join(os.tmpdir(), "social-knowledge-qa-"));
const config = testConfig(root);
config.appUrl = "http://127.0.0.1:4185";
await mkdir(path.dirname(config.databasePath), { recursive: true });
const store = new JobStore(config.databasePath);
let syntheticAsk: Pick<AskService, "answer"> | undefined;
if (process.env.E2E_UI_FIXTURE === "true") {
  // The disposable browser server must never reach a real provider, even if a
  // newly added journey accidentally triggers an outbound network boundary.
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    throw new Error(`Synthetic UI fixture blocked outbound fetch to ${new URL(url).origin}`);
  }) as typeof fetch;
  const user = await seedUiFixture(store, config);
  // The existing smoke role enables deterministic streaming/cancel/retry probes.
  store.database.prepare("UPDATE users SET role='smoke' WHERE id=?").run(user.id);
  syntheticAsk = {
    answer: async (input) => {
      const capture = store.listCaptures({ userId: input.userId, limit: 50 })
        .captures.find((item) => item.creator === "lisbonfoodie");
      if (!capture) throw new Error("Synthetic Lisbon capture is missing");
      input.onStatus?.("Searching your archive…");
      await new Promise((resolve) => setTimeout(resolve, 250));
      const answer = "Your Lisbon saves recommend visiting Manteigaria before 10am. [1]";
      input.onDelta(answer);
      const sources = [{
        id: capture.id, citation: 1, title: capture.title, creator: capture.creator,
        platform: capture.platform, synopsis: capture.synopsis ?? "",
        sourceUrl: capture.sourceUrl, breadcrumb: ["Travel", "Lisbon"],
      }];
      store.completeConversationAttempt(
        input.userId, input.conversationId, input.assistantId, answer, sources, true,
      );
      return {
        answer,
        sources,
        sufficient: true,
        diagnostics: {
          action: "search_archive", standaloneQuestion: input.question, terms: ["Lisbon"],
          selected: [], reusedCaptureIds: [], compacted: false,
          compactionFallback: false, estimatedContextTokens: 0,
        },
      };
    },
  };
}
const app = buildApp(config, store, new EventHub(), undefined, undefined, syntheticAsk);
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
