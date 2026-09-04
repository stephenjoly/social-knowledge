import { describe, expect, it } from "vitest";
import { classifyPlatformFailure, normalizeFailure } from "../src/failures.js";

describe("friendly capture failures", () => {
  it.each([
    ["cookies are no longer valid; login required", "authentication_required"],
    ["This video is private", "private_post"],
    ["HTTP Error 404: does not exist", "unavailable"],
    ["Unsupported URL", "unsupported_format"],
    ["File is larger than max-filesize", "archive_limit"],
    ["HTTP Error 429: Too Many Requests", "platform_temporary"],
  ])("classifies %s", (diagnostic, code) => {
    expect(classifyPlatformFailure(diagnostic).code).toBe(code);
  });

  it("keeps diagnostics separate from friendly copy", () => {
    const failure = normalizeFailure(
      classifyPlatformFailure("cookies expired; login required"),
    );
    expect(failure.title).toBe("Login cookie expired");
    expect(failure.message).not.toContain("cookies expired;");
    expect(failure.diagnostic).toContain("cookies expired");
  });
});
