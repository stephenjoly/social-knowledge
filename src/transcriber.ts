import { createReadStream } from "node:fs";
import OpenAI from "openai";

export class Transcriber {
  constructor(
    private readonly userClient: (userId: string) => OpenAI,
  ) {}

  async transcribe(
    audioPath: string,
    userId: string,
    model: string,
  ): Promise<string> {
    const client = this.userClient(userId);
    const result = await client.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model,
      response_format: "text",
    });
    return result.trim();
  }
}
