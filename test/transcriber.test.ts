import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { Transcriber } from "../src/transcriber.js";

describe("Transcriber", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  async function audioFixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), "transcriber-test-"));
    roots.push(root);
    const audioPath = path.join(root, "audio.mp3");
    await writeFile(audioPath, "synthetic audio fixture");
    return audioPath;
  }

  const client = (text: string, create = vi.fn()) =>
    ({
      audio: {
        transcriptions: {
          create: create.mockResolvedValue({ text }),
        },
      },
    }) as unknown as OpenAI;

  it("uses the user's verified OpenAI client and snapshotted model", async () => {
    const userCreate = vi.fn();
    const userClient = vi.fn(() => client(" user transcript ", userCreate));
    const transcriber = new Transcriber(userClient);

    await expect(
      transcriber.transcribe(await audioFixture(), "user-1", "whisper-test"),
    ).resolves.toBe("user transcript");
    expect(userClient).toHaveBeenCalledWith("user-1");
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "whisper-test",
        response_format: "json",
      }),
    );
  });
});
