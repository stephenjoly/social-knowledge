import { createHash, randomUUID } from "node:crypto";
import {
  appendFile,
  link,
  lstat,
  mkdir,
  readFile,
  realpath,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { z } from "zod";
import type {
  JobStore,
  ThumbnailBackfillCandidate,
  ThumbnailBackfillIssue,
} from "./db.js";
import { videoFrameArgs } from "./video-frames.js";

type CommandRunner = (
  command: string,
  args: string[],
) => Promise<{ stdout: string }>;

export type ThumbnailBackfillFailure = {
  captureId: string;
  videoAssetId: string | null;
  reason: string;
};

export type ThumbnailBackfillSummary = {
  candidates: number;
  valid: number;
  adoptable: number;
  committed: number;
  adopted: number;
  skipped: number;
  failed: number;
  issues: ThumbnailBackfillIssue[];
  failures: ThumbnailBackfillFailure[];
  manifestPath: string | null;
};

type CandidateContext = {
  captureId: string;
  videoAssetId: string;
  assetId: string;
  videoPath: string;
  thumbnailPath: string;
  temporaryPath: string;
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

export class ThumbnailBackfillAbort extends Error {
  constructor(
    readonly reason: string,
    readonly manifestPath: string,
    readonly captureId: string | null,
  ) {
    super(reason);
    this.name = "ThumbnailBackfillAbort";
  }
}

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

async function lstatIfExists(filePath: string) {
  try {
    return await lstat(filePath);
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

  async dryRun(): Promise<ThumbnailBackfillSummary> {
    const audit = this.store.thumbnailBackfillAudit();
    const failures: ThumbnailBackfillFailure[] = [];
    let valid = 0;
    let adoptable = 0;
    for (const candidate of audit.candidates) {
      try {
        const existingThumbnail = await this.inspectCandidate(candidate);
        valid += 1;
        if (existingThumbnail) adoptable += 1;
      } catch (error) {
        failures.push(this.failure(candidate, error));
      }
    }
    return this.summary({
      candidates: audit.candidates.length,
      valid,
      adoptable,
      issues: audit.issues,
      failures,
      manifestPath: null,
    });
  }

  async apply(): Promise<ThumbnailBackfillSummary> {
    const audit = this.store.thumbnailBackfillAudit();
    await mkdir(this.backupsDir, { recursive: true });
    const manifestPath = path.join(
      this.backupsDir,
      `thumbnail-backfill-${new Date().toISOString().replaceAll(/[:.]/g, "")}.jsonl`,
    );
    await this.append(manifestPath, {
      event: "run",
      at: new Date().toISOString(),
      mode: "apply",
      candidates: audit.candidates.length,
      issues: audit.issues,
    });
    if (audit.issues.length > 0) {
      const issue = audit.issues[0]!;
      throw new ThumbnailBackfillAbort(
        issue.reason,
        manifestPath,
        issue.captureId,
      );
    }

    let committed = 0;
    let adopted = 0;
    let skipped = 0;
    const failures: ThumbnailBackfillFailure[] = [];
    for (const candidate of audit.candidates) {
      const context = this.context(candidate);
      try {
        const result = await this.applyCandidate(context, manifestPath);
        if (result.status === "committed") {
          committed += 1;
          if (!result.entry.createdFile) adopted += 1;
        } else skipped += 1;
        await this.append(manifestPath, {
          ...result.entry,
          event: result.status,
          at: new Date().toISOString(),
          eventOriginal: result.entry.event,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await this.append(manifestPath, {
          event: "failed",
          at: new Date().toISOString(),
          captureId: context.captureId,
          videoAssetId: context.videoAssetId,
          assetId: context.assetId,
          videoPath: context.videoPath,
          thumbnailPath: context.thumbnailPath,
          createdFile: false,
          sizeBytes: null,
          sha256: null,
          error: reason,
        });
        if (error instanceof UnsafeThumbnailConflict)
          throw new ThumbnailBackfillAbort(
            reason,
            manifestPath,
            context.captureId,
          );
        failures.push({
          captureId: context.captureId,
          videoAssetId: context.videoAssetId,
          reason,
        });
      }
    }
    return this.summary({
      candidates: audit.candidates.length,
      valid: audit.candidates.length - failures.length,
      adoptable: adopted,
      committed,
      adopted,
      skipped,
      issues: [],
      failures,
      manifestPath,
    });
  }

  async rollback(manifestPath: string): Promise<ThumbnailBackfillSummary> {
    const prepared = await this.readPrepared(manifestPath);
    let committed = 0;
    let skipped = 0;
    const failures: ThumbnailBackfillFailure[] = [];
    for (const entry of [...prepared.values()].reverse()) {
      try {
        const video = await lstatIfExists(entry.videoPath);
        if (!video || video.isSymbolicLink() || !video.isFile())
          throw new UnsafeThumbnailConflict(
            "thumbnail_backfill_video_path_unsafe",
          );
        await this.assertSafePath(entry.videoPath, true);
        const thumbnail = await lstatIfExists(entry.thumbnailPath);
        if (thumbnail) {
          if (thumbnail.isSymbolicLink() || !thumbnail.isFile())
            throw new UnsafeThumbnailConflict(
              "thumbnail_backfill_rollback_target_unsafe",
            );
          if (
            entry.createdFile &&
            (thumbnail.size !== entry.sizeBytes ||
              (await checksum(entry.thumbnailPath)) !== entry.sha256)
          )
            throw new UnsafeThumbnailConflict(
              "thumbnail_backfill_rollback_checksum_mismatch",
            );
        }
        await this.assertSafePath(entry.thumbnailPath, false);

        const removal = this.store.removeBackfilledThumbnail({
          captureId: entry.captureId,
          assetId: entry.assetId,
          path: entry.thumbnailPath,
          sizeBytes: entry.sizeBytes,
        });
        let removedFile = false;
        if (
          thumbnail &&
          entry.createdFile &&
          this.store.assetPathReferenceCount(entry.thumbnailPath) === 0
        ) {
          await unlink(entry.thumbnailPath);
          removedFile = true;
        }
        if (removal === "missing" && !removedFile) skipped += 1;
        else committed += 1;
        await this.append(manifestPath, {
          ...entry,
          event:
            removal === "missing" && !removedFile
              ? "rollback_skipped"
              : "rolled_back",
          at: new Date().toISOString(),
          eventOriginal: entry.event,
          removedAsset: removal === "removed",
          removedFile,
        });
      } catch (error) {
        failures.push({
          captureId: entry.captureId,
          videoAssetId: entry.videoAssetId,
          reason: error instanceof Error ? error.message : String(error),
        });
        await this.append(manifestPath, {
          event: "rollback_failed",
          at: new Date().toISOString(),
          captureId: entry.captureId,
          videoAssetId: entry.videoAssetId,
          assetId: entry.assetId,
          videoPath: entry.videoPath,
          thumbnailPath: entry.thumbnailPath,
          createdFile: entry.createdFile,
          sizeBytes: entry.sizeBytes,
          sha256: entry.sha256,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return this.summary({
      candidates: prepared.size,
      valid: prepared.size - failures.length,
      adoptable: 0,
      committed,
      adopted: 0,
      skipped,
      issues: [],
      failures,
      manifestPath,
    });
  }

  private async applyCandidate(
    context: CandidateContext,
    manifestPath: string,
  ) {
    const existingThumbnail = await this.inspectContext(context);
    let preparedPath = context.thumbnailPath;
    let publishedFile = false;
    let assetInserted = false;
    let prepared: PreparedEntry | null = null;
    try {
      if (!existingThumbnail) {
        try {
          await this.runCommand(
            "ffmpeg",
            videoFrameArgs(context.videoPath, context.temporaryPath, 1),
          );
          await this.validateVisualMedia(context.temporaryPath);
          preparedPath = context.temporaryPath;
        } catch (error) {
          await unlink(context.temporaryPath).catch(() => undefined);
          throw error;
        }
      }
      const thumbnailStat = await stat(preparedPath);
      if (!thumbnailStat.isFile() || thumbnailStat.size <= 0)
        throw new Error("thumbnail_backfill_empty_output");
      prepared = {
        event: "prepared",
        at: new Date().toISOString(),
        captureId: context.captureId,
        videoAssetId: context.videoAssetId,
        assetId: context.assetId,
        videoPath: context.videoPath,
        thumbnailPath: context.thumbnailPath,
        sizeBytes: thumbnailStat.size,
        sha256: await checksum(preparedPath),
        createdFile: !existingThumbnail,
      };
      await this.append(manifestPath, prepared);

      if (prepared.createdFile) {
        try {
          await link(context.temporaryPath, context.thumbnailPath);
          publishedFile = true;
        } catch (error) {
          throw new UnsafeThumbnailConflict(
            error instanceof Error
              ? `thumbnail_backfill_no_clobber_failed:${error.message}`
              : "thumbnail_backfill_no_clobber_failed",
          );
        } finally {
          await unlink(context.temporaryPath).catch(() => undefined);
        }
      }
      let insertion: "added" | "already_present";
      try {
        insertion = this.store.addBackfilledThumbnail({
          captureId: context.captureId,
          videoAssetId: context.videoAssetId,
          assetId: context.assetId,
          path: context.thumbnailPath,
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
      if (insertion === "already_present") {
        if (publishedFile) await this.unlinkIfUnreferenced(prepared);
        return { status: "skipped" as const, entry: prepared };
      }
      assetInserted = true;
      return { status: "committed" as const, entry: prepared };
    } catch (error) {
      await unlink(context.temporaryPath).catch(() => undefined);
      if (publishedFile && prepared && !assetInserted)
        await this.unlinkIfUnreferenced(prepared);
      throw error;
    }
  }

  private context(candidate: ThumbnailBackfillCandidate): CandidateContext {
    const assetId = randomUUID();
    const thumbnailPath = path.join(
      path.dirname(candidate.video.path),
      "thumbnail.jpg",
    );
    return {
      captureId: candidate.captureId,
      videoAssetId: candidate.video.id,
      assetId,
      videoPath: candidate.video.path,
      thumbnailPath,
      temporaryPath: path.join(
        path.dirname(candidate.video.path),
        `.thumbnail-${assetId}.tmp.jpg`,
      ),
    };
  }

  private inspectCandidate(candidate: ThumbnailBackfillCandidate) {
    return this.inspectContext(this.context(candidate));
  }

  private async inspectContext(context: CandidateContext) {
    const video = await lstatIfExists(context.videoPath);
    if (!video || video.isSymbolicLink() || !video.isFile())
      throw new UnsafeThumbnailConflict("thumbnail_backfill_video_path_unsafe");
    await this.assertSafePath(context.videoPath, true);
    await this.validateVisualMedia(context.videoPath);
    const existingThumbnail = await lstatIfExists(context.thumbnailPath);
    if (existingThumbnail) {
      if (existingThumbnail.isSymbolicLink() || !existingThumbnail.isFile())
        throw new UnsafeThumbnailConflict("thumbnail_backfill_target_unsafe");
      await this.assertSafePath(context.thumbnailPath, false);
      try {
        await this.validateVisualMedia(context.thumbnailPath);
      } catch {
        throw new UnsafeThumbnailConflict("thumbnail_backfill_orphan_invalid");
      }
    } else await this.assertSafePath(context.thumbnailPath, false);
    return existingThumbnail;
  }

  private async readPrepared(manifestPath: string) {
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
    return prepared;
  }

  private async assertSafePath(filePath: string, mustExist: boolean) {
    const relative = path.relative(
      path.resolve(this.mediaDir),
      path.resolve(filePath),
    );
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new UnsafeThumbnailConflict(
        "thumbnail_backfill_path_outside_media_dir",
      );
    const canonicalMediaDir = await realpath(this.mediaDir);
    let canonicalPath: string;
    try {
      canonicalPath = await realpath(filePath);
    } catch (error) {
      if (
        !mustExist &&
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        canonicalPath = path.join(
          await realpath(path.dirname(filePath)),
          path.basename(filePath),
        );
      } else {
        throw error;
      }
    }
    const canonicalRelative = path.relative(canonicalMediaDir, canonicalPath);
    if (
      canonicalRelative.startsWith("..") ||
      path.isAbsolute(canonicalRelative)
    )
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

  private async unlinkIfUnreferenced(entry: PreparedEntry) {
    const file = await lstatIfExists(entry.thumbnailPath);
    if (!file) return;
    if (
      file.isSymbolicLink() ||
      !file.isFile() ||
      file.size !== entry.sizeBytes ||
      (await checksum(entry.thumbnailPath)) !== entry.sha256
    )
      throw new UnsafeThumbnailConflict("thumbnail_backfill_cleanup_mismatch");
    if (this.store.assetPathReferenceCount(entry.thumbnailPath) === 0)
      await unlink(entry.thumbnailPath);
  }

  private failure(
    candidate: ThumbnailBackfillCandidate,
    error: unknown,
  ): ThumbnailBackfillFailure {
    return {
      captureId: candidate.captureId,
      videoAssetId: candidate.video.id,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  private append(manifestPath: string, entry: Record<string, unknown>) {
    return appendFile(manifestPath, `${JSON.stringify(entry)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  private summary(
    input: Partial<ThumbnailBackfillSummary> &
      Pick<
        ThumbnailBackfillSummary,
        | "candidates"
        | "valid"
        | "adoptable"
        | "issues"
        | "failures"
        | "manifestPath"
      >,
  ): ThumbnailBackfillSummary {
    return {
      committed: 0,
      adopted: 0,
      skipped: 0,
      failed: input.failures.length + input.issues.length,
      ...input,
    };
  }
}
