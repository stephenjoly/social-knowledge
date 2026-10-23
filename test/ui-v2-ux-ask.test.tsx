import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArchiveMissNotice, EmptyAnswerSources } from "../web/pages/ask.js";
import { describe, expect, it } from "vitest";
import {
  askFailure,
  questionFor,
  sourcePanelFor,
  answerWithCaptureLinks,
} from "../web/pages/ask-format.js";
import type { ChatMessage, AskSource } from "../web/shared/types.js";

const source = (id: string): AskSource => ({
  id,
  citation: 1,
  title: id,
  creator: null,
  platform: "instagram",
  synopsis: "",
  sourceUrl: `https://www.instagram.com/reel/${id}/`,
  breadcrumb: [],
});
const message = (
  id: string,
  role: ChatMessage["role"],
  sources: AskSource[] = [],
  userMessageId: string | null = null,
): ChatMessage => ({
  id,
  role,
  sources,
  userMessageId,
  content: id,
  sufficient: true,
  provider: null,
  model: null,
  thinkingLevel: null,
  status: "complete",
  errorCode: null,
  retryOf: null,
  createdAt: "2026-10-19T00:00:00.000Z",
});
const q1 = message("Lisbon question", "user");
const a1 = message("Lisbon answer", "assistant", [source("bakery")], q1.id);
const q2 = message("Strength question", "user");
const a2 = message("Strength answer", "assistant", [source("deadlift")], q2.id);
const q3 = message("Unanswerable question", "user");
const a3 = message("Uncited answer", "assistant", [], q3.id);
const thread = [q1, a1, q2, a2, q3, a3];

describe("UX 12–13: evidence belongs to a particular answer", () => {
  it("keeps an uncited latest answer empty and explicitly offers the nearest earlier evidence", () => {
    expect(sourcePanelFor(thread, null)).toEqual({
      answer: a3,
      isLatest: true,
      earlierCited: a2,
    });
    expect(sourcePanelFor(thread, null).answer?.sources).toEqual([]);
  });
  it("selects either earlier answer without mixing reused citation numbers", () => {
    expect(sourcePanelFor(thread, a1.id)).toEqual({
      answer: a1,
      isLatest: false,
      earlierCited: null,
    });
    expect(sourcePanelFor(thread, a2.id)).toEqual({
      answer: a2,
      isLatest: false,
      earlierCited: null,
    });
    expect(answerWithCaptureLinks("Claim [1]", a1.sources)).toBe(
      "Claim [1](capture:bakery)",
    );
    expect(answerWithCaptureLinks("Claim [1]", a2.sources)).toBe(
      "Claim [1](capture:deadlift)",
    );
  });
  it("never offers evidence from a later answer for an earlier uncited answer", () => {
    expect(sourcePanelFor([q3, a3, q1, a1], a3.id)).toEqual({
      answer: a3,
      isLatest: false,
      earlierCited: null,
    });
  });
  it("falls back to latest for stale selections and user-message IDs", () => {
    for (const selected of ["deleted-answer", q1.id])
      expect(sourcePanelFor(thread, selected).answer).toBe(a3);
  });
  it("handles empty and user-only conversations", () => {
    for (const messages of [undefined, [], [q1]])
      expect(sourcePanelFor(messages, null)).toEqual({
        answer: null,
        isLatest: true,
        earlierCited: null,
      });
  });
  it("ties retries to the linked original question rather than the nearest question", () => {
    const retry = { ...a1, id: "retry", retryOf: a1.id };
    expect(questionFor([...thread, retry], retry)).toBe(q1);
    expect(questionFor(thread, { ...a2, userMessageId: null })).toBe(q2);
  });
});

describe("UX 15: safe persisted failure recovery", () => {
  it.each([
    ["cancelled", ["retry"]],
    ["timeout", ["retry", "rephrase"]],
    ["invalid_citation", ["retry"]],
    ["planner_error", ["rephrase", "retry"]],
    ["context_limit", ["new-chat", "rephrase"]],
    ["provider_error", ["retry", "setup"]],
    ["connection_lost", ["retry"]],
    ["conversation_busy", ["retry"]],
    ["analysis_provider_required", ["setup", "retry"]],
    ["ai_provider_required", ["setup", "retry"]],
  ])("maps stored %s to relevant recovery", (code, actions) => {
    const result = askFailure(String(code), "failed");
    expect(result.actions).toEqual(actions);
    expect(result.text).toBeTruthy();
    expect(result.text).not.toBe("Ask AI couldn’t finish this answer.");
  });
  it.each([
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
    "<script>provider-secret</script>",
    "provider /internal/path token=secret",
    null,
    undefined,
    "",
  ])("uses safe generic copy for unknown code %s", (code) => {
    expect(askFailure(code, "failed")).toEqual({
      text: "Ask AI couldn’t finish this answer.",
      actions: ["retry"],
    });
  });
  it("preserves stopped-answer recovery when its code is unknown", () => {
    expect(askFailure("constructor", "cancelled")).toEqual(
      askFailure("cancelled", "cancelled"),
    );
  });
});

