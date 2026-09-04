import { describe, expect, it } from "vitest";
import { durationMatchFilter, selectComments } from "../src/downloader.js";

describe("download limits", () => {
  it("allows unknown extractor duration for post-download ffprobe enforcement", () => {
    expect(durationMatchFilter(1800)).toBe("duration <=? 1800");
  });
});

describe("comment selection", () => {
  it("prioritizes pinned and liked comments and caps the result", () => {
    const comments = selectComments(
      [
        { author: "Low", text: "Useful", like_count: 1 },
        { author: "Popular", text: "Very useful", like_count: 20 },
        { author: "Pinned", text: "Creator note", is_pinned: true },
        { author: "Empty", text: "" },
      ],
      2,
    );

    expect(comments).toEqual([
      {
        author: "Pinned",
        text: "Creator note",
        likeCount: null,
        isPinned: true,
      },
      {
        author: "Popular",
        text: "Very useful",
        likeCount: 20,
        isPinned: false,
      },
    ]);
  });
});
