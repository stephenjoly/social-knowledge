import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { AppConfig } from "./config.js";
import type { JobStore } from "./db.js";

export const socialPlatforms = ["facebook", "instagram"] as const;
export type SocialPlatform = (typeof socialPlatforms)[number];

const MAX_COOKIE_BYTES = 1024 * 1024;

function domainAllowed(platform: SocialPlatform, domain: string) {
  const clean = domain
    .toLowerCase()
    .replace(/^#httponly_/, "")
    .replace(/^\./, "");
  const root = platform === "instagram" ? "instagram.com" : "facebook.com";
  return clean === root || clean.endsWith(`.${root}`);
}

export function sanitizeCookieExport(platform: SocialPlatform, input: string) {
  if (!input.trim() || Buffer.byteLength(input) > MAX_COOKIE_BYTES)
    throw new Error("invalid_cookie_file");
  const kept: string[] = ["# Netscape HTTP Cookie File"];
  let count = 0;
  for (const raw of input.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line || (line.startsWith("#") && !line.startsWith("#HttpOnly_")))
      continue;
    const fields = line.split("\t");
    if (fields.length !== 7 || !domainAllowed(platform, fields[0] ?? ""))
      continue;
    kept.push(fields.join("\t"));
    count += 1;
  }
  if (!count) throw new Error("no_platform_cookies");
  return `${kept.join("\n")}\n`;
}

export class PlatformConnectionService {
  private readonly key: Buffer;

  constructor(
    private readonly store: JobStore,
    config: AppConfig,
  ) {
    this.key = createHash("sha256")
      .update("social-knowledge-platform-credentials\0")
      .update(config.platformCredentialsKey)
      .digest();
  }

  list(userId: string) {
    return socialPlatforms.map((platform) => {
      const item = this.store.platformConnection(userId, platform);
      return {
        platform,
        connected: Boolean(item),
        status: item?.status ?? "not_connected",
        cookieCount: item?.cookieCount ?? 0,
        lastValidatedAt: item?.lastValidatedAt ?? null,
        lastUsedAt: item?.lastUsedAt ?? null,
        updatedAt: item?.updatedAt ?? null,
      };
    });
  }

  save(userId: string, platform: SocialPlatform, input: string) {
    const cookies = sanitizeCookieExport(platform, input);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(cookies, "utf8"),
      cipher.final(),
    ]);
    const payload = JSON.stringify({
      v: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: encrypted.toString("base64"),
    });
    const cookieCount = cookies
      .split("\n")
      .filter((line) => line && !line.startsWith("#")).length;
    this.store.savePlatformConnection(userId, platform, payload, cookieCount);
    return this.list(userId).find((item) => item.platform === platform)!;
  }

  remove(userId: string, platform: SocialPlatform) {
    return this.store.deletePlatformConnection(userId, platform);
  }

  cookiesFor(userId: string, platform: SocialPlatform) {
    const item = this.store.platformConnectionSecret(userId, platform);
    if (!item) return null;
    try {
      const payload = JSON.parse(item.encryptedPayload) as {
        v: number;
        iv: string;
        tag: string;
        data: string;
      };
      if (payload.v !== 1) throw new Error("unsupported credential version");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(payload.iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(payload.data, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      this.store.markPlatformConnectionAttention(
        userId,
        platform,
        "decrypt_failed",
      );
      return null;
    }
  }

  markSuccess(userId: string, platform: SocialPlatform) {
    this.store.markPlatformConnectionSuccess(userId, platform);
  }

  markAuthenticationRequired(userId: string, platform: SocialPlatform) {
    this.store.markPlatformConnectionAttention(
      userId,
      platform,
      "authentication_required",
    );
  }
}
