import OpenAI from "openai";
import { Analyzer } from "./analyzer.js";
import { loadConfig } from "./config.js";
import { JobStore } from "./db.js";
import type { ProcessedMedia } from "./types.js";
import { VaultWriter } from "./vault-writer.js";

const config = loadConfig();
const store = new JobStore(config.databasePath);
const analyzer = new Analyzer(
  new OpenAI({ apiKey: config.openAiApiKey }),
  config,
);
const vaultWriter = new VaultWriter(config.vaultDir);
const captures = store.listCaptures({ limit: 100 }).captures;
let completed = 0;
let failed = 0;

for (const summary of captures) {
  const capture = store.getCapture(summary.id);
  if (!capture) continue;
  const job = store.get(capture.jobId);
  if (!job) {
    failed += 1;
    console.error(JSON.stringify({ captureId: capture.id, status: "missing_job" }));
    continue;
  }
  const video = capture.assets.find((asset) => asset.kind === "video");
  const audio = capture.assets.find((asset) => asset.kind === "audio");
  const thumbnail = capture.assets.find((asset) => asset.kind === "thumbnail");
  const uploadDate = capture.publishedAt?.replaceAll("-", "") ?? null;
  const media: ProcessedMedia = {
    workDir: config.workDir,
    videoPath: video?.path ?? "",
    audioPath: audio?.path ?? "",
    thumbnailPath: thumbnail?.path ?? null,
    framePaths: [],
    metadata: {
      id: capture.sourceId,
      platform: capture.platform,
      title: capture.title,
      description: capture.description,
      uploader: capture.creator,
      uploaderUrl: capture.creatorUrl,
      webpageUrl: capture.sourceUrl,
      uploadDate,
      durationSeconds: capture.durationSeconds,
      comments: capture.comments,
    },
  };

  try {
    const analysis = await analyzer.analyze(
      media,
      capture.translatedTranscript || capture.transcript,
      job.userNote,
    );
    const notePath = await vaultWriter.write({
      job,
      media,
      transcript: capture.transcript,
      sourceLanguage: capture.sourceLanguage,
      translatedTranscript: capture.translatedTranscript,
      translationLanguage: capture.translationLanguage,
      analysis,
      archivedVideoPath: video?.path ?? "",
      archivedAudioPath: audio?.path ?? "",
      archivedThumbnailPath: thumbnail?.path ?? null,
    });
    store.replaceCaptureAnalysis(capture.id, analysis, notePath);
    completed += 1;
    console.log(
      JSON.stringify({ captureId: capture.id, status: "complete", title: analysis.title }),
    );
  } catch (error) {
    failed += 1;
    console.error(
      JSON.stringify({
        captureId: capture.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

store.close();
console.log(JSON.stringify({ total: captures.length, completed, failed }));
if (failed) process.exitCode = 1;
