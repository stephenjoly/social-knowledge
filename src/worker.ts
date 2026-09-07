import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "./config.js";
import type { JobStore } from "./db.js";
import type { MediaDownloader } from "./downloader.js";
import type { MediaProcessor } from "./media-processor.js";
import type { Transcriber } from "./transcriber.js";
import type { Analyzer } from "./analyzer.js";
import type { MediaArchive } from "./archive.js";
import type { VaultWriter } from "./vault-writer.js";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import type { EventHub } from "./events.js";
import type { Notifier } from "./notifier.js";
import { normalizeFailure } from "./failures.js";
import type { Translator } from "./translator.js";
import type { TitleGenerator } from "./title-generator.js";
import type { LibraryPublisher } from "./library-publisher.js";

interface WorkerServices {
  store: JobStore;
  downloader: MediaDownloader;
  processor: MediaProcessor;
  transcriber: Transcriber;
  translator: Translator;
  titleGenerator: TitleGenerator;
  analyzer: Analyzer;
  archive: MediaArchive;
  vaultWriter: VaultWriter;
  events: EventHub;
  notifier: Notifier;
  libraryPublisher: LibraryPublisher;
}

export class JobWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(
    private readonly config: AppConfig,
    private readonly services: WorkerServices,
    private readonly logger: FastifyBaseLogger,
  ) {}

  start() {
    this.services.store.recoverInterruptedJobs();
    this.schedule(0);
  }

  async stop() {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    while (this.running)
      await new Promise((resolve) => setTimeout(resolve, 50));
  }

  private schedule(delay: number) {
    if (this.stopping) return;
    this.timer = setTimeout(() => void this.tick(), delay);
    this.timer.unref();
  }

  private async tick() {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      const job = this.services.store.claimNext();
      if (!job) return;

      const log = this.logger.child({
        jobId: job.id,
        sourceUrl: job.normalizedUrl,
      });
      try {
        log.info("processing job");
        const download = await this.services.downloader.download(
          job.id,
          job.normalizedUrl,
          job.ownerUserId,
        );
        this.services.store.setDisplayTitle(job.id, download.metadata.title);
        const existingCapture = this.services.store.getCaptureBySource(
          job.ownerUserId,
          download.metadata.platform,
          download.metadata.id,
        );
        if (existingCapture) {
          this.services.store.setDisplayTitle(job.id, existingCapture.title);
          this.services.store.complete(job.id, existingCapture.notePath);
          await rm(download.workDir, { recursive: true, force: true });
          this.services.events.publish("capture", {
            id: existingCapture.id,
            jobId: job.id,
            status: "complete",
            deduplicated: true,
          });
          log.info(
            { captureId: existingCapture.id },
            "source already archived; linked job to existing capture",
          );
          return;
        }
        this.services.store.setStatus(job.id, "processing");
        this.services.events.publish("job", {
          id: job.id,
          status: "processing",
        });
        const media = await this.services.processor.process(download);

        this.services.store.setStatus(job.id, "transcribing");
        this.services.events.publish("job", {
          id: job.id,
          status: "transcribing",
        });
        const transcript = await this.services.transcriber.transcribe(
          media.audioPath,
        );

        this.services.store.setStatus(job.id, "translating");
        this.services.events.publish("job", {
          id: job.id,
          status: "translating",
        });
        const preferences = this.services.store.preferences(job.ownerUserId);
        const translation = await this.services.translator.translate(
          transcript,
          preferences.defaultLanguage,
          preferences.translateForeign,
        );

        this.services.store.setStatus(job.id, "analyzing");
        this.services.events.publish("job", {
          id: job.id,
          status: "analyzing",
        });
        try {
          const earlyTitle = await this.services.titleGenerator.generate(
            media,
            translation.translatedTranscript || transcript,
          );
          this.services.store.setDisplayTitle(
            job.id,
            earlyTitle,
            "AI title ready; extracting detailed knowledge",
          );
          this.services.events.publish("job", {
            id: job.id,
            status: "analyzing",
            displayTitle: earlyTitle,
          });
        } catch (error) {
          log.warn({ err: error }, "early title generation failed; continuing");
        }
        const analysis = await this.services.analyzer.analyze(
          media,
          translation.translatedTranscript || transcript,
          job.userNote,
        );
        this.services.store.setDisplayTitle(job.id, analysis.title);

        this.services.store.setStatus(job.id, "writing");
        this.services.events.publish("job", { id: job.id, status: "writing" });
        const archived = await this.services.archive.store(job.id, media);
        const resultNotePath = await this.services.vaultWriter.write({
          job,
          media,
          transcript,
          sourceLanguage: translation.sourceLanguage,
          translatedTranscript: translation.translatedTranscript,
          translationLanguage: translation.translatedTranscript
            ? preferences.defaultLanguage
            : null,
          analysis,
          archivedVideoPath: archived.videoPath,
          archivedAudioPath: archived.audioPath,
          archivedThumbnailPath: archived.thumbnailPath,
        });

        const assetInputs = await Promise.all(
          [
            {
              kind: "video" as const,
              path: archived.videoPath,
              mimeType: "video/mp4",
              position: 0,
            },
            {
              kind: "audio" as const,
              path: archived.audioPath,
              mimeType: "audio/mpeg",
              position: 1,
            },
            ...(archived.thumbnailPath
              ? [
                  {
                    kind: "thumbnail" as const,
                    path: archived.thumbnailPath,
                    mimeType: `image/${path.extname(archived.thumbnailPath).slice(1).replace("jpg", "jpeg")}`,
                    position: 2,
                  },
                ]
              : []),
          ].map(async (asset) => ({
            ...asset,
            sizeBytes: (await stat(asset.path)).size,
          })),
        );
        const capture = this.services.store.createCapture({
          job,
          sourceType: "video",
          sourceId: media.metadata.id,
          platform: media.metadata.platform,
          title: analysis.title,
          creator: media.metadata.uploader,
          creatorUrl: media.metadata.uploaderUrl,
          description: media.metadata.description,
          transcript,
          sourceLanguage: translation.sourceLanguage,
          translatedTranscript: translation.translatedTranscript,
          translationLanguage: translation.translatedTranscript
            ? preferences.defaultLanguage
            : null,
          comments: media.metadata.comments,
          analysis,
          publishedAt: media.metadata.uploadDate,
          durationSeconds: media.metadata.durationSeconds,
          notePath: resultNotePath,
          assets: assetInputs,
        });
        if (capture) {
          this.services.store.assignClassification(
            capture.id,
            analysis.classification,
          );
          await this.services.libraryPublisher.refreshCapture(capture.id);
          await this.services.libraryPublisher.regenerateAll();
        }
        this.services.store.complete(job.id, resultNotePath);
        await rm(download.workDir, { recursive: true, force: true });
        this.services.events.publish("capture", {
          id: capture?.id,
          jobId: job.id,
          status: "complete",
        });
        await this.services.notifier
          .send({
            kind: "complete",
            title: analysis.title,
            platform: media.metadata.platform,
            jobId: job.id,
          })
          .catch((error) => log.warn({ err: error }, "notification failed"));
        log.info({ resultNotePath }, "job complete");
      } catch (error) {
        const stage = this.services.store.get(job.id)?.status;
        const failure = normalizeFailure(error, stage ?? undefined);
        this.services.store.fail(job.id, failure, this.config.maxAttempts);
        const failed = this.services.store.get(job.id)?.status === "failed";
        this.services.events.publish("job", {
          id: job.id,
          status: failed ? "failed" : "queued",
        });
        if (failed)
          await this.services.notifier
            .send({
              kind: "failed",
              title: failure.title,
              platform: new URL(job.normalizedUrl).hostname.includes(
                "instagram",
              )
                ? "instagram"
                : "facebook",
              jobId: job.id,
            })
            .catch((notificationError) =>
              log.warn({ err: notificationError }, "notification failed"),
            );
        log.error({ err: error }, "job failed");
      }
    } finally {
      this.running = false;
      this.schedule(this.config.workerPollMs);
    }
  }
}
