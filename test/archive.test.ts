import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MediaArchive } from "../src/archive.js";
import type { ProcessedMedia } from "../src/types.js";
import { testConfig } from "./helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("MediaArchive", () => {
  it("archives confirmed video-only media without creating an audio artifact", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "media-archive-no-audio-"));
    roots.push(root);
    const sourceVideoPath = path.join(root, "source.mp4");
    await writeFile(sourceVideoPath, "video-bytes");
    const media: ProcessedMedia = {
      workDir: root,
      videoPath: sourceVideoPath,
      audioPath: null,
      thumbnailPath: null,
      framePaths: [path.join(root, "frames", "001.jpg")],
      metadata: {
        id: "video-only",
        platform: "facebook",
        title: null,
        description: null,
        uploader: null,
        uploaderUrl: null,
        webpageUrl: "https://www.facebook.com/reel/video-only",
        uploadDate: null,
        durationSeconds: 15,
        comments: [],
      },
    };

    const archived = await new MediaArchive(testConfig(root)).store(
      "job-video-only",
      media,
    );

    expect(archived.audioPath).toBeNull();
    await expect(readFile(archived.videoPath, "utf8")).resolves.toBe(
      "video-bytes",
    );
    await expect(
      access(path.join(path.dirname(archived.videoPath), "audio.mp3")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
