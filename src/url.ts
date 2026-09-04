import { createHash } from "node:crypto";

const allowedHosts = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.watch",
  "instagram.com",
  "www.instagram.com",
]);

const trackingParameters = ["fbclid", "igshid", "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term"];

export interface NormalizedSocialUrl {
  original: string;
  normalized: string;
  hash: string;
  platform: "facebook" | "instagram";
}

export function normalizeSocialUrl(input: string): NormalizedSocialUrl {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("A valid URL is required");
  }

  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are accepted");
  }

  const hostname = url.hostname.toLowerCase();
  if (!allowedHosts.has(hostname)) {
    throw new Error("Only Facebook and Instagram URLs are accepted");
  }

  url.hostname = hostname;
  url.hash = "";
  for (const parameter of trackingParameters) url.searchParams.delete(parameter);
  url.searchParams.sort();

  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");

  const normalized = url.toString();
  return {
    original: input,
    normalized,
    hash: createHash("sha256").update(normalized).digest("hex"),
    platform: hostname.includes("instagram") ? "instagram" : "facebook",
  };
}
