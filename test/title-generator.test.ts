import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { TitleGenerator } from "../src/title-generator.js";
import type { ProcessedMedia } from "../src/types.js";
import { testConfig } from "./helpers.js";

describe("TitleGenerator", () => {
  it("requests a short structured title with low reasoning effort", async () => {
    const create = vi.fn(async (_request: Record<string, unknown>) => ({
      output_text: JSON.stringify({
        title: "Seven Lisbon restaurants and what to order",
      }),
    }));
    const client = { responses: { create } } as unknown as OpenAI;
    const media = {
      workDir: "/tmp/title",
      videoPath: "/tmp/title/video.mp4",
      audioPath: "/tmp/title/audio.mp3",
      thumbnailPath: null,
      framePaths: [],
      metadata: {
        id: "title",
        platform: "instagram",
        title: "Lisbon food",
        description: "Seven places to eat in Lisbon.",
        uploader: "creator",
        uploaderUrl: null,
        webpageUrl: "https://www.instagram.com/reel/title",
        uploadDate: null,
        durationSeconds: 30,
        comments: [],
      },
    } satisfies ProcessedMedia;

    const title = await new TitleGenerator(
      client,
      testConfig("/tmp/title-test"),
    ).generate(media, "Try these seven restaurants.");

    expect(title).toBe("Seven Lisbon restaurants and what to order");
    const request = create.mock.calls[0]?.[0] as {
      reasoning?: { effort?: string };
      text?: { verbosity?: string; format?: unknown };
    };
    expect(request.reasoning?.effort).toBe("low");
    expect(request.text?.verbosity).toBe("low");
    expect(request.text?.format).toMatchObject({
      type: "json_schema",
      strict: true,
    });
  });
});
