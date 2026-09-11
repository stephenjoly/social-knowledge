import { createHash, randomUUID } from "node:crypto";
import {
  link,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { execa } from "execa";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobStore } from "../src/db.js";
import {
  ThumbnailBackfill,
  ThumbnailBackfillAbort,
} from "../src/thumbnail-backfill.js";

const roots: string[] = [];
const stores: JobStore[] = [];
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

afterEach(async () => {
  stores.splice(0).forEach((store) => store.close());
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "thumbnail-backfill-"));
  roots.push(root);
  const mediaDir = path.join(root, "media");
  const backupsDir = path.join(root, "data", "backups");
  const store = new JobStore(path.join(root, "catalog.sqlite3"));
  stores.push(store);
  const ownerUserId = store.createUser("thumbnail-owner", "hash").id;
  const { job } = store.createOrGet({
    ownerUserId,
    sourceUrl: "https://www.facebook.com/reel/thumbnail-test/",
    normalizedUrl: "https://www.facebook.com/reel/thumbnail-test",
    sourceHash: "thumbnail-test",
  });
  const captureDir = path.join(mediaDir, "2026", "09", job.id);
  await mkdir(captureDir, { recursive: true });
  const videoPath = path.join(captureDir, "video.mp4");
  await writeFile(videoPath, "video-bytes");
  const capture = store.createCapture({
    job,
    sourceType: "video",
    sourceId: "thumbnail-test",
    platform: "facebook",
    title: "Thumbnail test",
    creator: null,
    creatorUrl: null,
    description: null,
    transcript: "Transcript",
    sourceLanguage: "en",
    translatedTranscript: null,
    translationLanguage: null,
    comments: [],
    analysis: {
      title: "Thumbnail test",
      synopsis: "Synopsis",
      whyUseful: null,
      takeaways: [],
      topics: [],
      entities: [],
      recommendations: [],
      claimsNeedingVerification: [],
      evidence: [],
      classification: {
        primaryDomain: "Other",
        country: null,
        city: null,
        subcategory: "Other",
        secondaryTopics: [],
        confidence: 0.5,
      },
    },
    publishedAt: null,
    durationSeconds: 10,
    notePath: "Social Knowledge/thumbnail-test.md",
    assets: [
      {
        kind: "video",
        path: videoPath,
        mimeType: "video/mp4",
        sizeBytes: 11,
        position: 0,
      },
    ],
  })!;
  const video = capture.assets.find((asset) => asset.kind === "video")!;
  return { root, mediaDir, backupsDir, store, capture, video, captureDir };
}

const validProbe = JSON.stringify({
  streams: [{ width: 1080, height: 1920, codec_name: "mjpeg" }],
});

function successfulRunner() {
  return vi.fn(async (command: string, args: string[]) => {
    if (command === "ffmpeg") await writeFile(args.at(-1)!, "jpeg-bytes");
    return { stdout: validProbe };
  });
}

