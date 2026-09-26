import { hash } from "@node-rs/argon2";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { JobStore } from "../src/db.js";
import { EventHub } from "../src/events.js";
import { testConfig } from "./helpers.js";

describe("library routes", () => {
  it("returns an owner-scoped tree, category, and capture note", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "social-knowledge-library-routes-"),
    );
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    const app = buildApp(config, store, new EventHub());
    try {
      const setup = await app.inject({
        method: "POST",
        url: "/api/auth/setup",
        payload: {
          username: "library-owner",
          password: "a-strong-library-password",
          administratorAcknowledged: true,
        },
      });
      const cookie = (setup.headers["set-cookie"] as string)
        .split(";", 1)[0]!;
      const owner = store.getUserByUsername("library-owner")!;
      const job = store.createOrGet({
        ownerUserId: owner.id,
        sourceUrl: "https://www.instagram.com/reel/library-route/",
        normalizedUrl: "https://www.instagram.com/reel/library-route/",
        sourceHash: "library-route-fixture",
        userNote: "",
      }).job;
      const notePath = "Social Knowledge/Captures/library-route-fixture.md";
      await mkdir(path.dirname(path.join(config.vaultDir, notePath)), {
        recursive: true,
      });
      await writeFile(
        path.join(config.vaultDir, notePath),
        "# Library route fixture\n\nA generated capture note.",
      );
      const capture = store.createCapture({
        job,
        sourceType: "video",
        sourceId: "library-route-fixture",
        platform: "instagram",
        title: "Knife [skills]",
        creator: "Chef [One]",
        creatorUrl: null,
        description: null,
        transcript: "Synthetic transcript.",
        sourceLanguage: "en",
        translatedTranscript: null,
        translationLanguage: null,
        comments: [],
        analysis: {
          title: "Knife [skills]",
          synopsis: "Safe [knife] techniques.",
          whyUseful: null,
          takeaways: ["Keep [fingertips] clear."],
          topics: [],
          entities: [],
          recommendations: [],
          claimsNeedingVerification: [],
          evidence: [],
          classification: {
            primaryDomain: "Food & Drink",
            country: null,
            city: null,
            subcategory: "Techniques",
            secondaryTopics: [],
            confidence: 0.9,
          },
        },
        publishedAt: null,
        durationSeconds: null,
        notePath,
        assets: [],
      })!;
      store.assignClassification(capture.id, capture.analysis.classification);
      const techniquesId = store.libraryAssignment(capture.id)!.nodeId;
      store.renameLibraryNode(techniquesId, "Techniques [raw]");

      const parentJob = store.createOrGet({
        ownerUserId: owner.id,
        sourceUrl: "https://www.instagram.com/reel/library-parent-route/",
        normalizedUrl:
          "https://www.instagram.com/reel/library-parent-route/",
        sourceHash: "library-parent-route-fixture",
        userNote: "",
      }).job;
      const parentCapture = store.createCapture({
        job: parentJob,
        sourceType: "video",
        sourceId: "library-parent-route-fixture",
        platform: "instagram",
        title: "Food overview",
        creator: "Kitchen account",
        creatorUrl: null,
        description: null,
        transcript: "Synthetic parent transcript.",
        sourceLanguage: "en",
        translatedTranscript: null,
        translationLanguage: null,
        comments: [],
        analysis: {
          title: "Food overview",
          synopsis: "A parent-level food guide.",
          whyUseful: null,
          takeaways: ["Taste before salting."],
          topics: [],
          entities: [],
          recommendations: [],
          claimsNeedingVerification: [],
          evidence: [],
          classification: {
            primaryDomain: "Food & Drink",
            country: null,
            city: null,
            subcategory: "Food Products",
            secondaryTopics: [],
            confidence: 0.9,
          },
        },
        publishedAt: null,
        durationSeconds: null,
        notePath: "Social Knowledge/Captures/library-parent-route-fixture.md",
        assets: [],
      })!;
      store.assignClassification(
        parentCapture.id,
        parentCapture.analysis.classification,
      );
      const foodNode = store
        .libraryTree(owner.id)
        .find((node) => node.label === "Food & Drink")!;
      store.moveCapture(parentCapture.id, foodNode.id);

      const tree = await app.inject({
        method: "GET",
        url: "/api/v1/library/tree",
        headers: { cookie },
      });
      expect(tree.statusCode).toBe(200);
      const food = tree
        .json()
        .nodes.find((node: { label: string }) => node.label === "Food & Drink");
      expect(food).toMatchObject({ captureCount: 2, childCount: 1 });
      expect(tree.json().nodes.map((node: { label: string }) => node.label)).toEqual(
        expect.not.arrayContaining(["Travel"]),
      );

      const category = await app.inject({
        method: "GET",
        url: `/api/v1/library/nodes/${food.id}`,
        headers: { cookie },
      });
      expect(category.statusCode).toBe(200);
      expect(category.json().markdown).toContain("[Techniques \\[raw\\]](library:");
      expect(category.json().node.captures).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: capture.id,
            synopsis: "Safe [knife] techniques.",
            takeaways: ["Keep [fingertips] clear."],
            sourceUrl: "https://www.instagram.com/reel/library-route/",
          }),
          expect.objectContaining({ id: parentCapture.id }),
        ]),
      );
      expect(JSON.stringify(category.json().node.captures)).not.toContain(
        "notePath",
      );
      const techniques = category
        .json()
        .node.children.find(
          (node: { label: string }) => node.label === "Techniques [raw]",
        );
      const topic = await app.inject({
        method: "GET",
        url: `/api/v1/library/nodes/${techniques.id}`,
        headers: { cookie },
      });
      expect(topic.json().markdown).toContain(
        `[Knife \\[skills\\]](capture:${capture.id})`,
      );
      expect(topic.json().markdown).toContain("## Browse by insight");
      expect(topic.json().markdown).toContain(
        `[Keep \\[fingertips\\] clear\\.](capture:${capture.id})`,
      );

      const note = await app.inject({
        method: "GET",
        url: `/api/v1/captures/${capture.id}/markdown`,
        headers: { cookie },
      });
      expect(note.statusCode).toBe(200);
      expect(note.json().markdown).toContain("# Library route fixture");

      store.createUser("library-other", await hash("a-strong-other-password"));
      const otherLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          username: "library-other",
          password: "a-strong-other-password",
        },
      });
      const otherCookie = (otherLogin.headers["set-cookie"] as string)
        .split(";", 1)[0]!;
      const hidden = await app.inject({
        method: "GET",
        url: `/api/v1/captures/${capture.id}/markdown`,
        headers: { cookie: otherCookie },
      });
      expect(hidden.statusCode).toBe(404);
      const hiddenNode = await app.inject({
        method: "GET",
        url: `/api/v1/library/nodes/${food.id}`,
        headers: { cookie: otherCookie },
      });
      expect(hiddenNode.statusCode).toBe(404);
    } finally {
      await app.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
