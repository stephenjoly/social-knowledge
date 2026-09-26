export const failureCodes = [
  "authentication_required",
  "private_post",
  "unavailable",
  "unsupported_format",
  "archive_limit",
  "platform_temporary",
  "processing_failed",
  "ai_failed",
  "ai_credentials_rejected",
  "ai_quota_exceeded",
  "ai_rate_limited",
  "ai_model_unavailable",
  "unknown",
] as const;

export type FailureCode = (typeof failureCodes)[number];

const copy: Record<FailureCode, { title: string; message: string }> = {
  authentication_required: {
    title: "Login cookie expired",
    message: "Refresh the saved login cookies for this platform, then retry.",
  },
  private_post: {
    title: "Private post",
    message:
      "The post is private or the connected account does not have access.",
  },
  unavailable: {
    title: "Post unavailable",
    message: "The post was removed, expired, or is not available at this URL.",
  },
  unsupported_format: {
    title: "Post type not supported yet",
    message: "This archive currently handles video posts and Reels.",
  },
  archive_limit: {
    title: "Archive limit exceeded",
    message: "The media is longer or larger than the configured archive limit.",
  },
  platform_temporary: {
    title: "Platform temporarily unavailable",
    message:
      "Facebook or Instagram refused the download. Wait a little and retry.",
  },
  processing_failed: {
    title: "Media processing failed",
    message:
      "The post downloaded, but its video or audio could not be processed.",
  },
  ai_failed: {
    title: "Knowledge extraction failed",
    message:
      "The media was downloaded, but transcription or analysis did not finish.",
  },
  ai_credentials_rejected: {
    title: "AI credentials rejected",
    message: "Reconnect the AI provider, then retry this capture.",
  },
  ai_quota_exceeded: {
    title: "AI provider quota exceeded",
    message: "Add provider credits or increase the quota, then retry.",
  },
  ai_rate_limited: {
    title: "AI provider rate limit reached",
    message: "Wait a little, then retry this capture.",
  },
  ai_model_unavailable: {
    title: "AI model unavailable",
    message: "Choose or configure an available AI model, then retry.",
  },
  unknown: {
    title: "Capture failed",
    message:
      "Something unexpected interrupted this capture. Retry or inspect the diagnostic.",
  },
};

export class CaptureFailure extends Error {
  constructor(
    readonly code: FailureCode,
    readonly diagnostic: string,
  ) {
    super(copy[code].message);
    this.name = "CaptureFailure";
  }
}

export function failureCopy(code: FailureCode) {
  return copy[code];
}

export function normalizeFailure(error: unknown, stage?: string) {
  if (error instanceof CaptureFailure) {
    return {
      code: error.code,
      ...copy[error.code],
      diagnostic: error.diagnostic,
    };
  }
  const diagnostic = error instanceof Error ? error.message : String(error);
  const providerCode = ["transcribing", "translating", "analyzing"].includes(stage ?? "")
    ? providerFailureCode(error, diagnostic)
    : null;
  if (providerCode)
    return { code: providerCode, ...copy[providerCode], diagnostic };
  const code: FailureCode =
    stage === "transcribing" || stage === "translating" || stage === "analyzing"
      ? "ai_failed"
      : stage === "processing" || stage === "writing"
        ? "processing_failed"
        : "unknown";
  return { code, ...copy[code], diagnostic };
}

function providerFailureCode(
  error: unknown,
  diagnostic: string,
): FailureCode | null {
  if (diagnostic === "model_unavailable") return "ai_model_unavailable";
  if (!error || typeof error !== "object") return null;
  const status = "status" in error ? error.status : undefined;
  const code = "code" in error ? error.code : undefined;
  if (status === 401 || status === 403) return "ai_credentials_rejected";
  if (status === 429)
    return code === "insufficient_quota"
      ? "ai_quota_exceeded"
      : "ai_rate_limited";
  if (status === 404 && code === "model_not_found")
    return "ai_model_unavailable";
  return null;
}

export function classifyPlatformFailure(detailInput: string) {
  const detail = detailInput.toLowerCase();
  if (/private/.test(detail))
    return new CaptureFailure("private_post", detailInput);
  if (
    /login|cookie|authentication|not available to anonymous|sign in/.test(
      detail,
    )
  )
    return new CaptureFailure("authentication_required", detailInput);
  if (/not available|removed|404|does not exist/.test(detail))
    return new CaptureFailure("unavailable", detailInput);
  if (/unsupported url|no video formats|unsupported format/.test(detail))
    return new CaptureFailure("unsupported_format", detailInput);
  if (/larger than|max-filesize|duration/.test(detail))
    return new CaptureFailure("archive_limit", detailInput);
  return new CaptureFailure("platform_temporary", detailInput);
}
