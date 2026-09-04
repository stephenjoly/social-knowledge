import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JobStore } from "../src/db.js";
import {
  KnowledgeExporter,
  decodeCursor,
  encodeCursor,
  isAfterCursor,
} from "../src/knowledge.js";
import { testConfig } from "./helpers.js";

describe("knowledge API primitives", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  it("round-trips a stable created-at and id cursor", () => {
    const cursor = {
      createdAt: "2026-09-04T12:00:00.000Z",
      id: "capture-b",
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(
      isAfterCursor(
        { createdAt: "2026-09-04T11:59:00.000Z", id: "capture-z" },
        cursor,
      ),
    ).toBe(true);
    expect(() => decodeCursor("not-a-cursor")).toThrow("invalid_cursor");
  });

  it("marks interrupted exports failed during startup recovery", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "knowledge-export-"));
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    const user = store.createUser("export-owner", "hash");
    const pending = store.createKnowledgeExport(user.id, true, false);
    const exporter = new KnowledgeExporter(store, config);
    cleanups.push(async () => {
      store.close();
      await rm(root, { recursive: true, force: true });
    });

    await exporter.recoverInterrupted();

    expect(store.getKnowledgeExport(user.id, pending.id)?.status).toBe(
      "failed",
    );
    expect(store.getKnowledgeExport(user.id, pending.id)?.errorCode).toBe(
      "export_interrupted",
    );
  });
});
