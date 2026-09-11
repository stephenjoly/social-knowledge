import { describe, expect, it } from "vitest";
import { selectThumbnailPath } from "../src/media-processor.js";

describe("selectThumbnailPath", () => {
  it("preserves an upstream thumbnail", () => {
    expect(
      selectThumbnailPath("/work/source.webp", ["/work/frames/001.jpg"]),
    ).toBe("/work/source.webp");
  });

  it("uses the first extracted JPEG when the upstream thumbnail is absent", () => {
    expect(
      selectThumbnailPath(null, [
        "/work/frames/001.jpg",
        "/work/frames/002.jpg",
      ]),
    ).toBe("/work/frames/001.jpg");
  });

  it("allows processing to continue without a thumbnail or frame", () => {
    expect(selectThumbnailPath(null, [])).toBeNull();
  });
});
