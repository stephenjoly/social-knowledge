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

  it.each([
    [Object.assign(new Error("provider rejected test credential"), { status: 401 }), "ai_credentials_rejected"],
    [Object.assign(new Error("quota details are private"), { status: 429, code: "insufficient_quota" }), "ai_quota_exceeded"],
    [Object.assign(new Error("rate details are private"), { status: 429, code: "rate_limit_exceeded" }), "ai_rate_limited"],
    [Object.assign(new Error("model details are private"), { status: 404, code: "model_not_found" }), "ai_model_unavailable"],
    [new Error("model_unavailable"), "ai_model_unavailable"],
  ])("maps trusted provider metadata to %s", (error, code) => {
    const failure = normalizeFailure(error, "analyzing");
    expect(failure.code).toBe(code);
    expect(failure.message).not.toContain("private");
  });
});