describe("UX 15: failure reasons survive an actual SQLite close/reopen", () => {
  it("round-trips stored codes and applies safe copy after reopening", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { JobStore } = await import("../src/db.js");
    const root = await mkdtemp(join(tmpdir(), "ux-b-ask-persistence-"));
    let store = new JobStore(join(root, "test.sqlite"));
    try {
      const owner = store.createUser(
        "synthetic-owner",
        "synthetic-unused-password-hash",
      );
      const conversation = store.createConversation(
        owner.id,
        "Saved recovery",
      )!;
      const codes = [
        "cancelled",
        "timeout",
        "invalid_citation",
        "planner_error",
        "context_limit",
        "provider_error",
        "connection_lost",
        "conversation_busy",
        "analysis_provider_required",
        "ai_provider_required",
        "constructor",
        "__proto__",
        "toString",
        "provider-secret",
      ];
      for (const code of codes) {
        const attempt = store.beginConversationTurn(
          owner.id,
          conversation.id,
          "Synthetic question",
          crypto.randomUUID(),
        );
        store.failConversationAttempt(
          owner.id,
          conversation.id,
          attempt.assistantId,
          code === "cancelled" ? "cancelled" : "failed",
          code,
        );
      }
      store.close();
      store = new JobStore(join(root, "test.sqlite"));
      const answers = store
        .getConversation(owner.id, conversation.id)!
        .messages.filter((item) => item.role === "assistant");
      expect(answers.map((item) => item.errorCode)).toEqual(codes);
      for (const [index, answer] of answers.entries()) {
        const code = codes[index]!;
        expect(askFailure(answer.errorCode, answer.status)).toEqual(
          askFailure(code, code === "cancelled" ? "cancelled" : "failed"),
        );
      }
      expect(
        askFailure(answers.at(-1)!.errorCode, answers.at(-1)!.status).text,
      ).not.toContain("provider-secret");
    } finally {
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("Ask conversation evidence copy", () => {
  const renderSources = (sufficient: boolean | null, status: ChatMessage["status"] = "complete") =>
    renderToStaticMarkup(createElement(EmptyAnswerSources, { message: { sufficient, status } }));

  it("uses neutral copy for conversational answers without treating them as evidence failures", () => {
    const html = renderSources(null);
    expect(html).toContain("This answer doesn’t cite any saved posts.");
    expect(html).not.toContain("enough evidence");
    expect(renderToStaticMarkup(createElement(ArchiveMissNotice, {
      message: { sufficient: null, content: "Hello! How can I help with Social Knowledge?" },
    }))).toBe("");
  });

  it("keeps historical archive misses honest without repeating guidance beneath an answer", () => {
    expect(renderSources(false)).toContain("Your archive didn’t have enough evidence");
    expect(renderSources(true)).toContain("This answer doesn’t cite any saved posts.");
    expect(renderToStaticMarkup(createElement(ArchiveMissNotice, {
      message: { sufficient: false, content: "I couldn’t find saved posts about that. Try another topic." },
    }))).toBe("");
    expect(renderToStaticMarkup(createElement(ArchiveMissNotice, {
      message: { sufficient: false, content: "  " },
    }))).toContain("The saved archive did not contain enough evidence.");
  });

  it("keeps pending, failed and cancelled explanations separate from completed conversation", () => {
    expect(renderSources(null, "pending")).toContain("Sources will appear here if this answer cites saved posts.");
    for (const status of ["failed", "cancelled"] as const)
      expect(renderSources(null, status)).toContain("This answer didn’t finish");
    expect(renderToStaticMarkup(createElement(EmptyAnswerSources, { message: null })))
      .toContain("Saved posts an answer cites will appear here.");
  });

  it("never inherits saved-source cards into a conversational follow-up", () => {
    const conversational = { ...a3, sufficient: null, content: "Here is a general way to explore that idea." };
    const messages = [q1, a1, q3, conversational];
    const latest = sourcePanelFor(messages, null);
    expect(latest.answer).toBe(conversational);
    expect(latest.answer?.sources).toHaveLength(0);
    expect(latest.earlierCited).toBe(a1);
    expect(sourcePanelFor(messages, a1.id).answer?.sources).toHaveLength(1);
    expect(sourcePanelFor(messages, conversational.id).answer?.sufficient).toBeNull();
  });
});
