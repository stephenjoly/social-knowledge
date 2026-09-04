import { mkdir } from "node:fs/promises";
import OpenAI from "openai";
import { Analyzer } from "./analyzer.js";
import { buildApp } from "./app.js";
import { MediaArchive } from "./archive.js";
import { loadConfig } from "./config.js";
import { JobStore } from "./db.js";
import { MediaDownloader } from "./downloader.js";
import { MediaProcessor } from "./media-processor.js";
import { Transcriber } from "./transcriber.js";
import { VaultWriter } from "./vault-writer.js";
import { JobWorker } from "./worker.js";
import { EventHub } from "./events.js";
import { Notifier } from "./notifier.js";
import { migrateLegacyCaptures } from "./legacy.js";
import { Translator } from "./translator.js";
import { TitleGenerator } from "./title-generator.js";
import { LibraryPublisher } from "./library-publisher.js";

const config = loadConfig();
await Promise.all([
  mkdir(config.dataDir, { recursive: true }),
  mkdir(config.workDir, { recursive: true }),
  mkdir(config.vaultDir, { recursive: true }),
  mkdir(config.mediaDir, { recursive: true }),
  mkdir(config.exportDir, { recursive: true }),
]);

const store = new JobStore(config.databasePath);
await migrateLegacyCaptures(store, config);
if (store.userCount() === 0 && config.bootstrapAdminPasswordHash)
  store.createUser(
    config.bootstrapAdminUsername,
    config.bootstrapAdminPasswordHash,
  );
const events = new EventHub();
const app = buildApp(config, store, events);
const openai = new OpenAI({ apiKey: config.openAiApiKey });
const worker = new JobWorker(
  config,
  {
    store,
    downloader: new MediaDownloader(config),
    processor: new MediaProcessor(),
    transcriber: new Transcriber(openai, config),
    translator: new Translator(openai, config),
    titleGenerator: new TitleGenerator(openai, config),
    analyzer: new Analyzer(openai, config),
    archive: new MediaArchive(config),
    vaultWriter: new VaultWriter(config.vaultDir),
    events,
    notifier: new Notifier(config),
    libraryPublisher: new LibraryPublisher(store, config.vaultDir),
  },
  app.log,
);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await worker.stop();
  await app.close();
  store.close();
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: config.host, port: config.port });
worker.start();
