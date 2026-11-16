import { afterEach, describe, expect, it, vi } from "vitest";
import { JobStore } from "../src/db.js";
import { AiProviderService } from "../src/ai-providers.js";
import {
  seedAskReviewFixture,
  syntheticReviewAsk,
  askReviewPreviewEnabled,
  prepareAskReviewPreview,
  restoreAskReviewSpinner,
  reviewAnswer,
} from "../src/ask-review-fixture.js";
import { AskService } from "../src/ask.js";
import { testConfig } from "./helpers.js";

describe("disposable Ask review fixture", () => {
  const stores: JobStore[] = [];
  afterEach(() => {
    stores.splice(0).forEach((store) => store.close());
    vi.restoreAllMocks();
  });

  const previewConfig = () => ({
    ...testConfig("/tmp/ask-review-guard"),
    appUrl: "https://preview-social-knowledge-staging-pr-64.staging.stephenjoly.net",
    demoAccounts: [{ username: "synthetic", password: "synthetic-password", role: "member" as const }],
  });

  it("enables runtime seeding only on an HTTPS preview hostname with demo accounts", async () => {
    const config = previewConfig();
    expect(askReviewPreviewEnabled(config)).toBe(true);
    const store = new JobStore(":memory:");
    stores.push(store);
    const providers = new AiProviderService(store, config);
    const disabled = [
      { ...config, demoAccounts: [] },
      ...[
        "https://social-knowledge.stephenjoly.net",
        "https://social-knowledge-staging.stephenjoly.net",
        "http://localhost:3000",
        "http://preview-social-knowledge-staging-pr-64.staging.stephenjoly.net",
        "https://preview-social-knowledge-staging-pr-64.staging.stephenjoly.net.evil.example",
      ].map((appUrl) => ({ ...config, appUrl })),
    ];
    for (const candidate of disabled) {
      expect(askReviewPreviewEnabled(candidate)).toBe(false);
      expect(await prepareAskReviewPreview(store, candidate, providers)).toBeUndefined();
    }
    expect(store.userCount()).toBe(0);
  });

  it("prepares one synthetic member idempotently without changing any existing owner's keys or password", async () => {
    const config = previewConfig();
    const store = new JobStore(":memory:");
    stores.push(store);
    const unrelated = store.createUser("unrelated", "untouched-password-hash");
    store.saveAiProviderConnection(unrelated.id, "openai", "opaque-existing-credential", "existing");
    const providers = new AiProviderService(store, config);
    const prepared = await prepareAskReviewPreview(store, config, providers);
    expect(prepared).toBeDefined();
    const owner = store.getUserByUsername("ask-review")!;
    expect(owner).toMatchObject({ id: prepared!.userId, role: "member", displayName: "Synthetic Ask review" });
    const originalHash = owner.passwordHash;
    const originalConnection = store.aiProviderConnectionSecret(owner.id, "openai");
    const repeated = await prepareAskReviewPreview(store, config, providers);
    expect(repeated!.userId).toBe(prepared!.userId);
    expect(config.demoAccounts.filter((account) => account.username === "ask-review")).toEqual([{
      username: "ask-review", password: "synthetic-review-password", role: "member",
    }]);
    expect(config.demoAccounts.find((account) => account.username === "synthetic")).toEqual({
      username: "synthetic", password: "synthetic-password", role: "member",
    });
    expect(store.userCount()).toBe(2);
    expect(store.listConversations(owner.id)).toHaveLength(12);
    expect(store.getUserByUsername("ask-review")!.passwordHash).toBe(originalHash);
    expect(store.aiProviderConnectionSecret(owner.id, "openai")).toEqual(originalConnection);
    expect(store.getUserByUsername("unrelated")!.passwordHash).toBe("untouched-password-hash");
    expect(store.aiProviderConnectionSecret(unrelated.id, "openai")!.encryptedPayload).toBe("opaque-existing-credential");
    expect(store.listConversations(unrelated.id)).toEqual([]);
    const chat = store.createConversation(unrelated.id)!;
    const attempt = store.beginConversationTurn(unrelated.id, chat.id, "Question", "other-request");
    const real = vi.spyOn(AskService.prototype, "answer").mockRejectedValue(new Error("real service called"));
    await expect(prepared!.service.answer({ userId: unrelated.id, conversationId: chat.id, assistantId: attempt.assistantId, question: "Question", signal: new AbortController().signal, onDelta: () => undefined })).rejects.toThrow("real service called");
    expect(real).toHaveBeenCalledOnce();
  });

  it("refuses to claim an existing unmarked account", async () => {
    const config = previewConfig();
    const store = new JobStore(":memory:");
    stores.push(store);
    const existing = store.createUser("ask-review", "existing-password-hash");
    const providers = new AiProviderService(store, config);
    expect(await prepareAskReviewPreview(store, config, providers)).toBeUndefined();
    expect(store.userCount()).toBe(1);
    expect(store.listConversations(existing.id)).toEqual([]);
    expect(store.aiProviderConnections(existing.id)).toEqual([]);
    expect(store.getUserByUsername("ask-review")!.passwordHash).toBe("existing-password-hash");
  });

  it("upgrades only legacy fixture placeholders once and leaves other owners and retried turns intact", async () => {
    const config = previewConfig();
    const store = new JobStore(":memory:");
    stores.push(store);
    const providers = new AiProviderService(store, config);
    const prepared = (await prepareAskReviewPreview(store, config, providers))!;
    const ownerId = prepared.userId;
    const other = store.createUser("legacy-other", "hash");
    seedAskReviewFixture(store, other.id);
    const rows = (userId: string) => store.database.prepare(`SELECT m.* FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=? ORDER BY m.rowid`).all(userId);
    const legacy = (userId: string) => {
      store.database.prepare(`UPDATE conversation_messages SET content='',sources_json='[]',sufficient=NULL,status='pending',error_code=NULL WHERE request_id='ask-review-seed-9' AND conversation_id IN (SELECT id FROM conversations WHERE user_id=?)`).run(userId);
      store.database.prepare(`UPDATE conversation_messages SET content='',sources_json='[]',sufficient=NULL,status='failed',error_code='provider_error' WHERE request_id='ask-review-seed-1' AND conversation_id IN (SELECT id FROM conversations WHERE user_id=?)`).run(userId);
      store.database.prepare(`UPDATE conversation_messages SET content=?,status='complete',error_code=NULL WHERE request_id='ask-review-seed-3' AND conversation_id IN (SELECT id FROM conversations WHERE user_id=?)`).run(reviewAnswer, userId);
    };
    legacy(ownerId);
    legacy(other.id);
    const otherBefore = rows(other.id);
    await prepareAskReviewPreview(store, config, providers);
    expect(store.listConversations(ownerId).find((chat) => chat.title === "Lower back stretches under 10 minutes")!.lastStatus).toBe("pending");
    expect(store.listConversations(ownerId).find((chat) => chat.title === "Sourdough starter troubleshooting")!.lastStatus).toBe("failed");
    const oldSpinner = store.listConversations(ownerId).find((chat) => chat.title === "Beginner running plans")!;
    expect(store.getConversation(ownerId, oldSpinner.id)!.messages.find((message) => message.requestId === "ask-review-seed-9")).toMatchObject({ status: "complete", content: reviewAnswer });
    const afterUpgrade = rows(ownerId);
    await prepareAskReviewPreview(store, config, providers);
    expect(rows(ownerId)).toEqual(afterUpgrade);
    expect(rows(other.id)).toEqual(otherBefore);
    const original = store.getConversation(ownerId, oldSpinner.id)!.messages.find((message) => message.requestId === "ask-review-seed-9")!;
    const retry = store.beginConversationRetry(ownerId, oldSpinner.id, original.id, "reviewer-retry");
    store.failConversationAttempt(ownerId, oldSpinner.id, retry.assistantId, "failed", "provider_error");
    store.database.prepare("UPDATE conversation_messages SET content='',status='failed',error_code='provider_error' WHERE id=?").run(original.id);
    const retriedBefore = rows(ownerId);
    await prepareAskReviewPreview(store, config, providers);
    expect(rows(ownerId)).toEqual(retriedBefore);
    expect(rows(other.id)).toEqual(otherBefore);
  });

  it("restores only the owner's deliberate spinner and never resurrects a retried answer", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const owner = store.createUser("spinner-owner", "hash");
    const other = store.createUser("spinner-other", "hash");
    seedAskReviewFixture(store, owner.id);
    const otherChat = store.createConversation(other.id)!;
    const otherAttempt = store.beginConversationTurn(other.id, otherChat.id, "Other", "ask-review-seed-1");
    store.database.prepare("UPDATE conversation_messages SET created_at='2000-01-01' WHERE status='pending'").run();
    expect(store.recoverInterruptedConversationAttempts()).toBe(2);
    restoreAskReviewSpinner(store, owner.id);
    expect(store.getConversation(other.id, otherChat.id)!.messages.find((message) => message.id === otherAttempt.assistantId)).toMatchObject({ id: otherAttempt.assistantId, status: "failed" });
    const chat = store.listConversations(owner.id).find((candidate) => candidate.lastStatus === "pending")!;
    const spinner = store.getConversation(owner.id, chat.id)!.messages.find((message) => message.status === "pending")!;
    store.failConversationAttempt(owner.id, chat.id, spinner.id, "failed", "provider_error");
    const retry = store.beginConversationRetry(owner.id, chat.id, spinner.id, "spinner-retry");
    store.completeConversationAttempt(owner.id, chat.id, retry.assistantId, "Retried", [], false);
    restoreAskReviewSpinner(store, owner.id);
    expect(store.getConversation(owner.id, chat.id)!.messages.find((message) => message.id === spinner.id)!.status).toBe("failed");
  });

  it("seeds twelve isolated chats, date groups, statuses, sources and simulated providers", () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const owner = store.createUser("synthetic-review", "hash");
    const other = store.createUser("unrelated-owner", "hash");
    const fixture = seedAskReviewFixture(store, owner.id);
    const chats = store.listConversations(owner.id);
    expect(chats).toHaveLength(12);
    expect(fixture.conversationIds).toHaveLength(12);
    expect(chats.filter((chat) => chat.pinnedAt)).toHaveLength(1);
    expect(chats[0]!.pinnedAt).not.toBeNull();
    expect(chats.filter((chat) => chat.lastStatus === "pending").map((chat) => chat.title)).toEqual(["Lower back stretches under 10 minutes"]);
    expect(chats.filter((chat) => chat.lastStatus === "failed").map((chat) => chat.title)).toEqual(["Sourdough starter troubleshooting"]);
    const today = new Date();
    const day = 24 * 60 * 60 * 1000;
    const ages = chats.map((chat) =>
      Math.round((today.getTime() - Date.parse(String(chat.updatedAt))) / day),
    );
    expect(ages).toContain(0);
    expect(ages).toContain(1);
    expect(ages.some((age) => age > 1 && age < 7)).toBe(true);
    expect(ages.some((age) => age > 30)).toBe(true);
    const state = new AiProviderService(
      store,
      testConfig("/tmp/ask-review-fixture"),
    ).settings(owner.id);
    expect(
      state.providers
        .filter((provider) => provider.connected)
        .map((provider) => provider.id)
        .sort(),
    ).toEqual(["cerebras", "openai"]);
    expect(state.readiness).toEqual({ capture: true, ask: true });
    expect(store.listConversations(other.id)).toEqual([]);
    expect(
      store.listCaptures({ userId: other.id, limit: 100 }).captures,
    ).toEqual([]);
    for (const id of fixture.conversationIds)
      expect(store.getConversation(other.id, id)).toBeNull();
    expect(() => seedAskReviewFixture(store, owner.id)).toThrow(
      "empty conversation list",
    );
    expect(store.listConversations(owner.id)).toHaveLength(12);
  });

  it("synthetic answers use only the caller's saved sources and persist only owned attempts", async () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const owner = store.createUser("synthetic-owner", "hash");
    const other = store.createUser("synthetic-other", "hash");
    const fixture = seedAskReviewFixture(store, owner.id);
    const chat = store.createConversation(owner.id)!;
    const attempt = store.beginConversationTurn(
      owner.id,
      chat.id,
      "Leadership?",
      "synthetic-answer",
    );
    const ask = syntheticReviewAsk(store);
    const input = {
      userId: owner.id,
      conversationId: chat.id,
      assistantId: attempt.assistantId,
      question: "Leadership?",
      signal: new AbortController().signal,
      onDelta: () => undefined,
    };
    const result = await ask.answer(input);
    expect(result.sources.map((source) => source.id)).toEqual(
      fixture.sources.map((source) => source.id),
    );
    expect(
      store.getConversation(owner.id, chat.id)!.messages.at(-1)!.status,
    ).toBe("complete");
    await expect(ask.answer({ ...input, userId: other.id })).rejects.toThrow(
      "Synthetic review capture missing",
    );
    expect(store.listConversations(other.id)).toEqual([]);
  });
});
