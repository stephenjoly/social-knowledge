import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execa } from "execa";
import type { AppConfig } from "./config.js";
import type {
  DownloadMetadata,
  DownloadResult,
  SocialComment,
} from "./types.js";
import { CaptureFailure, classifyPlatformFailure } from "./failures.js";

interface YtDlpInfo {
  id?: unknown;
  extractor_key?: unknown;
  title?: unknown;
  description?: unknown;
  uploader?: unknown;
  uploader_url?: unknown;
  webpage_url?: unknown;
  original_url?: unknown;
  upload_date?: unknown;
  duration?: unknown;
  comments?: unknown;
}

export const durationMatchFilter = (maxDurationSeconds: number) =>
  `duration <=? ${maxDurationSeconds}`;

export function selectComments(value: unknown, limit = 10): SocialComment[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((comment): SocialComment[] => {
      if (!comment || typeof comment !== "object") return [];
      const row = comment as Record<string, unknown>;
      const text =
        typeof row.text === "string" && row.text.trim()
          ? row.text.trim()
          : null;
      if (!text) return [];
      return [
        {
          author:
            typeof row.author === "string" && row.author.trim()
              ? row.author.trim()
              : null,
          text,
          likeCount:
            typeof row.like_count === "number" ? row.like_count : null,
          isPinned: row.is_pinned === true,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.isPinned) - Number(a.isPinned) ||
        (b.likeCount ?? 0) - (a.likeCount ?? 0),
    )
    .slice(0, limit);
}

export class MediaDownloader {
  constructor(private readonly config: AppConfig) {}

  async download(jobId: string, sourceUrl: string): Promise<DownloadResult> {
    const workDir = path.join(this.config.workDir, jobId);
    await rm(workDir, { recursive: true, force: true });
    await mkdir(workDir, { recursive: true });

    const args = [
      "--no-playlist",
      "--no-progress",
      "--newline",
      "--restrict-filenames",
      "--merge-output-format",
      "mp4",
      "--write-info-json",
      "--write-description",
      "--write-thumbnail",
      "--match-filter",
      durationMatchFilter(this.config.maxDurationSeconds),
      "--max-filesize",
      String(this.config.maxDownloadBytes),
      "--output",
      path.join(workDir, "source.%(ext)s"),
    ];

    if (this.isFacebookUrl(sourceUrl) && this.config.facebookImpersonate) {
      args.push("--impersonate", this.config.facebookImpersonate);
    }
    if (this.config.fetchComments) args.push("--write-comments");

    let temporaryCookiesDir: string | undefined;
    try {
      const configuredCookiesFile = this.cookiesFileFor(sourceUrl);
      if (configuredCookiesFile) {
        temporaryCookiesDir = await mkdtemp(
          path.join(tmpdir(), "social-knowledge-cookies-"),
        );
        const writableCookiesFile = path.join(
          temporaryCookiesDir,
          "cookies.txt",
        );
        await copyFile(configuredCookiesFile, writableCookiesFile);
        await chmod(writableCookiesFile, 0o600);
        args.push("--cookies", writableCookiesFile);
      }
      args.push("--", sourceUrl);

      try {
        await execa("yt-dlp", args, { timeout: 15 * 60_000, reject: true });
      } catch (error) {
        throw this.classifyDownloadError(error);
      }
    } finally {
      if (temporaryCookiesDir)
        await rm(temporaryCookiesDir, { recursive: true, force: true });
    }

    const files = await readdir(workDir);
    const infoFile = files.find((file) => file.endsWith(".info.json"));
    if (!infoFile)
      throw new CaptureFailure(
        "unsupported_format",
        "yt-dlp completed without an info JSON file or matching downloadable media.",
      );

    const info = JSON.parse(
      await readFile(path.join(workDir, infoFile), "utf8"),
    ) as YtDlpInfo;
    const videoFile = files.find((file) =>
      /^source\.(mp4|mkv|webm|mov)$/i.test(file),
    );
    if (!videoFile)
      throw new CaptureFailure(
        "unsupported_format",
        "No video file was present after download; photo and carousel ingestion is not enabled.",
      );

    const thumbnailFile = files.find((file) =>
      /^source\.(jpg|jpeg|png|webp)$/i.test(file),
    );
    const metadata = this.parseMetadata(info, sourceUrl);

    if (metadata.durationSeconds === null)
      metadata.durationSeconds = await this.probeDuration(
        path.join(workDir, videoFile),
      );
    if (
      metadata.durationSeconds !== null &&
      metadata.durationSeconds > this.config.maxDurationSeconds
    ) {
      throw new CaptureFailure(
        "archive_limit",
        `Video duration exceeds ${this.config.maxDurationSeconds} seconds.`,
      );
    }

    return {
      workDir,
      videoPath: path.join(workDir, videoFile),
      thumbnailPath: thumbnailFile ? path.join(workDir, thumbnailFile) : null,
      metadata,
    };
  }

  private cookiesFileFor(sourceUrl: string): string | undefined {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    if (hostname === "instagram.com" || hostname.endsWith(".instagram.com"))
      return this.config.instagramCookiesFile;
    return this.isFacebookUrl(sourceUrl)
      ? this.config.facebookCookiesFile
      : undefined;
  }

  private async probeDuration(videoPath: string): Promise<number | null> {
    const result = await execa("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ]);
    const duration = Number(result.stdout.trim());
    return Number.isFinite(duration) ? duration : null;
  }

  private classifyDownloadError(error: unknown): Error {
    const detail =
      error && typeof error === "object"
        ? `${"stderr" in error ? String(error.stderr) : ""}\n${"stdout" in error ? String(error.stdout) : ""}`.toLowerCase()
        : String(error).toLowerCase();
    return classifyPlatformFailure(detail.trim().slice(0, 4000));
  }

  private isFacebookUrl(sourceUrl: string): boolean {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    return (
      hostname === "facebook.com" ||
      hostname.endsWith(".facebook.com") ||
      hostname === "fb.watch"
    );
  }

  private parseMetadata(
    info: YtDlpInfo,
    fallbackUrl: string,
  ): DownloadMetadata {
    const extractor =
      this.string(info.extractor_key)?.toLowerCase() ?? "unknown";
    const platform = extractor.includes("instagram")
      ? "instagram"
      : extractor.includes("facebook")
        ? "facebook"
        : extractor;
    return {
      id: this.string(info.id) ?? "unknown",
      platform,
      title: this.string(info.title),
      description: this.string(info.description),
      uploader: this.string(info.uploader),
      uploaderUrl: this.string(info.uploader_url),
      webpageUrl:
        this.string(info.webpage_url) ??
        this.string(info.original_url) ??
        fallbackUrl,
      uploadDate: this.string(info.upload_date),
      durationSeconds:
        typeof info.duration === "number" && Number.isFinite(info.duration)
          ? info.duration
          : null,
      comments: selectComments(info.comments),
    };
  }

  private string(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}
