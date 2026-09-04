import OpenAI from "openai";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { ProcessedMedia } from "./types.js";

const titleSchema = z.object({ title: z.string().min(1).max(160) });

export class TitleGenerator {
  constructor(
    private readonly client: OpenAI,
    private readonly config: AppConfig,
  ) {}

  async generate(media: ProcessedMedia, transcript: string): Promise<string> {
    const comments = media.metadata.comments
      .slice(0, 5)
      .map((comment) => comment.text)
      .join("\n");
    const response = await this.client.responses.create({
      model: this.config.analysisModel,
      reasoning: { effort: "low" },
      instructions: [
        "Write one immediately useful title for a saved social post.",
        "Name the actual subject and preserve important people, places, sellers, products, or list scope.",
        "Prefer a concrete knowledge label over clickbait, generic phrasing, or commentary.",
        "Use only the supplied material and return no more than 160 characters.",
      ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Platform title: ${media.metadata.title ?? "unavailable"}`,
                `Description: ${media.metadata.description ?? "unavailable"}`,
                `Transcript: ${transcript || "unavailable"}`,
                `Selected comments: ${comments || "unavailable"}`,
              ].join("\n\n"),
            },
          ],
        },
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "social_knowledge_title",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["title"],
            properties: { title: { type: "string", maxLength: 160 } },
          },
        },
      },
    });
    if (!response.output_text) throw new Error("Title model returned no output");
    return titleSchema.parse(JSON.parse(response.output_text)).title.trim();
  }
}
