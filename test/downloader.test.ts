import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  audioPreservingFormatSelector,
  durationMatchFilter,
  MediaDownloader,
  selectComments,
} from "../src/downloader.js";
import { JobStore } from "../src/db.js";
import { PlatformConnectionService } from "../src/platform-connections.js";
import { testConfig } from "./helpers.js";

const { runCommand } = vi.hoisted(() => ({
  runCommand:
    vi.fn<
      (
        command: string,
        args: string[],
        options?: { timeout?: number; reject?: boolean },
      ) => Promise<{ stdout: string }>
    >(),
}));

vi.mock("execa", () => ({ execa: runCommand }));

const fixtures: Array<{ root: string; store: JobStore }> = [];
const instagramUrl = "https://www.instagram.com/reel/synthetic-reel/";
const jsonFailure = {
  stderr:
    "ERROR: [Instagram] synthetic-reel: Failed to parse JSON (caused by JSONDecodeError(\"Expecting value in '': line 1 column 1 (char 0)\"))",
  stdout: "[Instagram] synthetic-reel: Downloading video info",
};

afterEach(async () => {
  runCommand.mockReset();
  for (const { root, store } of fixtures.splice(0)) {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture(
  cookieSource: "uploaded" | "configured" | "none" = "uploaded",
  platform: "instagram" | "facebook" = "instagram",
) {
  const root = await mkdtemp(path.join(tmpdir(), "social-downloader-"));
  await mkdir(path.join(root, "data"));
  const config = { ...testConfig(root), fetchComments: true };
  const store = new JobStore(config.databasePath);
  fixtures.push({ root, store });
  const owner = store.createUser("synthetic-owner", "unused");
  const connections = new PlatformConnectionService(store, config);
  const cookies = `# Netscape HTTP Cookie File\n.${platform}.com\tTRUE\t/\tTRUE\t1999999999\tsessionid\tsynthetic-cookie\n`;
  if (cookieSource === "uploaded")
    connections.save(owner.id, platform, cookies);
  if (cookieSource === "configured") {
    const cookiePath = path.join(root, "configured-cookies.txt");
    await writeFile(cookiePath, cookies, { mode: 0o600 });
    config.instagramCookiesFile = cookiePath;
  }
  return {
    config,
    connections,
    owner,
    downloader: new MediaDownloader(config, connections),
    sourceUrl:
      platform === "instagram"
        ? instagramUrl
        : "https://www.facebook.com/reel/synthetic-reel/",
  };
}

async function writeDownload(args: string[]) {
  const output = args[args.indexOf("--output") + 1]!;
  await writeFile(
    output.replace("%(ext)s", "info.json"),
    JSON.stringify({
      id: "synthetic-reel",
      extractor_key: "Instagram",
      title: "Synthetic public Reel",
      duration: 15,
    }),
  );
  await writeFile(output.replace("%(ext)s", "mp4"), "synthetic-video");
  return { stdout: "" };
}

describe("Instagram anonymous fallback", () => {
  it.each(["uploaded", "configured"] as const)(
    "recovers a %s-cookie JSON failure without reusing cookies or partial output",
    async (cookieSource) => {
      const { config, connections, owner, downloader } =
        await fixture(cookieSource);
      const markSuccess = vi.spyOn(connections, "markSuccess");
      let temporaryCookiePath = "";
      runCommand
        .mockImplementationOnce(async (_command, args) => {
          temporaryCookiePath = args[args.indexOf("--cookies") + 1]!;
          expect(await readFile(temporaryCookiePath, "utf8")).toContain(
            "synthetic-cookie",
          );
          expect((await stat(temporaryCookiePath)).mode & 0o777).toBe(0o600);
          const output = args[args.indexOf("--output") + 1]!;
          await writeFile(output.replace("%(ext)s", "mp4.part"), "partial");
          await writeFile(output.replace("%(ext)s", "info.json"), "stale-info");
          throw jsonFailure;
        })
        .mockImplementationOnce(async (_command, args) => {
          expect(await readdir(path.join(config.workDir, "job"))).toEqual([]);
          expect(args).not.toContain("--cookies");
          expect(args).not.toContain(temporaryCookiePath);
          expect(args).toContain("--ignore-config");
          expect(args).toContain("--no-cookies");
          expect(args).toContain("--no-cookies-from-browser");
          return writeDownload(args);
        });

      const result = await downloader.download("job", instagramUrl, owner.id);

      expect(result.metadata).toMatchObject({
        id: "synthetic-reel",
        platform: "instagram",
        webpageUrl: instagramUrl,
      });
      expect(await readFile(result.videoPath, "utf8")).toBe("synthetic-video");
      expect(runCommand).toHaveBeenCalledTimes(2);
      for (const [command, args, options] of runCommand.mock.calls) {
        expect(command).toBe("yt-dlp");
        expect(args.slice(-2)).toEqual(["--", instagramUrl]);
        expect(args).toEqual(
          expect.arrayContaining([
            "--format",
            audioPreservingFormatSelector,
            "--match-filter",
            durationMatchFilter(config.maxDurationSeconds),
            "--max-filesize",
            String(config.maxDownloadBytes),
            "--write-comments",
          ]),
        );
        expect(options).toMatchObject({ timeout: 15 * 60_000, reject: true });
      }
      expect(markSuccess).not.toHaveBeenCalled();
      if (cookieSource === "configured")
        expect(await readFile(config.instagramCookiesFile!, "utf8")).toContain(
          "synthetic-cookie",
        );
      else {
        expect(connections.cookiesFor(owner.id, "instagram")).toContain(
          "synthetic-cookie",
        );
        expect(connections.list(owner.id)[1]).toMatchObject({
          status: "connected",
          lastUsedAt: null,
        });
      }
      await expect(readFile(temporaryCookiePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  it.each([
    ["Private post", "private_post"],
    ["Login required", "authentication_required"],
    ["Post not available (404)", "unavailable"],
    ["No video formats", "unsupported_format"],
    ["Video duration exceeds maximum", "archive_limit"],
    ["Failed to parse JSON", "platform_temporary"],
  ])(
    "returns the anonymous failure (%s) after exactly one fallback",
    async (stderr, code) => {
      const { connections, owner, downloader } = await fixture();
      let temporaryCookiePath = "";
      runCommand
        .mockImplementationOnce(async (_command, args) => {
          temporaryCookiePath = args[args.indexOf("--cookies") + 1]!;
          throw jsonFailure;
        })
        .mockRejectedValueOnce({ stderr });

      await expect(
        downloader.download("job", instagramUrl, owner.id),
      ).rejects.toMatchObject({ code });

      expect(runCommand).toHaveBeenCalledTimes(2);
      expect(connections.list(owner.id)[1]).toMatchObject({
        status: "connected",
        lastUsedAt: null,
      });
      await expect(readFile(temporaryCookiePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  it.each([
    ["Private post", "private_post"],
    ["Login required", "authentication_required"],
    ["Post not available (404)", "unavailable"],
    ["No video formats", "unsupported_format"],
    ["Video duration exceeds maximum", "archive_limit"],
    ["HTTP 429 Too Many Requests", "platform_temporary"],
  ])(
    "keeps unrelated authenticated errors unchanged (%s)",
    async (stderr, code) => {
      const { connections, owner, downloader } = await fixture();
      runCommand.mockRejectedValue({ stderr });

      await expect(
        downloader.download("job", instagramUrl, owner.id),
      ).rejects.toMatchObject({ code });

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(connections.list(owner.id)[1]?.status).toBe(
        code === "authentication_required" ? "needs_attention" : "connected",
      );
    },
  );

  it("marks a successful authenticated download as used without retrying", async () => {
    const { connections, owner, downloader } = await fixture();
    runCommand.mockImplementation(async (_command, args) =>
      writeDownload(args),
    );

    await downloader.download("job", instagramUrl, owner.id);

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(connections.list(owner.id)[1]?.lastUsedAt).not.toBeNull();
  });

  it("does not retry an already anonymous Instagram request", async () => {
    const { owner, downloader } = await fixture("none");
    runCommand.mockRejectedValue(jsonFailure);

    await expect(
      downloader.download("job", instagramUrl, owner.id),
    ).rejects.toMatchObject({ code: "platform_temporary" });

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand.mock.calls[0]?.[1]).not.toContain("--cookies");
  });

  it("does not add an anonymous retry to Facebook", async () => {
    const { owner, downloader, sourceUrl } = await fixture(
      "uploaded",
      "facebook",
    );
    runCommand.mockRejectedValue({
      stderr: "ERROR: [Facebook] Failed to parse JSON",
    });

    await expect(
      downloader.download("job", sourceUrl, owner.id),
    ).rejects.toMatchObject({ code: "platform_temporary" });

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand.mock.calls[0]?.[1]).toContain("--cookies");
  });
});

describe("download limits", () => {
  it("allows unknown extractor duration for post-download ffprobe enforcement", () => {
    expect(durationMatchFilter(1800)).toBe("duration <=? 1800");
  });

  it("prefers separate upstream audio before falling back to a muxed format", () => {
    expect(audioPreservingFormatSelector).toBe(
      "bestvideo*+bestaudio/best/bestvideo",
    );
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
