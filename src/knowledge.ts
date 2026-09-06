import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import tar from "tar-stream";
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
  async buildFull(userId: string, id: string) {
    const directory = path.join(this.config.exportDir, userId),
      destination = path.join(directory, `${id}.tar.gz`),
      captures = this.store.ownedCaptures(userId),
      pack = tar.pack(),
      gzip = createGzip({ level: 6 });
    await mkdir(directory, { recursive: true });
    const writing = pipeline(
      pack,
      gzip,
      createWriteStream(destination, { mode: 0o600 }),
    );
    const addBuffer = (name: string, value: string | Buffer) =>
      new Promise<void>((resolve, reject) =>
        pack.entry({ name, mode: 0o600, mtime: new Date(0) }, value, (error) =>
          error ? reject(error) : resolve(),
        ),
      );
    const addFile = async (name: string, filename: string) => {
      const info = await stat(filename);
      await new Promise<void>((resolve, reject) => {
        const entry = pack.entry(
          { name, size: info.size, mode: 0o600, mtime: info.mtime },
          (error) => (error ? reject(error) : resolve()),
        );
        createReadStream(filename).on("error", reject).pipe(entry);
      });
    };
    try {
      const manifest = {
        schemaVersion: "1",
        exportType: "social-knowledge-full-library",
        exportedAt: new Date().toISOString(),
        captureCount: captures.length,
        contents: {
          metadata: "captures/<capture-id>/metadata.json",
          markdown: "captures/<capture-id>/note.md",
          assets: "captures/<capture-id>/assets/<position>-<kind>.<extension>",
        },
      };
      await addBuffer("manifest.json", JSON.stringify(manifest, null, 2));
      await addBuffer(
        "README.txt",
        "Social Knowledge full library backup\n\nThis archive contains account-owned metadata, transcripts, comments, Markdown notes, and archived media. It intentionally excludes passwords, sessions, API keys, OAuth credentials, server cookies, and application configuration.\n",
      );
      for (const capture of captures) {
        const base = `captures/${capture.id}`;
        await addBuffer(
          `${base}/metadata.json`,
          JSON.stringify(
            captureKnowledge(
              this.store,
              capture,
              new Set(["transcript", "comments"]),
            ),
            null,
            2,
          ),
        );
        const note = path.isAbsolute(capture.notePath)
          ? capture.notePath
          : path.join(this.config.vaultDir, capture.notePath);
        try {
          await access(note);
          await addBuffer(`${base}/note.md`, await readFile(note));
        } catch {
          await addBuffer(
            `${base}/note-unavailable.txt`,
            "The generated Markdown note was unavailable when this backup was created. Structured metadata is present in metadata.json.\n",
          );
        }
        for (const asset of capture.assets) {
          const extension =
            path.extname(asset.path).replace(/^\./, "") || "bin";
          await addFile(
            `${base}/assets/${String(asset.position).padStart(3, "0")}-${asset.kind}.${extension}`,
            asset.path,
          );
        }
      }
      pack.finalize();
      await writing;
      this.store.completeKnowledgeExport(
        userId,
        id,
        destination,
        captures.length,
      );
    } catch (error) {
      pack.destroy(error instanceof Error ? error : new Error(String(error)));
      await writing.catch(() => undefined);
      await rm(destination, { force: true });
      this.store.failKnowledgeExport(userId, id, "backup_failed");
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
      await rm(
        path.join(this.config.exportDir, item.userId, `${item.id}.tar.gz`),
        { force: true },
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
