import path from "node:path";
import { loadConfig } from "./config.js";
import { JobStore } from "./db.js";
import {
  ThumbnailBackfill,
  ThumbnailBackfillAbort,
} from "./thumbnail-backfill.js";

const args = process.argv.slice(2);
const mode = args[0];
if (
  !["--dry-run", "--apply", "--rollback"].includes(mode ?? "") ||
  (mode === "--rollback" && args.length !== 2) ||
  (mode !== "--rollback" && args.length !== 1)
) {
  console.error(
    "Usage: thumbnail-backfill --dry-run | --apply | --rollback <manifest>",
  );
  process.exitCode = 2;
} else {
  const config = loadConfig();
  const store = new JobStore(config.databasePath);
  try {
    const maintenance = new ThumbnailBackfill(
      store,
      config.mediaDir,
      path.join(config.dataDir, "backups"),
    );
    try {
      const summary =
        mode === "--dry-run"
          ? await maintenance.dryRun()
          : mode === "--apply"
            ? await maintenance.apply()
            : await maintenance.rollback(path.resolve(args[1]!));
      console.log(JSON.stringify(summary));
      if (summary.failed > 0) process.exitCode = 1;
    } catch (error) {
      if (!(error instanceof ThumbnailBackfillAbort)) throw error;
      console.error(
        JSON.stringify({
          status: "aborted",
          reason: error.reason,
          captureId: error.captureId,
          manifestPath: error.manifestPath,
        }),
      );
      process.exitCode = 1;
    }
  } finally {
    store.close();
  }
}
