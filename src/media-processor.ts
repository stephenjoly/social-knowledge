import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import type { DownloadResult, ProcessedMedia } from "./types.js";

export class MediaProcessor {
  async process(download: DownloadResult): Promise<ProcessedMedia> {
    const audioPath = path.join(download.workDir, "audio.mp3");
    const framesDir = path.join(download.workDir, "frames");
    await mkdir(framesDir, { recursive: true });

    await execa(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", "-i", download.videoPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", audioPath],
      { timeout: 10 * 60_000 },
    );

    await execa(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        download.videoPath,
        "-vf",
        "fps=1/15,scale='min(1280,iw)':-2",
        "-frames:v",
        "12",
        path.join(framesDir, "%03d.jpg"),
      ],
      { timeout: 10 * 60_000 },
    );

    const framePaths = (await readdir(framesDir))
      .filter((file) => file.endsWith(".jpg"))
      .sort()
      .map((file) => path.join(framesDir, file));

    return { ...download, audioPath, framePaths };
  }
}
