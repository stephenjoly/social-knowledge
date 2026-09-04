import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { VaultWriteInput } from "../src/types.js";
import { VaultWriter } from "../src/vault-writer.js";

describe("VaultWriter", () => {
  const roots: string[] = [];
  afterEach(async () => {
    for (const root of roots.splice(0))
      await rm(root, { recursive: true, force: true });
  });

  it("writes a sourced Markdown note atomically", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "social-knowledge-vault-"),
    );
    roots.push(root);
    const writer = new VaultWriter(root);
    const input = {
      job: {
        id: "00000000-0000-4000-8000-000000000001",
        ownerUserId: "00000000-0000-4000-8000-000000000099",
        sourceUrl: "https://www.instagram.com/reel/abc",
        normalizedUrl: "https://www.instagram.com/reel/abc",
        displayTitle: null,
        sourceHash: "hash",
        userNote: "Save for Lisbon",
        status: "writing",
        attempts: 1,
        error: null,
        errorCode: null,
        errorDetail: null,
        resultNotePath: null,
        createdAt: "2026-08-29T10:00:00.000Z",
        updatedAt: "2026-08-29T10:00:00.000Z",
        nextAttemptAt: "2026-08-29T10:00:00.000Z",
      },
      media: {
        workDir: "/tmp/work",
        videoPath: "/tmp/work/video.mp4",
        audioPath: "/tmp/work/audio.mp3",
        thumbnailPath: null,
        framePaths: [],
        metadata: {
          id: "abc",
          platform: "instagram",
          title: "Lisbon",
          description: "Seven restaurants",
          uploader: "creator",
          uploaderUrl: null,
          webpageUrl: "https://www.instagram.com/reel/abc",
          uploadDate: "20260820",
          durationSeconds: 45,
          comments: [],
        },
      },
      transcript: "Try these restaurants.",
      sourceLanguage: "English",
      translatedTranscript: null,
      translationLanguage: null,
      analysis: {
        title: "Seven Lisbon restaurants",
        synopsis: "A short list of restaurant recommendations.",
        whyUseful: "Useful for trip planning.",
        takeaways: ["Restaurant A is recommended for seafood."],
        topics: ["travel", "restaurants"],
        entities: [],
        recommendations: ["Review the restaurant list before the trip."],
        claimsNeedingVerification: ["Opening hours were not verified."],
        evidence: [],
        classification: {
          primaryDomain: "Travel",
          country: "Portugal",
          city: "Lisbon",
          subcategory: "Restaurants",
          secondaryTopics: [],
          confidence: 0.9,
        },
      },
      archivedVideoPath: "/media/video.mp4",
      archivedAudioPath: "/media/audio.mp3",
      archivedThumbnailPath: null,
    } satisfies VaultWriteInput;

    const relativePath = await writer.write(input);
    const markdown = await readFile(path.join(root, relativePath), "utf8");
    expect(relativePath).toBe(
      path.join(
        "Social Knowledge",
        "Users",
        input.job.ownerUserId,
        "Captures",
        "instagram-abc.md",
      ),
    );
    expect(markdown).toContain("# Seven Lisbon restaurants");
    expect(markdown).toContain(
      "source_url: https://www.instagram.com/reel/abc",
    );
    expect(markdown).toContain("Save for Lisbon");
  });
});
