import { describe, expect, it } from "vitest";
import { normalizeSocialUrl } from "../src/url.js";

describe("normalizeSocialUrl", () => {
  it("normalizes an Instagram Reel and removes tracking", () => {
    const result = normalizeSocialUrl("https://www.instagram.com/reel/ABC123/?utm_source=share#fragment");
    expect(result.platform).toBe("instagram");
    expect(result.normalized).toBe("https://www.instagram.com/reel/ABC123");
    expect(result.hash).toHaveLength(64);
  });

  it("accepts Facebook share hosts", () => {
    expect(normalizeSocialUrl("https://fb.watch/example/").platform).toBe("facebook");
  });

  it.each([
    "http://www.instagram.com/reel/example",
    "https://example.com/video",
    "not a url",
  ])("rejects unsafe or unsupported input: %s", (url) => {
    expect(() => normalizeSocialUrl(url)).toThrow();
  });
});
