import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inspectStreamTopology,
  MediaProcessor,
  selectThumbnailPath,
} from "../src/media-processor.js";
import type { DownloadResult } from "../src/types.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<DownloadResult> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "media-processor-"));
  roots.push(workDir);
  return {
    workDir,
    videoPath: path.join(workDir, "source.mp4"),
    thumbnailPath: null,
    metadata: {
      id: "video",
      platform: "facebook",
      title: null,
      description: null,
      uploader: null,
      uploaderUrl: null,
      webpageUrl: "https://www.facebook.com/reel/video",
      uploadDate: null,
      durationSeconds: 15,
      comments: [],
    },
  };
}

function runner(streams: Array<{ codec_type: string }>, writeFrames = true) {
  return vi.fn(async (command: string, args: string[]) => {
    if (command === "ffprobe") return { stdout: JSON.stringify({ streams }) };
    const output = args.at(-1)!;
    if (writeFrames && output.endsWith("%03d.jpg"))
      await writeFile(output.replace("%03d", "001"), "jpeg");
    return { stdout: "" };
  });
}

describe("selectThumbnailPath", () => {
  it("preserves an upstream thumbnail", () => {
    expect(
      selectThumbnailPath("/work/source.webp", ["/work/frames/001.jpg"]),
    ).toBe("/work/source.webp");
  });

  it("uses the first extracted JPEG when the upstream thumbnail is absent", () => {
    expect(
      selectThumbnailPath(null, [
        "/work/frames/001.jpg",
        "/work/frames/002.jpg",
      ]),
    ).toBe("/work/frames/001.jpg");
  });

  it("allows processing to continue without a thumbnail or frame", () => {
    expect(selectThumbnailPath(null, [])).toBeNull();
  });
});

describe("stream topology", () => {
  it("recognizes only a video-present, audio-absent probe as video-only media", () => {
    expect(
      inspectStreamTopology(JSON.stringify({ streams: [{ codec_type: "video" }] })),
    ).toEqual({ hasAudio: false });
    expect(() =>
      inspectStreamTopology(JSON.stringify({ streams: [{ codec_type: "audio" }] })),
    ).toThrow("no video stream");
    expect(() => inspectStreamTopology(JSON.stringify({ streams: [] }))).toThrow(
      "no video stream",
    );
    expect(() =>
      inspectStreamTopology(
        JSON.stringify({ streams: [{ codec_type: "video" }, {}] }),
      ),
    ).toThrow();
    expect(() =>
      inspectStreamTopology(
        JSON.stringify({ streams: [{ codec_type: "video" }, { codec_type: "unknown" }] }),
      ),
    ).toThrow();
  });

  it("skips audio extraction only for confirmed video-only media while retaining frames", async () => {
    const download = await fixture();
    const runCommand = runner([{ codec_type: "video" }]);

    const processed = await new MediaProcessor(runCommand).process(download);

    expect(processed.audioPath).toBeNull();
    expect(processed.framePaths).toEqual([
      path.join(download.workDir, "frames", "001.jpg"),
    ]);
    expect(runCommand.mock.calls.map(([command]) => command)).toEqual([
      "ffprobe",
      "ffmpeg",
    ]);
    expect(runCommand.mock.calls[1]?.[1]).not.toContain("-vn");
  });

  it("extracts audio when the probe finds an audio stream", async () => {
    const download = await fixture();
    const runCommand = runner([
      { codec_type: "video" },
      { codec_type: "audio" },
    ]);

    const processed = await new MediaProcessor(runCommand).process(download);

    expect(processed.audioPath).toBe(path.join(download.workDir, "audio.mp3"));
    expect(runCommand.mock.calls.map(([command]) => command)).toEqual([
      "ffprobe",
      "ffmpeg",
      "ffmpeg",
    ]);
    expect(runCommand.mock.calls[1]?.[1]).toContain("-vn");
  });

  it("does not treat an unreadable probe or zero extracted frames as silence", async () => {
    const unreadable = await fixture();
    const failingRunner = vi.fn(async () => {
      throw new Error("invalid media");
    });
    await expect(new MediaProcessor(failingRunner).process(unreadable)).rejects.toThrow(
      "invalid media",
    );
    expect(failingRunner).toHaveBeenCalledTimes(1);

    const frameLess = await fixture();
    await expect(
      new MediaProcessor(runner([{ codec_type: "video" }], false)).process(
        frameLess,
      ),
    ).rejects.toThrow("no video frames");
  });
});
