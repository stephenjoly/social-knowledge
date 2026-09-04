import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import type { AppConfig } from "./config.js";
import type { JobStore } from "./db.js";
import type { CaptureRecord } from "./types.js";

export type KnowledgeFilters = {
  topic?: string | undefined;
  country?: string | undefined;
  city?: string | undefined;
  creator?: string | undefined;
  platform?: string | undefined;
  sourceType?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
};
export type KnowledgeCursor = {
  createdAt: string;
  id: string;
  score?: number;
};
export const encodeCursor = (cursor: KnowledgeCursor) =>
  Buffer.from(JSON.stringify(cursor)).toString("base64url");
export function decodeCursor(value?: string): KnowledgeCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString());
    if (
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== "string" ||
      !parsed.id
    )
      throw new Error("invalid_cursor");
    if (parsed.score !== undefined && !Number.isFinite(parsed.score))
      throw new Error("invalid_cursor");
    return parsed as KnowledgeCursor;
  } catch {
    throw new Error("invalid_cursor");
  }
}

export const isAfterCursor = (
  item: { createdAt: string; id: string },
  cursor: KnowledgeCursor | null,
) =>
  !cursor ||
  item.createdAt < cursor.createdAt ||
  (item.createdAt === cursor.createdAt && item.id < cursor.id);

export const isAfterSearchCursor = (
  item: { score: number; capture: CaptureRecord },
  cursor: KnowledgeCursor | null,
) =>
  !cursor ||
  item.score < (cursor.score ?? Number.POSITIVE_INFINITY) ||
  (item.score === cursor.score &&
    isAfterCursor(
      { createdAt: item.capture.createdAt, id: item.capture.id },
      cursor,
    ));

export function captureKnowledge(
  store: JobStore,
  capture: CaptureRecord,
  include: Set<string>,
  compact = false,
) {
  const assignment = store.libraryAssignment(capture.id);
  const breadcrumb = assignment
    ? store.libraryBreadcrumb(assignment.nodeId).map((node) => node.label)
    : [];
  const base = {
    schemaVersion: "1",
    id: capture.id,
    title: capture.title,
    creator: capture.creator,
    platform: capture.platform,
    sourceType: capture.sourceType,
    sourceUrl: capture.sourceUrl,
    synopsis: capture.synopsis,
    bottomLine: capture.whyUseful,
    takeaways: capture.analysis.takeaways ?? [],
    topics: capture.topics,
    secondaryFacets: store.libraryFacets(capture.id),
    breadcrumb,
    publishedAt: capture.publishedAt,
    capturedAt: capture.createdAt,
  };
  if (compact) return base;
  return {
    ...base,
    description: capture.description,
    sourceLanguage: capture.sourceLanguage,
    translationLanguage: capture.translationLanguage,
    entities: capture.analysis.entities,
    recommendations: capture.analysis.recommendations,
    evidence: capture.analysis.evidence,
    claimsNeedingVerification: capture.analysis.claimsNeedingVerification,
    classification: capture.analysis.classification,
    assets: capture.assets.map(({ kind, mimeType, sizeBytes, position }) => ({
      kind,
      mimeType,
      sizeBytes,
      position,
    })),
    ...(include.has("transcript")
      ? {
          transcript: capture.transcript,
          translatedTranscript: capture.translatedTranscript,
        }
      : {}),
    ...(include.has("comments") ? { comments: capture.comments } : {}),
  };
}
export function matchesKnowledge(
  store: JobStore,
  capture: CaptureRecord,
  filters: KnowledgeFilters,
) {
  const record = captureKnowledge(store, capture, new Set(), true);
  const breadcrumb = record.breadcrumb.map((part) => part.toLowerCase());
  const eq = (actual: string | null | undefined, wanted?: string) =>
    !wanted || actual?.toLowerCase() === wanted.toLowerCase();
  return (
    eq(capture.platform, filters.platform) &&
    eq(capture.sourceType, filters.sourceType) &&
    eq(capture.creator, filters.creator) &&
    (!filters.topic ||
      capture.topics.some(
        (topic) => topic.toLowerCase() === filters.topic!.toLowerCase(),
      ) ||
      record.secondaryFacets.some(
        (topic) => topic.toLowerCase() === filters.topic!.toLowerCase(),
      )) &&
    (!filters.country || breadcrumb.includes(filters.country.toLowerCase())) &&
    (!filters.city || breadcrumb.includes(filters.city.toLowerCase())) &&
    (!filters.from || capture.createdAt >= filters.from) &&
    (!filters.to || capture.createdAt <= filters.to)
  );
}

export class KnowledgeExporter {
  constructor(
    private store: JobStore,
    private config: AppConfig,
  ) {}
  async build(userId: string, id: string, include: Set<string>) {
    await mkdir(path.join(this.config.exportDir, userId), { recursive: true });
    const destination = path.join(
      this.config.exportDir,
      userId,
      `${id}.jsonl.gz`,
    );
    try {
      let count = 0;
      const lines = (function* (exporter: KnowledgeExporter) {
        for (const capture of exporter.store.iterateOwnedCaptures(userId)) {
          count++;
          yield JSON.stringify(
            captureKnowledge(exporter.store, capture, include),
          ) + "\n";
        }
      })(this);
      await pipeline(
        Readable.from(lines),
        createGzip(),
        createWriteStream(destination, { mode: 0o600 }),
      );
      this.store.completeKnowledgeExport(userId, id, destination, count);
    } catch (error) {
      await rm(destination, { force: true });
      this.store.failKnowledgeExport(userId, id, "export_failed");
      throw error;
    }
  }
  async recoverInterrupted() {
    for (const item of this.store.pendingKnowledgeExports()) {
      await rm(
        path.join(this.config.exportDir, item.userId, `${item.id}.jsonl.gz`),
        {
          force: true,
        },
      );
      this.store.failKnowledgeExport(
        item.userId,
        item.id,
        "export_interrupted",
      );
    }
  }
  async cleanup() {
    for (const item of this.store.expiredKnowledgeExports()) {
      if (item.path) await rm(item.path, { force: true });
      this.store.deleteKnowledgeExport(item.id);
    }
  }
}
