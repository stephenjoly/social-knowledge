import { createReadStream } from "node:fs";
import OpenAI from "openai";
import type { AppConfig } from "./config.js";

export class Transcriber {
  constructor(
    private readonly defaultClient: OpenAI,
    private readonly config: AppConfig,
    private readonly userClient?: (userId: string) => OpenAI,
  ) {}

  async transcribe(
    audioPath: string,
    userId: string,
    provider: "openai" | "cerebras" | null,
  ): Promise<string> {
    const client =
      provider === "openai" && this.userClient
        ? this.userClient(userId)
        : this.defaultClient;
    const result = await client.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model: this.config.transcriptionModel,
      response_format: "text",
    });
    return result.trim();
  }
}
