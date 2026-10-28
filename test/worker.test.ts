import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiProviderService } from "../src/ai-providers.js";
import type { Analyzer } from "../src/analyzer.js";
import type { MediaArchive } from "../src/archive.js";
import { JobStore } from "../src/db.js";
import type { MediaDownloader } from "../src/downloader.js";
import { EventHub } from "../src/events.js";
import { captureKnowledge } from "../src/knowledge.js";
import type { LibraryPublisher } from "../src/library-publisher.js";
import type { MediaProcessor } from "../src/media-processor.js";
import type { Notifier } from "../src/notifier.js";
import type { TitleGenerator } from "../src/title-generator.js";
import type { Transcriber } from "../src/transcriber.js";
import type { Translator } from "../src/translator.js";
import type { AnalysisResult, DownloadResult, ProcessedMedia } from "../src/types.js";
import type { VaultWriter } from "../src/vault-writer.js";
import { JobWorker, videoMimeType } from "../src/worker.js";
import { testConfig } from "./helpers.js";

const roots: string[] = [];
const stores: JobStore[] = [];

afterEach(async () => {
  stores.splice(0).forEach((store) => store.close());
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const analysis: AnalysisResult = {
  title: "Visual-only Facebook post",
  synopsis: "A knowledge brief based on the post description and frames.",
  whyUseful: null,
  takeaways: ["The frame sequence contains the relevant visual information."],
  topics: ["visual"],
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
};

describe("JobWorker", () => {
  it("uses the retained video container when recording an asset MIME type", () => {
    expect(videoMimeType("/archive/video.mp4")).toBe("video/mp4");
    expect(videoMimeType("/archive/video.mkv")).toBe("video/x-matroska");
    expect(videoMimeType("/archive/video.webm")).toBe("video/webm");
    expect(videoMimeType("/archive/video.mov")).toBe("video/quicktime");
    expect(videoMimeType("/archive/video.unknown")).toBe(
      "application/octet-stream",
    );
  });

  it("completes video-only media without text stages and keeps audio jobs unchanged", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "worker-video-only-"));
    roots.push(root);
    const config = testConfig(root);
    await mkdir(config.dataDir, { recursive: true });
    const store = new JobStore(config.databasePath);
    stores.push(store);
    const owner = store.createUser("video-only-owner", "hash");
    const { job } = store.createOrGet({
      ownerUserId: owner.id,
      sourceUrl: "https://www.facebook.com/reel/video-only",
      normalizedUrl: "https://www.facebook.com/reel/video-only",
      sourceHash: "video-only",
    });
    const workDir = path.join(config.workDir, job.id);
    const archiveDir = path.join(root, "archive");
    await mkdir(archiveDir, { recursive: true });
    const archivedVideoPath = path.join(archiveDir, "video.mp4");
    const archivedAudioPath = path.join(archiveDir, "audio.mp3");
    const archivedThumbnailPath = path.join(archiveDir, "thumbnail.jpg");
    await Promise.all([
      writeFile(archivedVideoPath, "video"),
      writeFile(archivedAudioPath, "audio"),
      writeFile(archivedThumbnailPath, "thumbnail"),
    ]);

    const download: DownloadResult = {
      workDir,
      videoPath: path.join(workDir, "source.mp4"),
      thumbnailPath: null,
      metadata: {
        id: "video-only",
        platform: "facebook",
        title: "Visual-only post",
        description: "A visual-only post with a useful caption.",
        uploader: "creator",
        uploaderUrl: null,
        webpageUrl: "https://www.facebook.com/reel/video-only",
        uploadDate: null,
        durationSeconds: 15,
        comments: [],
      },
    };
    const media: ProcessedMedia = {
      ...download,
      audioPath: null,
      framePaths: [path.join(workDir, "frames", "001.jpg")],
    };
    const downloader = { download: vi.fn(async () => download) };
    const processor = { process: vi.fn(async () => media) };
    const transcriber = { transcribe: vi.fn(async () => "should not run") };
    const translator = {
      translate: vi.fn(async () => ({
        sourceLanguage: "en",
        sameAsDefault: true,
        translatedTranscript: null,
      })),
    };
    const titleGenerator = { generate: vi.fn(async () => "Visual-only Facebook post") };
    const analyzer = { analyze: vi.fn(async () => analysis) };
    const archive = {
      store: vi.fn(async (_jobId: string, processed: ProcessedMedia) => ({
        videoPath: archivedVideoPath,
        audioPath: processed.audioPath ? archivedAudioPath : null,
        thumbnailPath: archivedThumbnailPath,
      })),
    };
    const vaultWriter = { write: vi.fn(async () => "Social Knowledge/video-only.md") };
    const libraryPublisher = {
      refreshCapture: vi.fn(async () => undefined),
      regenerateAll: vi.fn(async () => undefined),
    };
    const notifier = { send: vi.fn(async () => undefined) };
    const aiProviders = { enterUser: vi.fn() };
    const loggerMethods = {
      child: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    loggerMethods.child.mockReturnValue(loggerMethods);
    const worker = new JobWorker(
      config,
      {
        store,
        downloader: downloader as unknown as MediaDownloader,
        processor: processor as unknown as MediaProcessor,
        transcriber: transcriber as unknown as Transcriber,
        translator: translator as unknown as Translator,
        titleGenerator: titleGenerator as unknown as TitleGenerator,
        analyzer: analyzer as unknown as Analyzer,
        archive: archive as unknown as MediaArchive,
        vaultWriter: vaultWriter as unknown as VaultWriter,
        events: new EventHub(),
        notifier: notifier as unknown as Notifier,
        libraryPublisher: libraryPublisher as unknown as LibraryPublisher,
        aiProviders: aiProviders as unknown as AiProviderService,
      },
      loggerMethods as unknown as FastifyBaseLogger,
    );

    await (worker as unknown as { tick(): Promise<void> }).tick();
    await worker.stop();

    expect(transcriber.transcribe).not.toHaveBeenCalled();
    expect(translator.translate).not.toHaveBeenCalled();
    expect(analyzer.analyze).toHaveBeenCalledWith(media, "", null);
    expect(vaultWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: "",
        sourceLanguage: null,
        translatedTranscript: null,
        translationLanguage: null,
        archivedAudioPath: null,
      }),
    );
    const stages = store
      .events(job.id)
      .map((event) => event.status)
      .filter((status) => status !== "queued");
    expect(stages).toEqual([
      "downloading",
      "processing",
      "analyzing",
      "analyzing",
      "writing",
      "complete",
    ]);
    const capture = store.getCaptureBySource(owner.id, "facebook", "video-only");
    expect(capture?.transcript).toBe("");
    expect(capture?.sourceLanguage).toBeNull();
    expect(capture?.assets.map((asset) => asset.kind)).toEqual([
      "video",
      "thumbnail",
    ]);
    expect(captureKnowledge(store, capture!, new Set())).toMatchObject({
      assets: [
        { kind: "video", mimeType: "video/mp4", position: 0 },
        { kind: "thumbnail", mimeType: "image/jpeg", position: 1 },
      ],
    });

    const { job: audioJob } = store.createOrGet({
      ownerUserId: owner.id,
      sourceUrl: "https://www.facebook.com/reel/with-audio",
      normalizedUrl: "https://www.facebook.com/reel/with-audio",
      sourceHash: "with-audio",
    });
    const audioDownload: DownloadResult = {
      ...download,
      workDir: path.join(config.workDir, audioJob.id),
      videoPath: path.join(config.workDir, audioJob.id, "source.mp4"),
      metadata: { ...download.metadata, id: "with-audio" },
    };
    const audioMedia: ProcessedMedia = {
      ...audioDownload,
      audioPath: path.join(audioDownload.workDir, "audio.mp3"),
      framePaths: [path.join(audioDownload.workDir, "frames", "001.jpg")],
    };
    downloader.download.mockResolvedValue(audioDownload);
    processor.process.mockResolvedValue(audioMedia);
    transcriber.transcribe.mockResolvedValue("Spoken words.");
    const audioWorker = new JobWorker(
      config,
      {
        store,
        downloader: downloader as unknown as MediaDownloader,
        processor: processor as unknown as MediaProcessor,
        transcriber: transcriber as unknown as Transcriber,
        translator: translator as unknown as Translator,
        titleGenerator: titleGenerator as unknown as TitleGenerator,
        analyzer: analyzer as unknown as Analyzer,
        archive: archive as unknown as MediaArchive,
        vaultWriter: vaultWriter as unknown as VaultWriter,
        events: new EventHub(),
        notifier: notifier as unknown as Notifier,
        libraryPublisher: libraryPublisher as unknown as LibraryPublisher,
        aiProviders: aiProviders as unknown as AiProviderService,
      },
      loggerMethods as unknown as FastifyBaseLogger,
    );
    await (audioWorker as unknown as { tick(): Promise<void> }).tick();
    await audioWorker.stop();

    expect(transcriber.transcribe).toHaveBeenCalledTimes(1);
    expect(translator.translate).toHaveBeenCalledTimes(1);
    expect(analyzer.analyze).toHaveBeenLastCalledWith(
      audioMedia,
      "Spoken words.",
      null,
    );
    expect(
      store
        .events(audioJob.id)
        .map((event) => event.status)
        .filter((status) => status !== "queued"),
    ).toEqual([
      "downloading",
      "processing",
      "transcribing",
      "translating",
      "analyzing",
      "analyzing",
      "writing",
      "complete",
    ]);
    const audioCapture = store.getCaptureBySource(
      owner.id,
      "facebook",
      "with-audio",
    );
    expect(audioCapture?.assets.map((asset) => asset.kind)).toEqual([
      "video",
      "audio",
      "thumbnail",
    ]);
    expect(captureKnowledge(store, audioCapture!, new Set())).toMatchObject({
      assets: [
        { kind: "video", mimeType: "video/mp4", position: 0 },
        { kind: "audio", mimeType: "audio/mpeg", position: 1 },
        { kind: "thumbnail", mimeType: "image/jpeg", position: 2 },
      ],
    });
  });
});