async function crashManifest(
  item: Awaited<ReturnType<typeof fixture>>,
  stage: "published" | "prepared" | "linked" = "published",
  legacy = false,
) {
  const thumbnailPath = path.join(item.captureDir, "thumbnail.jpg");
  const assetId = randomUUID();
  const temporaryPath = path.join(
    item.captureDir,
    `.thumbnail-${assetId}.tmp.jpg`,
  );
  const bytes = "crash-jpeg";
  if (stage === "published") await writeFile(thumbnailPath, bytes);
  else {
    await writeFile(temporaryPath, bytes);
    if (stage === "linked") await link(temporaryPath, thumbnailPath);
  }
  await mkdir(item.backupsDir, { recursive: true });
  const manifestPath = path.join(item.backupsDir, "crashed.jsonl");
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      event: "prepared",
      at: new Date().toISOString(),
      captureId: item.capture.id,
      videoAssetId: item.video.id,
      assetId,
      videoPath: item.video.path,
      thumbnailPath,
      ...(legacy ? {} : { temporaryPath }),
      sizeBytes: Buffer.byteLength(bytes),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      createdFile: true,
    })}\n`,
  );
  return { manifestPath, thumbnailPath, temporaryPath };
}

describe("ThumbnailBackfill", () => {
  it.runIf(hasFfmpeg)(
    "creates a real JPEG for a two-second video",
    async () => {
      const item = await fixture();
      await execa("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=320x240:r=10:d=2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        item.video.path,
      ]);
      const service = new ThumbnailBackfill(
        item.store,
        item.mediaDir,
        item.backupsDir,
      );

      await expect(service.apply()).resolves.toMatchObject({
        candidates: 1,
        committed: 1,
        failed: 0,
      });
      const thumbnail = item.store
        .getCapture(item.capture.id)
        ?.assets.find((asset) => asset.kind === "thumbnail");
      expect(thumbnail?.mimeType).toBe("image/jpeg");
      await expect(readFile(thumbnail!.path)).resolves.not.toHaveLength(0);
    },
  );

  it("discovers candidates without writing during dry-run", async () => {
    const item = await fixture();
    const runner = successfulRunner();
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      runner,
    );

    await expect(service.dryRun()).resolves.toMatchObject({
      candidates: 1,
      committed: 0,
      failed: 0,
      manifestPath: null,
    });
    expect(runner.mock.calls.map(([command]) => command)).toEqual(["ffprobe"]);
    expect(item.store.getCapture(item.capture.id)?.assets).toHaveLength(1);
  });

  it("reports captures with missing or duplicate video assets", async () => {
    const missing = await fixture();
    missing.store.database
      .prepare("DELETE FROM assets WHERE capture_id=?")
      .run(missing.capture.id);
    const duplicate = await fixture();
    duplicate.store.database
      .prepare(
        "INSERT INTO assets(id,capture_id,kind,path,mime_type,size_bytes,position) VALUES(?,?,'video',?,'video/mp4',?,1)",
      )
      .run(randomUUID(), duplicate.capture.id, duplicate.video.path, 11);

    expect(missing.store.thumbnailBackfillAudit().issues).toEqual([
      {
        captureId: missing.capture.id,
        reason: "missing_video",
        videoCount: 0,
      },
    ]);
    expect(duplicate.store.thumbnailBackfillAudit().issues).toEqual([
      {
        captureId: duplicate.capture.id,
        reason: "multiple_videos",
        videoCount: 2,
      },
    ]);
  });

  it("aborts apply before mutation when asset topology is invalid", async () => {
    const item = await fixture();
    item.store.database
      .prepare(
        "INSERT INTO assets(id,capture_id,kind,path,mime_type,size_bytes,position) VALUES(?,?,'video',?,'video/mp4',?,1)",
      )
      .run(randomUUID(), item.capture.id, item.video.path, 11);
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      successfulRunner(),
    );

    const error = await service.apply().catch((caught) => caught);
    expect(error).toBeInstanceOf(ThumbnailBackfillAbort);
    expect(error).toMatchObject({
      captureId: item.capture.id,
      reason: "multiple_videos",
    });
    expect(error.manifestPath).toContain(item.backupsDir);
    expect(item.store.getCapture(item.capture.id)?.assets).toHaveLength(2);
  });

  it("generates, journals, inserts, repeats idempotently, and rolls back", async () => {
    const item = await fixture();
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      successfulRunner(),
    );

    const applied = await service.apply();
    expect(applied).toMatchObject({ candidates: 1, committed: 1, failed: 0 });
    expect(applied.manifestPath).not.toBeNull();
    expect(
      item.store
        .getCapture(item.capture.id)
        ?.assets.filter((asset) => asset.kind === "thumbnail"),
    ).toHaveLength(1);
    expect(
      await readFile(path.join(item.captureDir, "thumbnail.jpg"), "utf8"),
    ).toBe("jpeg-bytes");

    await expect(service.apply()).resolves.toMatchObject({
      candidates: 0,
      committed: 0,
    });
    await expect(
      service.rollback(applied.manifestPath!),
    ).resolves.toMatchObject({
      candidates: 1,
      committed: 1,
      failed: 0,
    });
    expect(item.store.getCapture(item.capture.id)?.assets).toHaveLength(1);
    await expect(
      readFile(path.join(item.captureDir, "thumbnail.jpg")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("adopts a valid orphan without deleting it during rollback", async () => {
    const item = await fixture();
    const thumbnailPath = path.join(item.captureDir, "thumbnail.jpg");
    await writeFile(thumbnailPath, "existing-jpeg");
    const runner = successfulRunner();
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      runner,
    );

    const applied = await service.apply();
    expect(runner.mock.calls.some(([command]) => command === "ffmpeg")).toBe(
      false,
    );
    await service.rollback(applied.manifestPath!);
    expect(await readFile(thumbnailPath, "utf8")).toBe("existing-jpeg");
    expect(item.store.getCapture(item.capture.id)?.assets).toHaveLength(1);
  });

  it("reports an invalid orphan during dry-run and aborts apply with its manifest", async () => {
    const item = await fixture();
    await writeFile(path.join(item.captureDir, "thumbnail.jpg"), "invalid");
    const runner = vi.fn(async (_command: string, args: string[]) => {
      if (args.at(-1)?.endsWith("thumbnail.jpg"))
        throw new Error("invalid image");
      return { stdout: validProbe };
    });
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      runner,
    );

    await expect(service.dryRun()).resolves.toMatchObject({
      valid: 0,
      failed: 1,
      failures: [
        {
          captureId: item.capture.id,
          reason: "thumbnail_backfill_orphan_invalid",
        },
      ],
    });
    const error = await service.apply().catch((caught) => caught);
    expect(error).toBeInstanceOf(ThumbnailBackfillAbort);
    expect(error).toMatchObject({
      captureId: item.capture.id,
      reason: "thumbnail_backfill_orphan_invalid",
    });
    expect(error.manifestPath).toContain(item.backupsDir);
  });

  it("rejects thumbnail symlinks", async () => {
    const item = await fixture();
    const outside = path.join(item.root, "outside.jpg");
    await writeFile(outside, "jpeg");
    await symlink(outside, path.join(item.captureDir, "thumbnail.jpg"));
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      successfulRunner(),
    );

    await expect(service.dryRun()).resolves.toMatchObject({
      valid: 0,
      failures: [{ reason: "thumbnail_backfill_target_unsafe" }],
    });
  });

  it.each(["png", "h264"])("rejects an orphan with codec %s", async (codec) => {
    const item = await fixture();
    const thumbnailPath = path.join(item.captureDir, "thumbnail.jpg");
    await writeFile(thumbnailPath, "not-a-jpeg");
    const runner = vi.fn(async (_command: string, args: string[]) => ({
      stdout: JSON.stringify({
        streams: [
          {
            width: 320,
            height: 240,
            codec_name: args.at(-1) === thumbnailPath ? codec : "h264",
          },
        ],
      }),
    }));
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      runner,
    );
    await expect(service.dryRun()).resolves.toMatchObject({
      failed: 1,
      failures: [{ reason: "thumbnail_backfill_orphan_invalid" }],
    });
    await expect(service.apply()).rejects.toMatchObject({
      reason: "thumbnail_backfill_orphan_invalid",
    });
    expect(await readFile(thumbnailPath, "utf8")).toBe("not-a-jpeg");
    expect(item.store.getCapture(item.capture.id)?.assets).toHaveLength(1);
  });

  it("rejects non-JPEG generated output without inserting an asset", async () => {
    const item = await fixture();
    const runner = vi.fn(async (command: string, args: string[]) => {
      if (command === "ffmpeg") await writeFile(args.at(-1)!, "png-bytes");
      return {
        stdout: JSON.stringify({
          streams: [{ width: 320, height: 240, codec_name: "png" }],
        }),
      };
    });
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      runner,
    );
    await expect(service.apply()).resolves.toMatchObject({
      failed: 1,
      failures: [{ reason: "thumbnail_backfill_not_jpeg" }],
    });
    expect(item.store.getCapture(item.capture.id)?.assets).toHaveLength(1);
  });

  it("rejects paths that escape through a symlinked parent", async () => {
    const item = await fixture();
    const outsideDir = path.join(item.root, "outside-capture");
    await mkdir(outsideDir);
    const outsideVideo = path.join(outsideDir, "video.mp4");
    await writeFile(outsideVideo, "video-bytes");
    const linkedDir = path.join(item.mediaDir, "linked-capture");
    await symlink(outsideDir, linkedDir);
    item.store.database
      .prepare("UPDATE assets SET path=? WHERE id=?")
      .run(path.join(linkedDir, "video.mp4"), item.video.id);
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      successfulRunner(),
    );

    await expect(service.dryRun()).resolves.toMatchObject({
      valid: 0,
      failures: [{ reason: "thumbnail_backfill_path_outside_media_dir" }],
    });
  });

  it("records generation failures without changing files or assets", async () => {
    const item = await fixture();
    const runner = vi.fn(async (command: string) => {
      if (command === "ffmpeg") throw new Error("synthetic ffmpeg failure");
      return { stdout: validProbe };
    });
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      runner,
    );

    const result = await service.apply();
    expect(result).toMatchObject({ candidates: 1, committed: 0, failed: 1 });
    expect(item.store.getCapture(item.capture.id)?.assets).toHaveLength(1);
    const manifest = await readFile(result.manifestPath!, "utf8");
    expect(manifest).toContain('"event":"failed"');
  });

  it("aborts on a database identity conflict and removes its generated file", async () => {
    const item = await fixture();
    vi.spyOn(item.store, "addBackfilledThumbnail").mockImplementation(() => {
      throw new Error("thumbnail_backfill_video_mismatch");
    });
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      successfulRunner(),
    );

    await expect(service.apply()).rejects.toThrow(
      "thumbnail_backfill_video_mismatch",
    );
    await expect(
      readFile(path.join(item.captureDir, "thumbnail.jpg")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses rollback when a generated thumbnail checksum changed", async () => {
    const item = await fixture();
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      successfulRunner(),
    );
    const applied = await service.apply();
    const thumbnailPath = path.join(item.captureDir, "thumbnail.jpg");
    await writeFile(thumbnailPath, "changed-jpeg");

    await expect(
      service.rollback(applied.manifestPath!),
    ).resolves.toMatchObject({
      candidates: 1,
      committed: 0,
      failed: 1,
    });
    expect(
      item.store
        .getCapture(item.capture.id)
        ?.assets.some((asset) => asset.kind === "thumbnail"),
    ).toBe(true);
    expect(await readFile(thumbnailPath, "utf8")).toBe("changed-jpeg");
  });

  it("rolls back a generated orphan left before database insertion", async () => {
    const item = await fixture();
    const crashed = await crashManifest(item);
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      successfulRunner(),
    );

    await expect(service.rollback(crashed.manifestPath)).resolves.toMatchObject(
      {
        committed: 1,
        failed: 0,
      },
    );
    await expect(readFile(crashed.thumbnailPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each(["prepared", "linked"] as const)(
    "recovers temporary files after a crash at %s",
    async (stage) => {
      const item = await fixture();
      const crashed = await crashManifest(item, stage);
      const service = new ThumbnailBackfill(
        item.store,
        item.mediaDir,
        item.backupsDir,
        successfulRunner(),
      );
      await expect(
        service.rollback(crashed.manifestPath),
      ).resolves.toMatchObject({ committed: 1, failed: 0 });
      await expect(readFile(crashed.temporaryPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(readFile(crashed.thumbnailPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(
        service.rollback(crashed.manifestPath),
      ).resolves.toMatchObject({ skipped: 1, failed: 0 });
    },
  );

  it("recovers a legacy manifest's deterministic temporary path", async () => {
    const item = await fixture();
    const crashed = await crashManifest(item, "prepared", true);
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      successfulRunner(),
    );
    await expect(service.rollback(crashed.manifestPath)).resolves.toMatchObject(
      { committed: 1, failed: 0 },
    );
    await expect(readFile(crashed.temporaryPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each(["checksum", "symlink", "path"])(
    "preserves files when the temporary %s mismatches",
    async (kind) => {
      const item = await fixture();
      const crashed = await crashManifest(item, "prepared");
      if (kind === "checksum")
        await writeFile(crashed.temporaryPath, "changed");
      if (kind === "symlink") {
        await rm(crashed.temporaryPath);
        await symlink(item.video.path, crashed.temporaryPath);
      }
      if (kind === "path") {
        const entry = JSON.parse(await readFile(crashed.manifestPath, "utf8"));
        entry.temporaryPath = item.video.path;
        await writeFile(crashed.manifestPath, `${JSON.stringify(entry)}\n`);
      }
      const service = new ThumbnailBackfill(
        item.store,
        item.mediaDir,
        item.backupsDir,
        successfulRunner(),
      );
      await expect(
        service.rollback(crashed.manifestPath),
      ).resolves.toMatchObject({ committed: 0, failed: 1 });
      await expect(readFile(crashed.temporaryPath)).resolves.not.toHaveLength(
        0,
      );
      expect(await readFile(item.video.path, "utf8")).toBe("video-bytes");
    },
  );

  it("preserves a temporary file referenced by another asset", async () => {
    const item = await fixture();
    const crashed = await crashManifest(item, "prepared");
    item.store.database
      .prepare(
        "INSERT INTO assets(id,capture_id,kind,path,mime_type,size_bytes,position) VALUES(?,?,'thumbnail',?,'image/jpeg',?,1)",
      )
      .run(
        randomUUID(),
        item.capture.id,
        crashed.temporaryPath,
        Buffer.byteLength("crash-jpeg"),
      );
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      successfulRunner(),
    );
    await expect(service.rollback(crashed.manifestPath)).resolves.toMatchObject(
      { skipped: 1, failed: 0 },
    );
    expect(await readFile(crashed.temporaryPath, "utf8")).toBe("crash-jpeg");
  });

  it("preserves a generated file while another asset references its path", async () => {
    const item = await fixture();
    const crashed = await crashManifest(item);
    item.store.database
      .prepare(
        "INSERT INTO assets(id,capture_id,kind,path,mime_type,size_bytes,position) VALUES(?,?,'thumbnail',?,'image/jpeg',?,1)",
      )
      .run(
        randomUUID(),
        item.capture.id,
        crashed.thumbnailPath,
        Buffer.byteLength("crash-jpeg"),
      );
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      successfulRunner(),
    );

    await expect(service.rollback(crashed.manifestPath)).resolves.toMatchObject(
      {
        committed: 0,
        skipped: 1,
      },
    );
    expect(await readFile(crashed.thumbnailPath, "utf8")).toBe("crash-jpeg");
  });

  it("rolls back resumed orphan adoption without stranding the original file", async () => {
    const item = await fixture();
    const crashed = await crashManifest(item);
    const service = new ThumbnailBackfill(
      item.store,
      item.mediaDir,
      item.backupsDir,
      successfulRunner(),
    );
    const resumed = await service.apply();

    await service.rollback(resumed.manifestPath!);
    expect(await readFile(crashed.thumbnailPath, "utf8")).toBe("crash-jpeg");
    await service.rollback(crashed.manifestPath);
    await expect(readFile(crashed.thumbnailPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a mismatched video asset at the database boundary", async () => {
    const item = await fixture();
    expect(() =>
      item.store.addBackfilledThumbnail({
        captureId: item.capture.id,
        videoAssetId: "not-the-video",
        assetId: crypto.randomUUID(),
        path: path.join(item.captureDir, "thumbnail.jpg"),
        mimeType: "image/jpeg",
        sizeBytes: 10,
      }),
    ).toThrow("thumbnail_backfill_video_mismatch");
  });
});
