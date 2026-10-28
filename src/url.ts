import { createHash } from "node:crypto";

const allowedHosts = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.watch",
  "instagram.com",
  "www.instagram.com",
]);

const trackingParameters = [
  "fbclid",
  "igshid",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
];

export interface NormalizedSocialUrl {
  original: string;
  normalized: string;
  hash: string;
  platform: "facebook" | "instagram";
}

export function normalizeSocialUrl(input: string): NormalizedSocialUrl {
  return normalizeUrl(input, false) as NormalizedSocialUrl;
}

/** Unsupported links may be retained, but must never enter the capture pipeline. */
export function normalizeSubmissionUrl(input: string) {
  return normalizeUrl(input, true);
}

function normalizeUrl(input: string, allowBookmarks: boolean) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("A valid URL is required");
  }

  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are accepted");
  }
  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials are not accepted");
  }

  const hostname = url.hostname.toLowerCase();
  if (!allowedHosts.has(hostname) && !allowBookmarks) {
    throw new Error("Only Facebook and Instagram URLs are accepted");
  }
  if (url.port && url.port !== "443")
    throw new Error("Only standard HTTPS ports are accepted");

  url.hostname = hostname;
  url.hash = "";
  for (const parameter of trackingParameters)
    url.searchParams.delete(parameter);
  url.searchParams.sort();

  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");

  const normalized = url.toString();
  return {
    original: input,
    normalized,
    hash: createHash("sha256").update(normalized).digest("hex"),
    platform: allowedHosts.has(hostname)
      ? hostname.includes("instagram")
        ? "instagram"
        : "facebook"
      : "unsupported",
  };
}
