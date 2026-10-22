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
  });

  async function fixture() {
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
    });
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
      return store.getConversation(owner.id, chat.id)!.messages.at(-1)!;
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
