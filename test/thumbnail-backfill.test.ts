import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobStore } from "../src/db.js";
import { ThumbnailBackfill } from "../src/thumbnail-backfill.js";

const roots: string[] = [];
const stores: JobStore[] = [];

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

const validProbe = JSON.stringify({ streams: [{ width: 1080, height: 1920 }] });

function successfulRunner() {
  return vi.fn(async (command: string, args: string[]) => {
    if (command === "ffmpeg") await writeFile(args.at(-1)!, "jpeg-bytes");
    return { stdout: validProbe };
  });
}

describe("ThumbnailBackfill", () => {
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
