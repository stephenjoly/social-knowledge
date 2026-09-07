import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JobStore } from "../src/db.js";
import {
  PlatformConnectionService,
  sanitizeCookieExport,
} from "../src/platform-connections.js";
import { testConfig } from "./helpers.js";

const exportText = [
  "# Netscape HTTP Cookie File",
  ".instagram.com\tTRUE\t/\tTRUE\t1999999999\tsessionid\tprivate-value",
  ".facebook.com\tTRUE\t/\tTRUE\t1999999999\tc_user\tfacebook-value",
].join("\n");

describe("platform connections", () => {
  it("keeps only cookies for the selected platform", () => {
    const result = sanitizeCookieExport("instagram", exportText);
    expect(result).toContain("sessionid");
    expect(result).not.toContain("c_user");
    expect(() => sanitizeCookieExport("facebook", "not cookies")).toThrow(
      "no_platform_cookies",
    );
  });

  it("encrypts cookie contents and decrypts them only for downloader use", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-platforms-"));
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    const user = store.createUser("demo", "unused");
    const service = new PlatformConnectionService(store, config);
    try {
      const publicRecord = service.save(user.id, "instagram", exportText);
      expect(publicRecord).toMatchObject({
        platform: "instagram",
        connected: true,
        status: "connected",
        cookieCount: 1,
      });
      const stored = store.platformConnectionSecret(user.id, "instagram")!;
      expect(stored.encryptedPayload).not.toContain("private-value");
      expect(service.cookiesFor(user.id, "instagram")).toContain(
        "private-value",
      );
      service.markAuthenticationRequired(user.id, "instagram");
      expect(service.list(user.id)[1]?.status).toBe("needs_attention");
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
