import { createReadStream } from "node:fs";
import OpenAI from "openai";
import type { AppConfig } from "./config.js";

export class Transcriber {
  constructor(
    private readonly client: OpenAI,
    private readonly config: AppConfig,
  ) {}

  async transcribe(audioPath: string): Promise<string> {
    const result = await this.client.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model: this.config.transcriptionModel,
      response_format: "text",
    });
    return result.trim();
  }
}
