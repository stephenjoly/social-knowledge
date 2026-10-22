import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { JobStore, type AskSelection } from "../src/db.js";
import { AuthService } from "../src/auth.js";
import { AiProviderService } from "../src/ai-providers.js";
import { EventHub } from "../src/events.js";
import type { AskService } from "../src/ask.js";
import { testConfig } from "./helpers.js";

describe("chat-first API", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
    vi.useRealTimers();
  });

  async function fixture(afterConversationRecovery?: () => void) {
    const root = await mkdtemp(path.join(tmpdir(), "ask-contract-"));
    await mkdir(path.join(root, "data"));
    const config = testConfig(root);
    const store = new JobStore(config.databasePath);
    const owner = store.createUser("owner", "hash");
    const other = store.createUser("other", "hash");
    const headersFor = (id: string) => {
      const token = `synthetic-session-${id}`;
      store.createSession(
        id,
        AuthService.hashToken(token),
        new Date(Date.now() + 60000).toISOString(),
      );
      return { cookie: `social_knowledge_session=${token}` };
    };
    const headers = headersFor(owner.id);
    const otherHeaders = headersFor(other.id);
    const providers = new AiProviderService(store, config);
    store.saveAiProviderConnection(owner.id, "openai", "unused", "synthetic");
    store.saveAiProviderConnection(owner.id, "cerebras", "unused", "synthetic");
    const analysis: AskSelection = {
      provider: "openai",
      model: "gpt-5-mini",
      thinkingLevel: "low",
    };
    const alternate: AskSelection = {
      provider: "cerebras",
      model: config.cerebrasAnalysisModel,
      thinkingLevel: null,
    };
    providers.saveSelections(owner.id, { analysis });
    let fail = false;
    const answer = vi.fn<Pick<AskService, "answer">["answer"]>(
      async (input) => {
        if (fail) throw new Error("synthetic failure");
        input.onStatus?.("Synthetic status");
        input.onDelta("Synthetic answer");
        store.completeConversationAttempt(
          input.userId,
          input.conversationId,
          input.assistantId,
          "Synthetic answer",
          [],
          false,
        );
        return {
          answer: "Synthetic answer",
          sources: [],
          sufficient: false,
          diagnostics: {
            action: "none",
            standaloneQuestion: input.question,
            terms: [],
            selected: [],
            reusedCaptureIds: [],
            compacted: false,
            compactionFallback: false,
            estimatedContextTokens: 0,
          },
        };
      },
    );
    const run = vi.spyOn(providers, "runForUser");
    const app = buildApp(config, store, new EventHub(), undefined, providers, {
      answer,
    }, afterConversationRecovery);
    cleanups.push(async () => {
      await app.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    });
    return {
      app,
      store,
      owner,
      other,
      headers,
      otherHeaders,
      providers,
      analysis,
      alternate,
      answer,
      run,
      fail: () => {
        fail = true;
      },
    };
  }

  it("persists rename, pin, selection and latest status without leaking across owners", async () => {
    const { app, headers, otherHeaders, store, owner, other, alternate } =
      await fixture();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers,
      payload: { title: " Original ", selection: alternate },
    });
    expect(created.statusCode).toBe(201);
    const chat = created.json().conversation;
    expect(chat).toMatchObject({
      title: "Original",
      pinnedAt: null,
      selection: alternate,
    });
    chat.updatedAt = "2001-01-01T00:00:00.000Z";
    store.database.prepare("UPDATE conversations SET updated_at=? WHERE id=?").run(chat.updatedAt, chat.id);
    const url = `/api/v1/conversations/${chat.id}`;
    const later = store.createConversation(owner.id, "Later")!;
    store.database
      .prepare("UPDATE conversations SET updated_at=? WHERE id=?")
      .run("2099-01-01", later.id);
    const pinned = await app.inject({
      method: "PATCH",
      url,
      headers,
      payload: { pinned: true },
    });
    expect(pinned.json().conversation.updatedAt).toBe(chat.updatedAt);
    expect(pinned.json().conversation.pinnedAt).toEqual(expect.any(String));
    const renamed = await app.inject({
      method: "PATCH",
      url,
      headers,
      payload: { title: " Renamed " },
    });
    expect(renamed.json().conversation.title).toBe("Renamed");
    expect(renamed.json().conversation.updatedAt).toBe(chat.updatedAt);
    const pending = store.beginConversationTurn(
      owner.id,
      chat.id,
      "Question",
      "pending-request",
    );
    let list = await app.inject({
      method: "GET",
      url: "/api/v1/conversations",
      headers,
    });
    expect(list.json().conversations[0]).toMatchObject({
      id: chat.id,
      lastStatus: "pending",
      selection: alternate,
      messageCount: 2,
    });
    store.failConversationAttempt(
      owner.id,
      chat.id,
      pending.assistantId,
      "failed",
      "provider_error",
    );
    list = await app.inject({
      method: "GET",
      url: "/api/v1/conversations",
      headers,
    });
    expect(list.json().conversations[0].lastStatus).toBe("failed");
    for (const method of ["GET", "PATCH", "DELETE"] as const) {
      const response = await app.inject({
        method,
        url,
        headers: otherHeaders,
        ...(method === "PATCH"
          ? { payload: { title: "Stolen", selection: alternate } }
          : {}),
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "not_found" });
    }
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/conversations",
          headers: otherHeaders,
        })
      ).json().conversations,
    ).toEqual([]);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/conversations",
          headers: otherHeaders,
          payload: { selection: alternate },
        })
      ).statusCode,
    ).toBe(400);
    expect(store.listConversations(other.id)).toEqual([]);
    for (const payload of [
      {},
      { title: " " },
      { pinned: "yes" },
      { unknown: true },
      { selection: { ...alternate, model: "unknown" } },
      { selection: { ...alternate, thinkingLevel: "high" } },
    ]) {
      expect(
        (await app.inject({ method: "PATCH", url, headers, payload }))
          .statusCode,
      ).toBe(400);
    }
    for (const selection of [
      { ...alternate, model: "unknown" },
      { ...alternate, thinkingLevel: "high" },
      { ...alternate, provider: "anthropic" },
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/conversations",
            headers,
            payload: { selection },
          })
        ).statusCode,
      ).toBe(400);
    }
    const cleared = await app.inject({
      method: "PATCH",
      url,
      headers,
      payload: { pinned: false, selection: null },
    });
    expect(cleared.json().conversation).toMatchObject({
      pinnedAt: null,
      selection: null,
    });
  });

  it("resolves chat, Ask default, then Analysis; snapshots actual retries and failures", async () => {
    const f = await fixture();
    const {
      app,
      store,
      owner,
      headers,
      otherHeaders,
      providers,
      analysis,
      alternate,
      run,
    } = f;
    const chat = store.createConversation(owner.id)!;
    const url = `/api/v1/conversations/${chat.id}/messages`;
    const send = async () => {
      const response = await app.inject({
        method: "POST",
        url,
        headers,
        payload: { message: "Question" },
      });
      expect(response.statusCode).toBe(200);
      const assistant = store.getConversation(owner.id, chat.id)!.messages.at(-1)!;
      const events = response.body.split("\n\n").filter(Boolean).map((packet) => ({
        name: packet.split("\n")[0]!.slice(7),
        data: JSON.parse(packet.split("\n")[1]!.slice(6)) as unknown,
      }));
      expect(events.slice(0, 2).map((event) => event.name)).toEqual(["started", "model"]);
      expect(events[1]!.data).toEqual({ assistantId: assistant.id, selection: { provider: assistant.provider, model: assistant.model, thinkingLevel: assistant.thinkingLevel } });
      for (const name of ["status", "delta"]) {
        const index = events.findIndex((event) => event.name === name);
        if (assistant.status === "complete") expect(index).toBeGreaterThan(1);
      }
      return assistant;
    };
    expect(await send()).toMatchObject(analysis);
    expect(run.mock.calls.at(-1)?.slice(2)).toEqual([
      analysis.provider,
      analysis.model,
      analysis.thinkingLevel,
    ]);
    const saved = await app.inject({
      method: "PUT",
      url: "/api/v1/ai-settings",
      headers,
      payload: { ask: alternate },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().selections.ask).toEqual(alternate);
    expect(await send()).toMatchObject(alternate);
    store.updateConversation(owner.id, chat.id, { selection: analysis });
    const complete = await send();
    expect(complete).toMatchObject(analysis);
    const retryUrl = `${url}/${complete.id}/retry`;
    const retried = await app.inject({
      method: "POST",
      url: retryUrl,
      headers,
      payload: { selection: alternate },
    });
    expect(retried.statusCode).toBe(200);
    const messages = store.getConversation(owner.id, chat.id)!.messages;
    expect(messages.at(-1)).toMatchObject({
      ...alternate,
      retryOf: complete.id,
      status: "complete",
    });
    expect(retried.body.split("\n\n").slice(0, 2)).toEqual([
      `event: started\ndata: ${JSON.stringify({ assistantId: messages.at(-1)!.id })}`,
      `event: model\ndata: ${JSON.stringify({ assistantId: messages.at(-1)!.id, selection: alternate })}`,
    ]);
    expect(messages.filter((message) => message.role === "user")).toHaveLength(
      3,
    );
    expect(store.getConversation(owner.id, chat.id)!.selection).toEqual(
      analysis,
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: retryUrl,
          headers,
          payload: { selection: { ...alternate, model: "bad" } },
        })
      ).json(),
    ).toEqual({ error: "invalid_selection" });
    expect(
      (
        await app.inject({
          method: "POST",
          url: retryUrl,
          headers,
          payload: { selection: { ...alternate, thinkingLevel: "invalid" } },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: otherHeaders,
          payload: { message: "Question" },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: retryUrl,
          headers: otherHeaders,
          payload: { selection: alternate },
        })
      ).json(),
    ).toEqual({ error: "not_found" });
    store.updateConversation(owner.id, chat.id, { selection: alternate });
    store.deleteAiProviderConnection(owner.id, "cerebras");
    expect(providers.settings(owner.id).selections.ask).toBeNull();
    expect(await send()).toMatchObject(analysis);
    f.fail();
    expect(await send()).toMatchObject({
      ...analysis,
      status: "failed",
      errorCode: "provider_error",
    });
    providers.saveSelections(owner.id, { analysis: null });
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers,
          payload: { message: "Question" },
        })
      ).statusCode,
    ).toBe(428);
    // A valid per-chat selection still works with neither account default assigned.
    store.updateConversation(owner.id, chat.id, { selection: analysis });
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers,
          payload: { message: "Question" },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("retries only the latest completed answer while preserving replay and failed/cancelled recovery", async () => {
    const { app, store, owner, otherHeaders, headers } = await fixture();
    const chat = store.createConversation(owner.id)!;
    const first = store.beginConversationTurn(owner.id, chat.id, "First question", "first-question");
    store.completeConversationAttempt(owner.id, chat.id, first.assistantId, "First answer", [], false);
    const last = store.beginConversationTurn(owner.id, chat.id, "Last question", "last-question");
    store.completeConversationAttempt(owner.id, chat.id, last.assistantId, "Last answer", [], false);
    const retryUrl = (id: string) => `/api/v1/conversations/${chat.id}/messages/${id}/retry`;
    const rejected = await app.inject({ method: "POST", url: retryUrl(first.assistantId), headers, payload: {} });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toEqual({ error: "not_retryable" });
    expect((await app.inject({ method: "POST", url: retryUrl(last.assistantId), headers: otherHeaders, payload: {} })).statusCode).toBe(404);
    const request = { method: "POST" as const, url: retryUrl(last.assistantId), headers, payload: { requestId: "successful-retry" } };
    expect((await app.inject(request)).statusCode).toBe(200);
    const replay = await app.inject(request);
    expect(replay.statusCode).toBe(409);
    expect(replay.json().error).toBe("request_already_processed");
    for (const status of ["failed", "cancelled"] as const) {
      const recoverable = store.createConversation(owner.id)!;
      const old = store.beginConversationTurn(owner.id, recoverable.id, "Recover this", `old-${status}`);
      store.failConversationAttempt(owner.id, recoverable.id, old.assistantId, status, "provider_error");
      const newer = store.beginConversationTurn(owner.id, recoverable.id, "Newer question", `newer-${status}`);
      store.completeConversationAttempt(owner.id, recoverable.id, newer.assistantId, "Newer answer", [], false);
      expect((await app.inject({ method: "POST", url: `/api/v1/conversations/${recoverable.id}/messages/${old.assistantId}/retry`, headers, payload: {} })).statusCode).toBe(200);
    }
  });

  it.each(["complete", "timeout"] as const)(
    "allows slow reasoning beyond two minutes and handles %s at the bounded deadline",
    async (outcome) => {
      vi.useFakeTimers({
        toFake: [
          "Date",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
        ],
      });
      const { app, store, owner, headers, answer } = await fixture();
      await app.ready();
      const chat = store.createConversation(owner.id)!;
      const immediateAnswer = answer.getMockImplementation()!;
      let signal: AbortSignal | undefined;
      let finish!: () => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      answer.mockImplementation(async (input) => {
        signal = input.signal;
        input.onStatus?.("Writing a grounded answer…");
        await new Promise<void>((resolve, reject) => {
          finish = resolve;
          input.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
          entered();
        });
        return immediateAnswer(input);
      });
      const response = app
        .inject({
          method: "POST",
          url: `/api/v1/conversations/${chat.id}/messages`,
          headers,
          payload: {
            message: "Summarise my saved posts",
            requestId: `slow-${outcome}`,
          },
        })
        .then((result) => result);
      await started;
      const pending = () =>
        store.getConversation(owner.id, chat.id)!.messages.at(-1)!;
      await vi.advanceTimersByTimeAsync(60000);
      expect(signal?.aborted).toBe(false);
      expect(pending().status).toBe("pending");
      await vi.advanceTimersByTimeAsync(90000);
      expect(signal?.aborted).toBe(false);
      expect(pending().status).toBe("pending");
      if (outcome === "complete") {
        finish();
        const result = await response;
        expect(result.body).toContain("event: completed");
        expect(result.body).not.toContain("event: error");
        expect(pending().status).toBe("complete");
      } else {
        await vi.advanceTimersByTimeAsync(29999);
        expect(signal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        const result = await response;
        expect(signal?.aborted).toBe(true);
        expect(result.body).toContain('"errorCode":"timeout"');
        expect(result.body).not.toContain("event: completed");
        expect(pending()).toMatchObject({
          status: "failed",
          errorCode: "timeout",
        });
      }
      await app.close();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("sweeps fresh interrupted attempts after they become stale, calls the hook, and clears unref timers on close", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const afterRecovery = vi.fn();
    const { app, store, owner, other } = await fixture(afterRecovery);
    const staleChat = store.createConversation(owner.id)!;
    const stale = store.beginConversationTurn(owner.id, staleChat.id, "Stale question", "stale-question");
    store.database.prepare("UPDATE conversation_messages SET created_at=? WHERE id=?").run(new Date(Date.now() - 300000).toISOString(), stale.assistantId);
    const freshChat = store.createConversation(other.id)!;
    const fresh = store.beginConversationTurn(other.id, freshChat.id, "Fresh question", "fresh-question");
    const statuses: string[] = [];
    afterRecovery.mockImplementation(() => statuses.push(store.getConversation(other.id, freshChat.id)!.messages.find((message) => message.id === fresh.assistantId)!.status));
    const intervals = vi.spyOn(globalThis, "setInterval");
    await app.ready();
    expect(store.getConversation(owner.id, staleChat.id)!.messages.find((message) => message.id === stale.assistantId)!.status).toBe("failed");
    expect(statuses).toEqual(["pending"]);
    const sweep = intervals.mock.results.find((_, index) => intervals.mock.calls[index]?.[1] === 30000)!.value as NodeJS.Timeout;
    expect(sweep.hasRef()).toBe(false);
    await vi.advanceTimersByTimeAsync(239999);
    expect(statuses).toHaveLength(8);
    expect(statuses.every((status) => status === "pending")).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(statuses.at(-1)).toBe("failed");
    expect(store.getConversation(other.id, freshChat.id)!.messages.find((message) => message.id === fresh.assistantId)).toMatchObject({ status: "failed", errorCode: "provider_error" });
    await app.close();
    const callsAfterClose = afterRecovery.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30000);
    expect(afterRecovery).toHaveBeenCalledTimes(callsAfterClose);
    expect(vi.getTimerCount()).toBe(0);
    intervals.mockRestore();
  });

  it("keeps Ask assignments, readiness and partial preferences account-scoped", async () => {
    const { app, headers, otherHeaders, alternate, providers, owner } =
      await fixture();
    const url = "/api/v1/preferences";
    expect(
      (await app.inject({ method: "GET", url, headers })).json().preferences,
    ).toMatchObject({ askSourcesPanel: true, sendWith: "enter" });
    expect(
      (
        await app.inject({
          method: "PATCH",
          url,
          headers,
          payload: { askSourcesPanel: false },
        })
      ).json().preferences,
    ).toMatchObject({
      askSourcesPanel: false,
      sendWith: "enter",
      defaultLanguage: "English",
    });
    expect(
      (
        await app.inject({
          method: "PATCH",
          url,
          headers,
          payload: { sendWith: "mod-enter" },
        })
      ).json().preferences.sendWith,
    ).toBe("mod-enter");
    expect(
      (await app.inject({ method: "GET", url, headers: otherHeaders })).json()
        .preferences,
    ).toMatchObject({ askSourcesPanel: true, sendWith: "enter" });
    for (const payload of [
      {},
      { askSourcesPanel: "false" },
      { sendWith: "tab" },
      { unknown: true },
    ])
      expect(
        (await app.inject({ method: "PATCH", url, headers, payload }))
          .statusCode,
      ).toBe(400);
    const settingsUrl = "/api/v1/ai-settings";
    expect(
      (
        await app.inject({
          method: "PUT",
          url: settingsUrl,
          headers: otherHeaders,
          payload: { ask: alternate },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: settingsUrl,
          headers,
          payload: { ask: { ...alternate, model: "bad" } },
        })
      ).statusCode,
    ).toBe(409);
    providers.saveSelections(owner.id, { analysis: null, ask: alternate });
    const state = (
      await app.inject({ method: "GET", url: "/api/v1/ai-providers", headers })
    ).json();
    expect(state.selections).toMatchObject({ analysis: null, ask: alternate });
    expect(state.readiness).toEqual({ ask: true, capture: false });
    const otherState = (
      await app.inject({
        method: "GET",
        url: "/api/v1/ai-providers",
        headers: otherHeaders,
      })
    ).json();
    expect(otherState.selections.ask).toBeNull();
    expect(otherState.readiness.ask).toBe(false);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: settingsUrl,
          headers,
          payload: { ask: null },
        })
      ).json().readiness.ask,
    ).toBe(false);
  });
});
