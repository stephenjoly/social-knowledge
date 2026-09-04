import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import type { VaultWriteInput } from "./types.js";

export class VaultWriter {
  constructor(private readonly vaultDir: string) {}

  async write(input: VaultWriteInput): Promise<string> {
    const relativeDir = path.join(
      "Social Knowledge",
      "Users",
      input.job.ownerUserId,
      "Captures",
    );
    const absoluteDir = path.join(this.vaultDir, relativeDir);
    await mkdir(absoluteDir, { recursive: true });

    const platform = this.slug(input.media.metadata.platform || "social");
    const sourceId = this.slug(
      input.media.metadata.id || input.job.id.slice(0, 8),
    );
    const filename = `${platform}-${sourceId}.md`;
    const relativePath = path.join(relativeDir, filename);
    const absolutePath = path.join(this.vaultDir, relativePath);
    const temporaryPath = `${absolutePath}.${input.job.id}.tmp`;

    const properties = {
      type: "social-insight",
      status: "processed",
      source_url: input.media.metadata.webpageUrl,
      platform: input.media.metadata.platform,
      source_id: input.media.metadata.id,
      creator: input.media.metadata.uploader,
      creator_url: input.media.metadata.uploaderUrl,
      published_at: this.formatUploadDate(input.media.metadata.uploadDate),
      captured_at: input.job.createdAt,
      duration_seconds: input.media.metadata.durationSeconds,
      topics: input.analysis.topics,
      entities: input.analysis.entities.map((entity) => entity.name),
      archive_video: input.archivedVideoPath,
      archive_audio: input.archivedAudioPath,
      archive_thumbnail: input.archivedThumbnailPath,
      transcript_available: Boolean(input.transcript),
      source_language: input.sourceLanguage,
      translation_language: input.translationLanguage,
      comments_available: input.media.metadata.comments.length > 0,
      ingestion_job: input.job.id,
      primary_domain: input.analysis.classification.primaryDomain,
      country: input.analysis.classification.country,
      city: input.analysis.classification.city,
      subcategory: input.analysis.classification.subcategory,
      secondary_topics: input.analysis.classification.secondaryTopics,
      classification_confidence: input.analysis.classification.confidence,
    };

    const markdown = [
      "---",
      stringify(properties, { lineWidth: 0 }).trimEnd(),
      "---",
      "",
      `# ${input.analysis.title}`,
      "",
      input.analysis.synopsis,
      "",
      ...(input.analysis.whyUseful
        ? ["## Bottom line", "", input.analysis.whyUseful, ""]
        : []),
      "## Key takeaways",
      "",
      ...(input.analysis.takeaways.length
        ? input.analysis.takeaways.map((item) => `- ${item}`)
        : ["- None extracted."]),
      "",
      "## Actions and recommendations",
      "",
      ...(input.analysis.recommendations.length
        ? input.analysis.recommendations.map((item) => `- ${item}`)
        : ["- None extracted."]),
      "",
      "## Entities",
      "",
      ...(input.analysis.entities.length
        ? input.analysis.entities.map(
            (entity) =>
              `- **${entity.name}** (${entity.type}, ${Math.round(entity.confidence * 100)}% confidence)${entity.location ? ` — ${entity.location}` : ""}${entity.description ? `: ${entity.description}` : ""}`,
          )
        : ["- None extracted."]),
      "",
      "## Evidence",
      "",
      ...(input.analysis.evidence.length
        ? input.analysis.evidence.map((item) => {
            const timestamp =
              item.timestampSeconds === null
                ? ""
                : ` at ${this.timestamp(item.timestampSeconds)}`;
            const quote = item.quote
              ? ` — “${item.quote.replaceAll("\n", " ")}”`
              : "";
            return `- ${item.claim} _(${item.source}${timestamp})_${quote}`;
          })
        : ["- No evidence items extracted."]),
      "",
      "## Claims requiring verification",
      "",
      ...(input.analysis.claimsNeedingVerification.length
        ? input.analysis.claimsNeedingVerification.map((claim) => `- ${claim}`)
        : ["- None identified."]),
      "",
      "## Source description",
      "",
      input.media.metadata.description ?? "_Unavailable._",
      "",
      "## Selected comments",
      "",
      ...(input.media.metadata.comments.length
        ? input.media.metadata.comments.map(
            (comment) =>
              `- ${comment.isPinned ? "📌 " : ""}**${comment.author ?? "Unknown"}:** ${comment.text}${comment.likeCount === null ? "" : ` (${comment.likeCount} likes)`}`,
          )
        : ["_Unavailable._"]),
      "",
      "## Transcript",
      "",
      input.transcript || "_Unavailable._",
      "",
      ...(input.translatedTranscript
        ? [
            `## Transcript — ${input.translationLanguage ?? "translated"}`,
            "",
            input.translatedTranscript,
            "",
          ]
        : []),
      "## Source",
      "",
      `- [Open original post](${input.media.metadata.webpageUrl})`,
      `- Archived video: \`${input.archivedVideoPath}\``,
      `- Archived audio: \`${input.archivedAudioPath}\``,
      ...(input.job.userNote
        ? ["", "## Capture note", "", input.job.userNote]
        : []),
      "",
    ].join("\n");

    await writeFile(temporaryPath, markdown, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, absolutePath);
    return relativePath;
  }

  private slug(value: string): string {
    const slug = value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return slug || "unknown";
  }

  private formatUploadDate(value: string | null): string | null {
    if (!value || !/^\d{8}$/.test(value)) return value;
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  private timestamp(seconds: number): string {
    const whole = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(whole / 60);
    return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
  }
}
