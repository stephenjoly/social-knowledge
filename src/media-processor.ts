import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { z } from "zod";
import type { DownloadResult, ProcessedMedia } from "./types.js";
import { videoFrameArgs } from "./video-frames.js";

type CommandRunner = (
  command: string,
  args: string[],
) => Promise<{ stdout: string }>;

const defaultRunner: CommandRunner = async (command, args) => {
  const result = await execa(command, args, { timeout: 10 * 60_000 });
  return { stdout: String(result.stdout) };
};

const streamTopologySchema = z
  .object({
    streams: z.array(
      z
        .object({
          codec_type: z.enum(["video", "audio", "subtitle", "data", "attachment"]),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export function inspectStreamTopology(output: string) {
  const { streams } = streamTopologySchema.parse(JSON.parse(output));
  const streamTypes = streams.map((stream) => stream.codec_type);
  if (!streamTypes.includes("video"))
    throw new Error("ffprobe found no video stream");
  return { hasAudio: streamTypes.includes("audio") };
}

export function selectThumbnailPath(
  downloadedThumbnailPath: string | null,
  framePaths: string[],
) {
  return downloadedThumbnailPath ?? framePaths[0] ?? null;
}

export class MediaProcessor {
  constructor(private readonly runCommand: CommandRunner = defaultRunner) {}

  async process(download: DownloadResult): Promise<ProcessedMedia> {
    const topology = await this.probeStreams(download.videoPath);
    const audioPath = topology.hasAudio
      ? path.join(download.workDir, "audio.mp3")
      : null;
    const framesDir = path.join(download.workDir, "frames");
    await mkdir(framesDir, { recursive: true });

    if (audioPath)
      await this.runCommand("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        download.videoPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "64k",
        audioPath,
      ]);

    await this.runCommand(
      "ffmpeg",
      videoFrameArgs(download.videoPath, path.join(framesDir, "%03d.jpg"), 12),
    );

    const framePaths = (await readdir(framesDir))
      .filter((file) => file.endsWith(".jpg"))
      .sort()
      .map((file) => path.join(framesDir, file));
    if (framePaths.length === 0)
      throw new Error("ffmpeg extracted no video frames");

    return {
      ...download,
      audioPath,
      framePaths,
      thumbnailPath: selectThumbnailPath(download.thumbnailPath, framePaths),
    };
  }

  private async probeStreams(videoPath: string) {
    const result = await this.runCommand("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "json",
      videoPath,
    ]);
    return inspectStreamTopology(result.stdout);
  }
}
