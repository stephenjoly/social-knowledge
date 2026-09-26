import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthService } from "../src/auth.js";
import { JobStore } from "../src/db.js";

describe("JobStore", () => {
  it("creates at most one initial administrator", () => {
    const store = new JobStore(":memory:");
    expect(store.createInitialUser("first-admin", "hash")).toMatchObject({
      username: "first-admin",
      role: "admin",
    });
    expect(store.createInitialUser("second-admin", "hash")).toBeNull();
    expect(store.userCount()).toBe(1);
    store.close();
  });

  it("keeps invitation bearer tokens hashed and creates the assigned isolated role once", () => {
    const store = new JobStore(":memory:");
    const administrator = store.createInitialUser("first-admin", "hash")!;
    const rawToken = "private-invitation-bearer-token";
    const invitation = store.createInvitation({
      createdByUserId: administrator.id,
      role: "member",
      tokenHash: AuthService.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const persisted = store.database
      .prepare("SELECT token_hash AS tokenHash FROM invitations WHERE id=?")
      .get(invitation.id) as { tokenHash: string };
    expect(persisted.tokenHash).toBe(AuthService.hashToken(rawToken));
    expect(persisted.tokenHash).not.toContain(rawToken);

    expect(
      store.redeemInvitation({
        tokenHash: AuthService.hashToken(rawToken),
        username: "invited-member",
        passwordHash: "member-password-hash",
      }),
    ).toMatchObject({
      ok: true,
      user: { username: "invited-member", role: "member" },
    });
    expect(
      store.redeemInvitation({
        tokenHash: AuthService.hashToken(rawToken),
        username: "second-use",
        passwordHash: "second-password-hash",
      }),
    ).toEqual({ ok: false, reason: "invalid_invitation" });
    expect(store.listUsers()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: "first-admin", role: "admin" }),
        expect.objectContaining({ username: "invited-member", role: "member" }),
      ]),
    );
    expect(store.listInvitations()[0]).toMatchObject({
      id: invitation.id,
      consumedAt: expect.any(String),
    });
    store.close();
  });

  it("rejects expired and revoked invitations and regenerates an unused invitation", () => {
    const store = new JobStore(":memory:");
    const administrator = store.createInitialUser("first-admin", "hash")!;
    const expiredToken = "expired-invitation-token";
    store.createInvitation({
      createdByUserId: administrator.id,
      role: "admin",
      tokenHash: AuthService.hashToken(expiredToken),
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    expect(store.inspectInvitation(AuthService.hashToken(expiredToken))).toBeNull();
    expect(
      store.redeemInvitation({
        tokenHash: AuthService.hashToken(expiredToken),
        username: "expired-admin",
        passwordHash: "hash",
      }),
    ).toEqual({ ok: false, reason: "invalid_invitation" });

    const revokedToken = "revoked-invitation-token";
    const revoked = store.createInvitation({
      createdByUserId: administrator.id,
      role: "member",
      tokenHash: AuthService.hashToken(revokedToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(store.revokeInvitation(revoked.id)).toBe(true);
    expect(store.inspectInvitation(AuthService.hashToken(revokedToken))).toBeNull();

    const original = store.createInvitation({
      createdByUserId: administrator.id,
      role: "admin",
      tokenHash: AuthService.hashToken("replace-me"),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const replacement = store.regenerateInvitation({
      id: original.id,
      createdByUserId: administrator.id,
      tokenHash: AuthService.hashToken("replacement-token"),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(replacement).toMatchObject({ role: "admin", revokedAt: null });
    expect(store.inspectInvitation(AuthService.hashToken("replace-me"))).toBeNull();
    expect(
      store.inspectInvitation(AuthService.hashToken("replacement-token")),
    ).toMatchObject({ id: replacement?.id, role: "admin" });
    store.close();
  });

  const stores: JobStore[] = [];
  afterEach(() => stores.splice(0).forEach((store) => store.close()));

  it("deduplicates jobs by normalized source hash", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const ownerUserId = store.createUser("owner-one", "hash").id;
    const input = {
      ownerUserId,
      sourceUrl: "https://www.instagram.com/reel/example",
      normalizedUrl: "https://www.instagram.com/reel/example",
      sourceHash: "abc123",
    };

    const first = store.createOrGet(input);
    const second = store.createOrGet(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);

    store.setDisplayTitle(first.job.id, "AI-generated title");
    expect(store.get(first.job.id)?.displayTitle).toBe("AI-generated title");
  });

  it("recovers interrupted jobs", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const ownerUserId = store.createUser("owner-two", "hash").id;
    const { job } = store.createOrGet({
      ownerUserId,
      sourceUrl: "https://fb.watch/example",
      normalizedUrl: "https://fb.watch/example",
      sourceHash: "def456",
    });
    expect(store.claimNext()?.id).toBe(job.id);
    expect(store.get(job.id)?.status).toBe("downloading");

    store.recoverInterruptedJobs();
    expect(store.get(job.id)?.status).toBe("queued");
  });

  it("deletes an account and its owned processing records", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const user = store.createUser("temporary-owner", "hash");
    const { job } = store.createOrGet({
      ownerUserId: user.id,
      sourceUrl: "https://www.instagram.com/reel/temporary",
      normalizedUrl: "https://www.instagram.com/reel/temporary",
      sourceHash: "temporary123",
    });

    expect(store.deleteUser(user.username)).toBe(true);
    expect(store.getUserByUsername(user.username)).toBeUndefined();
    expect(store.get(job.id)).toBeNull();
  });

  it("stores selected comments with a capture", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const ownerUserId = store.createUser("owner-three", "hash").id;
    const { job } = store.createOrGet({
      ownerUserId,
      sourceUrl: "https://www.instagram.com/reel/comments",
      normalizedUrl: "https://www.instagram.com/reel/comments",
      sourceHash: "comments123",
    });
    const capture = store.createCapture({
      job,
      sourceType: "video",
      sourceId: "comments",
      platform: "instagram",
      title: "A commented capture",
      creator: "creator",
      creatorUrl: null,
      description: null,
      transcript: "Transcript",
      sourceLanguage: "en",
      translatedTranscript: null,
      translationLanguage: null,
      comments: [
        {
          author: "viewer",
          text: "Save this place",
          likeCount: 12,
          isPinned: false,
        },
      ],
      analysis: {
        title: "A commented capture",
        synopsis: "Synopsis",
        whyUseful: null,
        takeaways: ["Seller A sells lamps."],
        topics: ["travel"],
        entities: [],
        recommendations: [],
        claimsNeedingVerification: [],
        evidence: [],
        classification: {
          primaryDomain: "Travel",
          country: "Portugal",
          city: "Lisbon",
          subcategory: "Restaurants",
          secondaryTopics: [],
          confidence: 0.9,
        },
      },
      publishedAt: null,
      durationSeconds: 30,
      notePath: "Social Knowledge/commented.md",
      assets: [],
    });

    expect(capture?.comments).toEqual([
      {
        author: "viewer",
        text: "Save this place",
        likeCount: 12,
        isPinned: false,
      },
    ]);
    expect(store.listCaptures({ limit: 10 }).captures[0]?.comments).toEqual([]);

    store.replaceCaptureAnalysis(
      capture!.id,
      {
        title: "Updated seller guide",
        synopsis: "A clearer synopsis.",
        whyUseful: "Use this as a sourcing shortlist.",
        takeaways: ["Seller A sells lamps."],
        topics: ["shopping"],
        entities: [],
        recommendations: [],
        claimsNeedingVerification: [],
        evidence: [],
        classification: {
          primaryDomain: "Travel",
          country: "Portugal",
          city: "Lisbon",
          subcategory: "Restaurants",
          secondaryTopics: [],
          confidence: 0.9,
        },
      },
      "Social Knowledge/updated.md",
    );
    expect(store.getCapture(capture!.id)?.analysis.takeaways).toEqual([
      "Seller A sells lamps.",
    ]);
    expect(store.get(job.id)?.displayTitle).toBe("Updated seller guide");

    store.assignClassification(capture!.id, capture!.analysis.classification);
    const leaf = store.libraryAssignment(capture!.id)!;
    expect(
      store.libraryBreadcrumb(leaf.nodeId).map((node) => node.label),
    ).toEqual(["Travel", "Portugal", "Lisbon", "Restaurants"]);
    const manualTarget = store
      .libraryTree()
      .find((node) => node.label === "Learning")!;
    store.moveCapture(capture!.id, manualTarget.id);
    store.assignClassification(capture!.id, capture!.analysis.classification);
    expect(store.libraryAssignment(capture!.id)?.nodeId).toBe(manualTarget.id);
    const designNode = store
      .libraryTree()
      .find((node) => node.label === "Home & Design")!;
    store.moveCapture(capture!.id, designNode.id);
    // Taxonomy labels are tokenized, not substring-matched: "des" must not
    // accidentally match the "design" part of Home & Design.
    expect(store.searchKnowledge(ownerUserId, "des", 10)).toEqual([]);
    expect(
      store.searchKnowledge(ownerUserId, "me brief bulleted list", 10),
    ).toEqual([]);
  });

  it("creates turns idempotently, enforces one active attempt, and retries without duplicating the user", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const user = store.createUser("chat-user", "hash");
    const conversation = store.createConversation(user.id)!;
    const requestId = crypto.randomUUID();
    const first = store.beginConversationTurn(
      user.id,
      conversation.id,
      "Where should I eat?",
      requestId,
    );
    expect(
      store.beginConversationTurn(
        user.id,
        conversation.id,
        "ignored duplicate",
        requestId,
      ),
    ).toMatchObject({ assistantId: first.assistantId, existing: true });
    expect(() =>
      store.beginConversationTurn(
        user.id,
        conversation.id,
        "Another question",
        crypto.randomUUID(),
      ),
    ).toThrow("conversation_busy");
    store.failConversationAttempt(
      user.id,
      conversation.id,
      first.assistantId,
      "failed",
      "provider_error",
    );
    const retry = store.beginConversationRetry(
      user.id,
      conversation.id,
      first.assistantId,
      crypto.randomUUID(),
    );
    const messages = store.getConversation(user.id, conversation.id)!.messages;
    expect(messages.filter((message) => message.role === "user")).toHaveLength(
      1,
    );
    expect(retry.userMessageId).toBe(first.userMessageId);
    expect(() =>
      store.beginConversationRetry(
        user.id,
        conversation.id,
        first.assistantId,
        crypto.randomUUID(),
      ),
    ).toThrow("conversation_busy");
  });

  it("scopes source deduplication and archive reads to each owner", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const first = store.createUser("first-owner", "hash"),
      second = store.createUser("second-owner", "hash");
    const source = {
      sourceUrl: "https://instagram.com/reel/shared",
      normalizedUrl: "https://instagram.com/reel/shared",
      sourceHash: "shared",
    };
    const one = store.createOrGet({ ownerUserId: first.id, ...source }),
      two = store.createOrGet({ ownerUserId: second.id, ...source });
    expect(one.job.id).not.toBe(two.job.id);
    expect(store.list(first.id).map((job) => job.id)).toEqual([one.job.id]);
    expect(store.getOwned(first.id, two.job.id)).toBeNull();
  });

  it("stores provider credentials and task selections independently per owner", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const first = store.createUser("ai-owner", "hash");
    const second = store.createUser("other-ai-owner", "hash");

    store.saveAiProviderConnection(first.id, "openai", "openai-secret", "oa…key");
    store.saveAiProviderConnection(first.id, "cerebras", "cerebras-secret", "cb…key");
    expect(store.aiProviderConnections(first.id).map(({ provider }) => provider)).toEqual([
      "cerebras",
      "openai",
    ]);
    expect(store.aiProviderConnections(second.id)).toEqual([]);

    const selections = store.saveAiTaskSelections(first.id, {
      transcriptionProvider: "openai",
      transcriptionModel: "transcribe-model",
      analysisProvider: "cerebras",
      analysisModel: "analysis-model",
    });
    expect(selections).toMatchObject({
      transcriptionProvider: "openai",
      transcriptionModel: "transcribe-model",
      analysisProvider: "cerebras",
      analysisModel: "analysis-model",
    });
    expect(store.aiTaskSelections(second.id)).toEqual({
      transcriptionProvider: null,
      transcriptionModel: null,
      analysisProvider: null,
      analysisModel: null,
      updatedAt: null,
    });

    expect(store.deleteAiProviderConnection(first.id, "openai")).toBe(true);
    expect(store.aiProviderConnection(first.id, "openai")).toBeUndefined();
    expect(store.aiProviderConnection(first.id, "cerebras")).toBeDefined();
  });

  it("snapshots task selections on jobs and rebinds them on retry", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const owner = store.createUser("snapshot-owner", "hash");
    const created = store.createOrGet({
      ownerUserId: owner.id,
      sourceUrl: "https://instagram.com/reel/snapshot",
      normalizedUrl: "https://instagram.com/reel/snapshot",
      sourceHash: "snapshot",
      transcriptionProvider: "openai",
      transcriptionModel: "transcribe-v1",
      analysisProvider: "cerebras",
      analysisModel: "analyze-v1",
    }).job;
    expect(created).toMatchObject({
      transcriptionProvider: "openai",
      transcriptionModel: "transcribe-v1",
      analysisProvider: "cerebras",
      analysisModel: "analyze-v1",
      aiProvider: "cerebras",
    });

    store.database.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(created.id);
    expect(
      store.retry(created.id, {
        transcriptionProvider: "openai",
        transcriptionModel: "transcribe-v2",
        analysisProvider: "openai",
        analysisModel: "analyze-v2",
      }),
    ).toBe(true);
    expect(store.get(created.id)).toMatchObject({
      transcriptionModel: "transcribe-v2",
      analysisProvider: "openai",
      analysisModel: "analyze-v2",
      aiProvider: "openai",
    });
  });

  it("migrates legacy provider rows and job routing without losing secrets", () => {
    const directory = mkdtempSync(join(tmpdir(), "social-knowledge-db-"));
    const filename = join(directory, "legacy.sqlite3");
    try {
      const legacy = new Database(filename);
      legacy.exec(`
        CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE jobs(id TEXT PRIMARY KEY,owner_user_id TEXT NOT NULL REFERENCES users(id),source_url TEXT NOT NULL,normalized_url TEXT NOT NULL,source_hash TEXT NOT NULL,user_note TEXT,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,error TEXT,result_note_path TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,next_attempt_at TEXT NOT NULL,error_code TEXT,error_detail TEXT,display_title TEXT,ai_provider TEXT CHECK(ai_provider IN ('openai','cerebras')),UNIQUE(owner_user_id,source_hash));
        CREATE TABLE job_events(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,status TEXT NOT NULL,message TEXT,created_at TEXT NOT NULL);
        CREATE TABLE ai_provider_connections(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,provider TEXT NOT NULL CHECK(provider IN ('openai','cerebras')),encrypted_payload TEXT NOT NULL,status TEXT NOT NULL,key_hint TEXT NOT NULL,verified_at TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        INSERT INTO users VALUES('user-1','legacy','hash','admin','2026-01-01T00:00:00.000Z');
        INSERT INTO ai_provider_connections VALUES('user-1','openai','encrypted-secret','verified','sk…1234','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
        INSERT INTO jobs VALUES('job-1','user-1','https://example.com','https://example.com','hash',NULL,'complete',1,NULL,NULL,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',NULL,NULL,NULL,'openai');
        INSERT INTO job_events VALUES('event-1','job-1','queued','Legacy event','2026-01-01T00:00:00.000Z');
      `);
      legacy.close();

      const migrated = new JobStore(filename);
      expect(migrated.aiProviderConnectionSecret("user-1", "openai")).toEqual({
        provider: "openai",
        status: "verified",
        encryptedPayload: "encrypted-secret",
      });
      expect(migrated.aiTaskSelections("user-1")).toMatchObject({
        transcriptionProvider: "openai",
        transcriptionModel: null,
        analysisProvider: "openai",
        analysisModel: null,
      });
      expect(migrated.get("job-1")).toMatchObject({
        transcriptionProvider: "openai",
        analysisProvider: "openai",
        aiProvider: "openai",
      });
      expect(migrated.events("job-1")).toMatchObject([
        { id: "event-1", message: "Legacy event", failureCode: null },
      ]);
      migrated.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
