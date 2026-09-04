import OpenAI from "openai";
import { z } from "zod";
import type { AppConfig } from "./config.js";

const resultSchema = z.object({
  sourceLanguage: z.string().min(1),
  sameAsDefault: z.boolean(),
  translatedTranscript: z.string().nullable(),
});
const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sourceLanguage", "sameAsDefault", "translatedTranscript"],
  properties: {
    sourceLanguage: { type: "string" },
    sameAsDefault: { type: "boolean" },
    translatedTranscript: { type: ["string", "null"] },
  },
} as const;
export type TranslationResult = z.infer<typeof resultSchema>;

export class Translator {
  constructor(
    private readonly client: OpenAI,
    private readonly config: AppConfig,
  ) {}
  async translate(
    transcript: string,
    defaultLanguage: string,
    enabled: boolean,
  ): Promise<TranslationResult> {
    if (!transcript.trim())
      return {
        sourceLanguage: "undetermined",
        sameAsDefault: true,
        translatedTranscript: null,
      };
    const response = await this.client.responses.create({
      model: this.config.analysisModel,
      instructions: [
        "Identify the primary language of the transcript.",
        `The user's default language is ${defaultLanguage}.`,
        enabled
          ? "If the transcript is not already in the default language, translate it faithfully and completely. Preserve names, places, quantities, and uncertainty."
          : "Do not translate; return null for translatedTranscript.",
        "If it is already in the default language, return null for translatedTranscript.",
      ].join(" "),
      input: transcript,
      text: {
        format: {
          type: "json_schema",
          name: "transcript_translation",
          strict: true,
          schema: outputSchema,
        },
      },
    });
    if (!response.output_text)
      throw new Error("Translation model returned no structured output");
    return resultSchema.parse(JSON.parse(response.output_text));
  }
}
