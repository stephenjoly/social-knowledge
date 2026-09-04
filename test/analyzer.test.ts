import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { Analyzer } from "../src/analyzer.js";
import type { ProcessedMedia } from "../src/types.js";
import { testConfig } from "./helpers.js";

describe("Analyzer", () => {
  it("returns concrete takeaways using the strict structured schema", async () => {
    const create = vi.fn(async (_request: Record<string, unknown>) => ({
      output_text: JSON.stringify({
        title: "Three home-decor sellers",
        synopsis: "The clip identifies sellers and the products they carry.",
        whyUseful: "Use the seller-to-product mappings as a sourcing shortlist.",
        takeaways: [
          "Seller A sells lamps.",
          "Seller B sells miniature furniture.",
        ],
        topics: ["shopping", "home decor"],
        entities: [],
        recommendations: [],
        claimsNeedingVerification: [],
        evidence: [],
        classification: { primaryDomain: "Home & Design", country: null, city: null, subcategory: "Home & Design", secondaryTopics: ["shopping"], confidence: 0.92 },
      }),
    }));
    const client = { responses: { create } } as unknown as OpenAI;
    const media: ProcessedMedia = {
      workDir: "/tmp/analyzer",
      videoPath: "/tmp/analyzer/video.mp4",
      audioPath: "/tmp/analyzer/audio.mp3",
      thumbnailPath: null,
      framePaths: [],
      metadata: {
        id: "example",
        platform: "instagram",
        title: "Sellers",
        description: "Seller A: lamps. Seller B: miniature furniture.",
        uploader: "creator",
        uploaderUrl: null,
        webpageUrl: "https://www.instagram.com/reel/example",
        uploadDate: null,
        durationSeconds: 30,
        comments: [],
      },
    };

    const result = await new Analyzer(
      client,
      testConfig("/tmp/analyzer-test"),
    ).analyze(media, "Seller A sells lamps.", null);

    expect(result.takeaways).toEqual([
      "Seller A sells lamps.",
      "Seller B sells miniature furniture.",
    ]);
    const request = create.mock.calls[0]?.[0] as {
      instructions?: string;
      text?: { format?: unknown };
    };
    expect(request.instructions).toContain("Seller X sells Y");
    expect(request.text?.format).toMatchObject({
      type: "json_schema",
      strict: true,
    });
  });
});
