import { createHash, randomUUID } from "node:crypto";
import {
  appendFile,
  link,
  mkdir,
  readFile,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { z } from "zod";
import type { JobStore, ThumbnailBackfillCandidate } from "./db.js";

type CommandRunner = (
  command: string,
  args: string[],
) => Promise<{ stdout: string }>;

type BackfillSummary = {
  candidates: number;
  committed: number;
  skipped: number;
  failed: number;
  manifestPath: string | null;
};

const preparedEntrySchema = z.object({
  event: z.literal("prepared"),
  at: z.string(),
  captureId: z.string().min(1),
  videoAssetId: z.string().min(1),
  assetId: z.string().min(1),
  videoPath: z.string().min(1),
  thumbnailPath: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdFile: z.boolean(),
});

type PreparedEntry = z.infer<typeof preparedEntrySchema>;

class UnsafeThumbnailConflict extends Error {}

const defaultRunner: CommandRunner = async (command, args) => {
  const result = await execa(command, args, { timeout: 10 * 60_000 });
  return { stdout: String(result.stdout) };
};

async function checksum(filePath: string) {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

async function exists(filePath: string) {
  try {
    return await stat(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return null;
    throw error;
  }
}

export class ThumbnailBackfill {
  constructor(
    private readonly store: JobStore,
    private readonly mediaDir: string,
    private readonly backupsDir: string,
    private readonly runCommand: CommandRunner = defaultRunner,
  ) {}

  async dryRun(): Promise<BackfillSummary> {
    const candidates = this.store.thumbnailBackfillCandidates();
    let failed = 0;
    for (const candidate of candidates) {
      try {
        this.assertSafeCandidate(candidate);
        await this.validateVisualMedia(candidate.video.path);
      } catch {
        failed += 1;
      }
    }
    return {
      candidates: candidates.length,
      committed: 0,
      skipped: 0,
      failed,
      manifestPath: null,
    };
  }

  async apply(): Promise<BackfillSummary> {
    const candidates = this.store.thumbnailBackfillCandidates();
    await mkdir(this.backupsDir, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, "");
    const manifestPath = path.join(
      this.backupsDir,
      `thumbnail-backfill-${stamp}.jsonl`,
    );
    await this.append(manifestPath, {
      event: "run",
      at: new Date().toISOString(),
      mode: "apply",
      candidates: candidates.length,
    });

    let committed = 0;
    let skipped = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        const result = await this.applyCandidate(candidate, manifestPath);
        if (result === "committed") committed += 1;
        else skipped += 1;
      } catch (error) {
        failed += 1;
        await this.append(manifestPath, {
          event: "failed",
          at: new Date().toISOString(),
          captureId: candidate.captureId,
          videoAssetId: candidate.video.id,
          videoPath: candidate.video.path,
          error: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof UnsafeThumbnailConflict) throw error;
      }
    }

    return {
      candidates: candidates.length,
      committed,
      skipped,
      failed,
      manifestPath,
    };
  }

  async rollback(manifestPath: string): Promise<BackfillSummary> {
    const body = await readFile(manifestPath, "utf8");
    const prepared = new Map<string, PreparedEntry>();
    for (const [index, line] of body.split("\n").entries()) {
      if (!line.trim()) continue;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new UnsafeThumbnailConflict(
          `thumbnail_backfill_manifest_invalid_json_line_${index + 1}`,
        );
      }
      if (
        value &&
        typeof value === "object" &&
        "event" in value &&
        value.event === "prepared"
      ) {
        const parsed = preparedEntrySchema.safeParse(value);
        if (!parsed.success)
          throw new UnsafeThumbnailConflict(
            `thumbnail_backfill_manifest_invalid_prepared_line_${index + 1}`,
          );
        prepared.set(parsed.data.assetId, parsed.data);
      }
    }

    let committed = 0;
    let skipped = 0;
    let failed = 0;
    for (const entry of [...prepared.values()].reverse()) {
      try {
        this.assertWithinMedia(entry.videoPath);
        this.assertWithinMedia(entry.thumbnailPath);
        const thumbnail = await exists(entry.thumbnailPath);
        if (thumbnail && entry.createdFile) {
          if (
            thumbnail.size !== entry.sizeBytes ||
            (await checksum(entry.thumbnailPath)) !== entry.sha256
          )
            throw new UnsafeThumbnailConflict(
              "thumbnail_backfill_rollback_checksum_mismatch",
            );
        }
        const result = this.store.removeBackfilledThumbnail({
          captureId: entry.captureId,
          assetId: entry.assetId,
          path: entry.thumbnailPath,
          sizeBytes: entry.sizeBytes,
        });
        if (result === "missing") {
          skipped += 1;
          await this.append(manifestPath, {
            ...entry,
            event: "rollback_skipped",
            at: new Date().toISOString(),
            eventOriginal: entry.event,
            reason: "asset_missing",
          });
          continue;
        }
        if (thumbnail && entry.createdFile) await unlink(entry.thumbnailPath);
        committed += 1;
        await this.append(manifestPath, {
          ...entry,
          event: "rolled_back",
          at: new Date().toISOString(),
          eventOriginal: entry.event,
        });
      } catch (error) {
        failed += 1;
        await this.append(manifestPath, {
          event: "rollback_failed",
          at: new Date().toISOString(),
          captureId: entry.captureId,
          assetId: entry.assetId,
          thumbnailPath: entry.thumbnailPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return {
      candidates: prepared.size,
      committed,
      skipped,
      failed,
      manifestPath,
    };
  }

  private async applyCandidate(
    candidate: ThumbnailBackfillCandidate,
    manifestPath: string,
  ): Promise<"committed" | "skipped"> {
    this.assertSafeCandidate(candidate);
    await this.validateVisualMedia(candidate.video.path);
    const assetId = randomUUID();
    const thumbnailPath = path.join(
      path.dirname(candidate.video.path),
      "thumbnail.jpg",
    );
    const temporaryPath = path.join(
      path.dirname(candidate.video.path),
      `.thumbnail-${assetId}.tmp.jpg`,
    );
    this.assertWithinMedia(thumbnailPath);

    let publishedFile = false;
    let assetInserted = false;
    let prepared: PreparedEntry | null = null;
    const existingThumbnail = await exists(thumbnailPath);
    try {
      let preparedPath: string;
      if (existingThumbnail) {
        if (!existingThumbnail.isFile())
          throw new UnsafeThumbnailConflict(
            "thumbnail_backfill_target_not_regular_file",
          );
        await this.validateVisualMedia(thumbnailPath);
        preparedPath = thumbnailPath;
      } else {
        try {
          await this.runCommand("ffmpeg", [
            "-hide_banner",
            "-loglevel",
            "error",
            "-n",
            "-i",
            candidate.video.path,
            "-vf",
            "fps=1/15,scale='min(1280,iw)':-2",
            "-frames:v",
            "1",
            temporaryPath,
          ]);
          await this.validateVisualMedia(temporaryPath);
          preparedPath = temporaryPath;
        } catch (error) {
          await unlink(temporaryPath).catch(() => undefined);
          throw error;
        }
      }

      const thumbnailStat = await stat(preparedPath);
      if (!thumbnailStat.isFile() || thumbnailStat.size <= 0)
        throw new Error("thumbnail_backfill_empty_output");
      prepared = {
        event: "prepared",
        at: new Date().toISOString(),
        captureId: candidate.captureId,
        videoAssetId: candidate.video.id,
        assetId,
        videoPath: candidate.video.path,
        thumbnailPath,
        sizeBytes: thumbnailStat.size,
        sha256: await checksum(preparedPath),
        createdFile: !existingThumbnail,
      };
      await this.append(manifestPath, prepared);

      if (prepared.createdFile) {
        try {
          await link(temporaryPath, thumbnailPath);
          publishedFile = true;
        } catch (error) {
          throw new UnsafeThumbnailConflict(
            error instanceof Error
              ? `thumbnail_backfill_no_clobber_failed:${error.message}`
              : "thumbnail_backfill_no_clobber_failed",
          );
        } finally {
          await unlink(temporaryPath).catch(() => undefined);
        }
      }

      let result: "added" | "already_present";
      try {
        result = this.store.addBackfilledThumbnail({
          captureId: candidate.captureId,
          videoAssetId: candidate.video.id,
          assetId,
          path: thumbnailPath,
          mimeType: "image/jpeg",
          sizeBytes: prepared.sizeBytes,
        });
      } catch (error) {
        throw new UnsafeThumbnailConflict(
          error instanceof Error
            ? error.message
            : "thumbnail_backfill_database_conflict",
        );
      }
      if (result === "already_present") {
        if (publishedFile) await this.unlinkIfMatching(prepared);
        await this.append(manifestPath, {
          ...prepared,
          event: "skipped",
          at: new Date().toISOString(),
          eventOriginal: prepared.event,
          reason: "thumbnail_already_present",
        });
        return "skipped";
      }
      assetInserted = true;
      await this.append(manifestPath, {
        ...prepared,
        event: "committed",
        at: new Date().toISOString(),
        eventOriginal: prepared.event,
      });
      return "committed";
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      if (publishedFile && prepared && !assetInserted)
        await this.unlinkIfMatching(prepared);
      throw error;
    }
  }

  private assertSafeCandidate(candidate: ThumbnailBackfillCandidate) {
    if (candidate.video.kind !== "video")
      throw new UnsafeThumbnailConflict(
        "thumbnail_backfill_asset_is_not_video",
      );
    this.assertWithinMedia(candidate.video.path);
  }

  private assertWithinMedia(filePath: string) {
    const relative = path.relative(
      path.resolve(this.mediaDir),
      path.resolve(filePath),
    );
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new UnsafeThumbnailConflict(
        "thumbnail_backfill_path_outside_media_dir",
      );
  }

  private async validateVisualMedia(filePath: string) {
    const result = await this.runCommand("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      filePath,
    ]);
    const parsed = z
      .object({
        streams: z
          .array(
            z.object({
              width: z.number().int().positive(),
              height: z.number().int().positive(),
            }),
          )
          .min(1),
      })
      .safeParse(JSON.parse(result.stdout));
    if (!parsed.success)
      throw new Error("thumbnail_backfill_visual_validation_failed");
  }

  private async unlinkIfMatching(entry: PreparedEntry) {
    const file = await exists(entry.thumbnailPath);
    if (!file) return;
    if (
      file.size !== entry.sizeBytes ||
      (await checksum(entry.thumbnailPath)) !== entry.sha256
    )
      throw new UnsafeThumbnailConflict(
        "thumbnail_backfill_cleanup_checksum_mismatch",
      );
    await unlink(entry.thumbnailPath);
  }

  private async append(manifestPath: string, entry: Record<string, unknown>) {
    await appendFile(manifestPath, `${JSON.stringify(entry)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}
