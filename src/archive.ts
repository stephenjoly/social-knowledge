import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { ProcessedMedia } from "./types.js";

export interface ArchiveResult {
  videoPath: string;
  audioPath: string;
  thumbnailPath: string | null;
}

export class MediaArchive {
  constructor(private readonly config: AppConfig) {}

  async store(jobId: string, media: ProcessedMedia): Promise<ArchiveResult> {
    const date = new Date();
    const destination = path.join(
      this.config.mediaDir,
      String(date.getUTCFullYear()),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      jobId,
    );
    await mkdir(destination, { recursive: true });

    const videoPath = path.join(destination, `video${path.extname(media.videoPath).toLowerCase()}`);
    const audioPath = path.join(destination, "audio.mp3");
    await copyFile(media.videoPath, videoPath);
    await copyFile(media.audioPath, audioPath);

    let thumbnailPath: string | null = null;
    if (media.thumbnailPath) {
      thumbnailPath = path.join(destination, `thumbnail${path.extname(media.thumbnailPath).toLowerCase()}`);
      await copyFile(media.thumbnailPath, thumbnailPath);
    }

    return { videoPath, audioPath, thumbnailPath };
  }
}
