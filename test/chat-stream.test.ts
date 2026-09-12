import { describe, expect, it } from "vitest";
import {
  applyStreamEvent,
  finishStream,
  initialStreamState,
  mergeConversationSnapshot,
  reconcileConversationAttempt,
  SseDecoder,
} from "../web/chat-stream.js";

type TestMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: string[];
  sufficient: boolean | null;
  status: "pending" | "complete" | "failed" | "cancelled";
  errorCode: string | null;
  userMessageId?: string | null;
};

type TestConversation = {
  id: string;
  messages: TestMessage[];
};

function message(
  id: string,
  role: TestMessage["role"],
  content: string,
  status: TestMessage["status"],
): TestMessage {
  return {
    id,
    role,
    content,
    sources: [],
    sufficient: null,
    status,
    errorCode: null,
  };
}

describe("SSE stream helpers", () => {
  it("handles fragmented, combined, and final unterminated records", () => {
    const decoder = new SseDecoder();
    expect(decoder.push('event: delta\ndata: {"text":"fi')).toEqual([]);
    expect(decoder.push('rst"}\n\n')).toEqual([
      { event: "delta", data: { text: "first" } },
    ]);
    expect(
      decoder.push(
        'event: started\r\ndata: {"assistantId":"a"}\r\n\r\nevent: delta\ndata: {"text":" **bold"}\n\n',
      ),
    ).toEqual([
      { event: "started", data: { assistantId: "a" } },
      { event: "delta", data: { text: " **bold" } },
    ]);
    expect(
      decoder.push('event: completed\ndata: {"assistantId":"a"}', true),
    ).toEqual([{ event: "completed", data: { assistantId: "a" } }]);
  });

  it("rejects malformed event data instead of silently losing the stream", () => {
    const decoder = new SseDecoder();
    expect(() => decoder.push("event: delta\ndata: not-json\n\n")).toThrow(
      SyntaxError,
    );
    expect(() => decoder.push('data: {"text":"missing event"}\n\n')).toThrow(
      "invalid_sse_event",
    );
  });

  it("accumulates incomplete Markdown and preserves terminal state", () => {
    let state = initialStreamState<never>();
    state = applyStreamEvent(state, {
      event: "started",
      data: { assistantId: "assistant-1" },
    });
    state = applyStreamEvent(state, {
      event: "delta",
      data: { text: "**partial" },
    });
    state = applyStreamEvent(state, {
      event: "sources",
      data: { sources: [], sufficient: false },
    });
    state = applyStreamEvent(state, {
      event: "status",
      data: { status: "Writing a grounded answer…" },
    });
    state = applyStreamEvent(state, {
      event: "cancelled",
      data: { errorCode: "cancelled", message: "Answer stopped." },
    });
    expect(state).toMatchObject({
      assistantId: "assistant-1",
      text: "**partial",
      statusText: "Writing a grounded answer…",
      status: "cancelled",
      errorCode: "cancelled",
    });
    expect(finishStream(state)).toBe(state);
    expect(finishStream(initialStreamState()).status).toBe("failed");
  });

  it("merges authoritative messages by ID while retaining newer local state", () => {
    const current: TestConversation = {
      id: "conversation-1",
      messages: [
        message("optimistic-user", "user", "Question", "complete"),
        message("assistant-1", "assistant", "**partial", "failed"),
        message("local-only", "assistant", "Another answer", "complete"),
      ],
    };
    const pendingSnapshot: TestConversation = {
      id: "conversation-1",
      messages: [message("assistant-1", "assistant", "", "pending")],
    };
    const pendingMerged = mergeConversationSnapshot(current, pendingSnapshot, {
      assistantId: "assistant-1",
      partialText: "**partial",
      optimisticMessageIds: ["optimistic-user"],
    });
    expect(pendingMerged.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "assistant-1",
          content: "**partial",
          status: "failed",
        }),
        expect.objectContaining({ id: "optimistic-user" }),
        expect.objectContaining({ id: "local-only" }),
      ]),
    );

    const completeSnapshot: TestConversation = {
      id: "conversation-1",
      messages: [
        message("server-user", "user", "Question", "complete"),
        {
          ...message("assistant-1", "assistant", "authoritative", "complete"),
          userMessageId: "server-user",
        },
      ],
    };
    const completeMerged = mergeConversationSnapshot(
      current,
      completeSnapshot,
      {
        assistantId: "assistant-1",
        partialText: "stale partial",
        optimisticMessageIds: ["optimistic-user"],
      },
    );
    expect(completeMerged.messages[0]).toMatchObject({
      id: "server-user",
    });
    expect(completeMerged.messages[1]).toMatchObject({
      content: "authoritative",
      status: "complete",
    });
    expect(
      completeMerged.messages.filter((item) => item.role === "user"),
    ).toHaveLength(1);
  });

  it("polls a pending attempt until the server settles it", async () => {
    let clock = 0;
    let reads = 0;
    const snapshots: TestConversation[] = [
      {
        id: "conversation-1",
        messages: [message("assistant-1", "assistant", "", "pending")],
      },
      {
        id: "conversation-1",
        messages: [message("assistant-1", "assistant", "", "pending")],
      },
      {
        id: "conversation-1",
        messages: [message("assistant-1", "assistant", "", "cancelled")],
      },
    ];
    const seen: TestConversation[] = [];
    const result = await reconcileConversationAttempt(
      "assistant-1",
      async () => snapshots[Math.min(reads++, snapshots.length - 1)]!,
      {
        initialDelays: [0, 50, 100],
        timeout: 1000,
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
        onSnapshot: (snapshot) => seen.push(snapshot),
      },
    );
    expect(result).toBe("settled");
    expect(seen.at(-1)?.messages[0]?.status).toBe("cancelled");
    expect(reads).toBe(3);
  });

  it("keeps polling and reports a timeout when the server stays pending", async () => {
    let clock = 0;
    let stillPending = 0;
    const result = await reconcileConversationAttempt(
      "assistant-1",
      async () => ({
        id: "conversation-1",
        messages: [message("assistant-1", "assistant", "", "pending")],
      }),
      {
        initialDelays: [0],
        timeout: 250,
        pollInterval: 100,
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
        onStillPending: () => stillPending++,
      },
    );
    expect(result).toBe("timeout");
    expect(stillPending).toBe(1);
    expect(clock).toBeGreaterThanOrEqual(250);
  });
});
