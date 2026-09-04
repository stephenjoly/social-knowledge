import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { AppConfig } from "./config.js";
import type { JobStore } from "./db.js";
import type { AnalysisResult, AssetKind } from "./types.js";

function section(markdown: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(`^## ${escaped}\\s*\\n([\\s\\S]*?)(?=^## |$)`, "mi")
      .exec(markdown)?.[1]
      ?.trim() ?? ""
  );
}

function bullets(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? null : String(value);
}

export async function migrateLegacyCaptures(
  store: JobStore,
  config: AppConfig,
): Promise<number> {
  let migrated = 0;
  const ownerUserId = store.defaultUserId();
  if (!ownerUserId) return 0;
  for (const job of store.list(ownerUserId, 1000)) {
    if (
      job.status !== "complete" ||
      !job.resultNotePath ||
      store.getCaptureByJobId(job.id)
    )
      continue;
    try {
      const notePath = path.isAbsolute(job.resultNotePath)
        ? job.resultNotePath
        : path.join(config.vaultDir, job.resultNotePath);
      const markdown = await readFile(notePath, "utf8");
      const frontmatterMatch = /^---\s*\n([\s\S]*?)\n---\s*\n/.exec(markdown);
      if (!frontmatterMatch) continue;
      const frontmatter = parseYaml(frontmatterMatch[1] ?? "") as Record<
        string,
        unknown
      >;
      const platform = text(frontmatter.platform) ?? "unknown";
      const sourceId = text(frontmatter.source_id) ?? job.id;
      if (store.getCaptureBySource(ownerUserId, platform, sourceId)) continue;
      const body = markdown.slice(frontmatterMatch[0].length);
      const title =
        /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? "Archived social capture";
      const synopsis = body
        .slice(
          0,
          body.indexOf("\n## ") >= 0 ? body.indexOf("\n## ") : undefined,
        )
        .replace(/^#.*\n+/, "")
        .trim();
      const entityNames = Array.isArray(frontmatter.entities)
        ? frontmatter.entities.map(String)
        : [];
      const topics = Array.isArray(frontmatter.topics)
        ? frontmatter.topics.map(String)
        : [];
      const entities: AnalysisResult["entities"] = entityNames.map((name) => ({
        name,
        type: "other",
        location: null,
        description: null,
        confidence: 0.5,
      }));
      const analysis: AnalysisResult = {
        title,
        synopsis:
          synopsis || "Imported from the existing Social Knowledge archive.",
        whyUseful:
          section(body, "Bottom line") ||
          section(body, "Why this may be useful") ||
          null,
        takeaways: bullets(section(body, "Key takeaways")),
        topics,
        entities,
        recommendations: bullets(
          section(body, "Actions and recommendations") ||
            section(body, "Recommendations"),
        ),
        claimsNeedingVerification: bullets(
          section(body, "Claims requiring verification"),
        ),
        evidence: [],
        classification: {
          primaryDomain: "Other",
          country: null,
          city: null,
          subcategory: "Other",
          secondaryTopics: [],
          confidence: 0,
        },
      };
      const assetSpecs: Array<{
        kind: AssetKind;
        key: string;
        mimeType: string;
        position: number;
      }> = [
        {
          kind: "video",
          key: "archive_video",
          mimeType: "video/mp4",
          position: 0,
        },
        {
          kind: "audio",
          key: "archive_audio",
          mimeType: "audio/mpeg",
          position: 1,
        },
        {
          kind: "thumbnail",
          key: "archive_thumbnail",
          mimeType: "image/jpeg",
          position: 2,
        },
      ];
      const assets = [];
      for (const spec of assetSpecs) {
        const archivePath = text(frontmatter[spec.key]);
        if (!archivePath) continue;
        const resolved = path.isAbsolute(archivePath)
          ? archivePath
          : path.join(config.mediaDir, archivePath);
        const file = await stat(resolved);
        assets.push({
          kind: spec.kind,
          path: resolved,
          mimeType: spec.mimeType,
          sizeBytes: file.size,
          position: spec.position,
        });
      }
      store.createCapture({
        job,
        sourceType: "video",
        sourceId,
        platform,
        title,
        creator: text(frontmatter.creator),
        creatorUrl: text(frontmatter.creator_url),
        description: section(body, "Source description") || null,
        transcript: section(body, "Transcript"),
        sourceLanguage: text(frontmatter.source_language),
        translatedTranscript: null,
        translationLanguage: text(frontmatter.translation_language),
        comments: [],
        analysis,
        publishedAt: text(frontmatter.published_at),
        durationSeconds:
          typeof frontmatter.duration_seconds === "number"
            ? frontmatter.duration_seconds
            : null,
        notePath,
        assets,
      });
      migrated += 1;
    } catch (error) {
      // A legacy export is portable data, not a startup dependency. Leave it untouched if malformed.
      console.warn(
        "Unable to catalog legacy capture",
        job.id,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return migrated;
}
