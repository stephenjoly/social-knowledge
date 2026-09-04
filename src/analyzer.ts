import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { AnalysisResult, ProcessedMedia } from "./types.js";
import { libraryDomains, librarySubcategories } from "./library.js";

const analysisSchema = z.object({
  title: z.string().min(1),
  synopsis: z.string().min(1),
  whyUseful: z.string().nullable(),
  takeaways: z.array(z.string()).min(1).max(8),
  topics: z.array(z.string()),
  entities: z.array(z.object({
    name: z.string(),
    type: z.enum(["place", "restaurant", "product", "person", "organization", "other"]),
    location: z.string().nullable(),
    description: z.string().nullable(),
    confidence: z.number().min(0).max(1),
  })),
  recommendations: z.array(z.string()),
  claimsNeedingVerification: z.array(z.string()),
  evidence: z.array(z.object({
    claim: z.string(),
    source: z.enum(["transcript", "description", "frame", "comment"]),
    timestampSeconds: z.number().nonnegative().nullable(),
    quote: z.string().nullable(),
  })),
  classification: z.object({
    primaryDomain: z.enum(libraryDomains),
    country: z.string().nullable(),
    city: z.string().nullable(),
    subcategory: z.enum(librarySubcategories),
    secondaryTopics: z.array(z.string()).max(8),
    confidence: z.number().min(0).max(1),
  }),
});

const outputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "synopsis", "whyUseful", "takeaways", "topics", "entities", "recommendations", "claimsNeedingVerification", "evidence", "classification"],
  properties: {
    title: { type: "string" },
    synopsis: { type: "string" },
    whyUseful: { type: ["string", "null"] },
    takeaways: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string" },
    },
    topics: { type: "array", items: { type: "string" } },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "type", "location", "description", "confidence"],
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["place", "restaurant", "product", "person", "organization", "other"] },
          location: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    recommendations: { type: "array", items: { type: "string" } },
    claimsNeedingVerification: { type: "array", items: { type: "string" } },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "source", "timestampSeconds", "quote"],
        properties: {
          claim: { type: "string" },
          source: { type: "string", enum: ["transcript", "description", "frame", "comment"] },
          timestampSeconds: { type: ["number", "null"], minimum: 0 },
          quote: { type: ["string", "null"] },
        },
      },
    },
    classification: {
      type: "object",
      additionalProperties: false,
      required: ["primaryDomain", "country", "city", "subcategory", "secondaryTopics", "confidence"],
      properties: {
        primaryDomain: { type: "string", enum: libraryDomains },
        country: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        subcategory: { type: "string", enum: librarySubcategories },
        secondaryTopics: { type: "array", maxItems: 8, items: { type: "string" } },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
    },
  },
} as const;

export class Analyzer {
  constructor(
    private readonly client: OpenAI,
    private readonly config: AppConfig,
  ) {}

  async analyze(media: ProcessedMedia, transcript: string, userNote: string | null): Promise<AnalysisResult> {
    const comments = media.metadata.comments
      .map((comment) => `${comment.isPinned ? "[pinned] " : ""}${comment.author ?? "unknown"}: ${comment.text}`)
      .join("\n");

    const context = [
      `Source URL: ${media.metadata.webpageUrl}`,
      `Creator: ${media.metadata.uploader ?? "unknown"}`,
      `User note: ${userNote ?? "none"}`,
      `Description:\n${media.metadata.description ?? "unavailable"}`,
      `Transcript:\n${transcript || "unavailable"}`,
      `Selected comments:\n${comments || "unavailable"}`,
    ].join("\n\n");

    const imageInputs = await Promise.all(
      media.framePaths.slice(0, 8).map(async (framePath) => ({
        type: "input_image" as const,
        image_url: `data:image/jpeg;base64,${(await readFile(framePath)).toString("base64")}`,
        detail: "low" as const,
      })),
    );

    const response = await this.client.responses.create({
      model: this.config.analysisModel,
      instructions: [
        "Turn this social post into a decision-useful knowledge brief.",
        "Write a specific title and a 2-4 sentence synopsis explaining what the post actually covers.",
        "Use whyUseful as a 1-2 sentence bottom line that answers 'so what should I understand or remember?' Avoid generic phrases such as 'this is useful for'.",
        "Produce 3-8 concrete, standalone takeaways. Preserve names and explicit relationships. For lists or comparisons, use direct mappings such as 'Seller X sells Y' or 'Restaurant X is recommended for Y' rather than a vague narrative summary.",
        "Put only source-supported actions in recommendations; do not invent generic next steps.",
        "Entities are supporting reference data, not the primary summary.",
        "Classify using only the supplied controlled domain and subcategory values. Destination-planning content belongs under Travel; recipes and non-trip-specific food knowledge belong under Food & Drink.",
        "Use country and city only when clearly supported. If classification is uncertain, choose Other with confidence below 0.65.",
        "Use only the supplied source material. Never invent an address, identity, fact, or timestamp.",
        "Treat recommendations and comments as claims, not verified facts.",
        "Prefer concise topics. Include evidence for important claims and use null when unavailable.",
      ].join(" "),
      input: [{
        role: "user",
        content: [{ type: "input_text", text: context }, ...imageInputs],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "social_knowledge",
          strict: true,
          schema: outputJsonSchema,
        },
      },
    });

    if (!response.output_text) throw new Error("Analysis model returned no structured output");
    return analysisSchema.parse(JSON.parse(response.output_text));
  }
}
