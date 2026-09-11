import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import { videoFrameArgs } from "../src/video-frames.js";

const roots: string[] = [];
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function extract(duration: number) {
  const root = await mkdtemp(path.join(os.tmpdir(), "video-frames-"));
  roots.push(root);
  const videoPath = path.join(root, "video.mp4");
  const framesDir = path.join(root, "frames");
  await mkdir(framesDir);
  await execa("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=s=320x240:r=1:d=${duration}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    videoPath,
  ]);
  await execa(
    "ffmpeg",
    videoFrameArgs(videoPath, path.join(framesDir, "%03d.jpg"), 12),
  );
  return (await readdir(framesDir)).filter((file) => file.endsWith(".jpg"));
}

describe.runIf(hasFfmpeg)("videoFrameArgs", () => {
  it("always extracts frame zero from a short video", async () => {
    await expect(extract(2)).resolves.toHaveLength(1);
  });

  it("keeps the initial frame and 15-second cadence", async () => {
    await expect(extract(31)).resolves.toHaveLength(3);
  });
});
