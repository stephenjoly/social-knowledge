import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderService } from "../src/ai-providers.js";
import { JobStore } from "../src/db.js";
import { testConfig } from "./helpers.js";

describe("AI provider settings", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("verifies and encrypts a Cerebras key without returning it", async () => {
    const store = new JobStore(":memory:");
    const user = store.createUser("demo", "hash");
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ id: "qwen-3.8-27b" }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new AiProviderService(
      store,
      testConfig("/tmp/ai-provider-test"),
    );
    const providers = await service.verifyAndSave(
      user.id,
      "cerebras",
      "csk-secret-value-1234",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cerebras.ai/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer csk-secret-value-1234" },
      }),
    );
    expect(providers.find((item) => item.id === "cerebras")).toMatchObject({
      connected: true,
      active: true,
    });
    expect(JSON.stringify(providers)).not.toContain("csk-secret-value-1234");
    expect(
      store.aiProviderConnectionSecret(user.id)?.encryptedPayload,
    ).not.toContain("csk-secret-value-1234");
    expect(service.client(user.id).provider).toBe("cerebras");
    store.close();
  });

  it("does not save a rejected key", async () => {
    const store = new JobStore(":memory:");
    const user = store.createUser("demo", "hash");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    const service = new AiProviderService(
      store,
      testConfig("/tmp/ai-provider-reject"),
    );
    await expect(
      service.verifyAndSave(user.id, "openai", "bad-key"),
    ).rejects.toThrow("invalid_api_key");
    expect(service.configured(user.id)).toBe(false);
    store.close();
  });

  it("routes a structured generation through Cerebras chat completions", async () => {
    const store = new JobStore(":memory:");
    const user = store.createUser("demo", "hash");
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : String(input);
        urls.push(url);
        return url.endsWith("/models")
          ? new Response(JSON.stringify({ data: [{ id: "qwen-3.8-27b" }] }), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          : new Response(
              JSON.stringify({
                id: "test",
                object: "chat.completion",
                created: 1,
                model: "qwen-3.8-27b",
                choices: [
                  {
                    index: 0,
                    finish_reason: "stop",
                    message: { role: "assistant", content: '{"ok":true}' },
                  },
                ],
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
      }),
    );
    const service = new AiProviderService(store, testConfig("/tmp/ai-routing"));
    await service.verifyAndSave(user.id, "cerebras", "csk-routing-test-1234");
    const response = await service.runForUser(user.id, () =>
      service.routedClient().responses.create({
        model: "ignored-by-router",
        instructions: "Return JSON.",
        input: "Test",
        text: {
          format: {
            type: "json_schema",
            name: "test",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["ok"],
              properties: { ok: { type: "boolean" } },
            },
          },
        },
      }),
    );
    expect((response as { output_text: string }).output_text).toBe(
      '{"ok":true}',
    );
    expect(urls).toContain("https://api.cerebras.ai/v1/chat/completions");
    store.close();
  });

  it("preserves role-ordered conversation history when routing to Cerebras", async () => {
    const store = new JobStore(":memory:");
    const user = store.createUser("role-order", "hash");
    let chatBody: any = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith("/models"))
          return new Response(
            JSON.stringify({ data: [{ id: "qwen-3.8-27b" }] }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        chatBody = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({
            choices: [
              { message: { role: "assistant", content: '{"ok":true}' } },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const service = new AiProviderService(store, testConfig("/tmp/ai-roles"));
    await service.verifyAndSave(user.id, "cerebras", "csk-role-order-1234");
    await service.runForUser(user.id, () =>
      service.routedClient().responses.create({
        model: "ignored",
        instructions: "Return JSON.",
        input: [
          { role: "user", content: "first question" },
          { role: "assistant", content: "first answer" },
          { role: "user", content: "follow-up" },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "test",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["ok"],
              properties: { ok: { type: "boolean" } },
            },
          },
        },
      }),
    );
    expect(chatBody.messages).toEqual([
      { role: "system", content: "Return JSON." },
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "follow-up" },
    ]);
    store.close();
  });

  it("marks a provider as needing attention after authentication is revoked", async () => {
    const store = new JobStore(":memory:");
    const user = store.createUser("demo", "hash");
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return calls === 1
          ? new Response(
              JSON.stringify({ data: [{ id: "qwen-3.8Submission" }] }).replace(
                "qwen-3.8Submission",
                "qwen-3.8-27b",
              ),
              { status: 200, headers: { "content-type": "application/json" } },
            )
          : new Response(JSON.stringify({ error: { message: "revoked" } }), {
              status: 401,
              headers: { "content-type": "application/json" },
            });
      }),
    );
    const service = new AiProviderService(store, testConfig("/tmp/ai-revoked"));
    await service.verifyAndSave(user.id, "cerebras", "csk-revoked-test-1234");
    await expect(
      service.runForUser(user.id, () =>
        service
          .routedClient()
          .responses.create({ model: "ignored", input: "test" }),
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(store.aiProviderConnection(user.id)?.status).toBe("needs_attention");
    expect(service.configured(user.id)).toBe(false);
    store.close();
  });

  it("can decrypt credentials during a master-key rotation", async () => {
    const store = new JobStore(":memory:");
    const user = store.createUser("demo", "hash");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{ id: "qwen-3.8-27b" }] }), {
            status: 200,
          }),
      ),
    );
    const oldConfig = testConfig("/tmp/ai-old-key");
    oldConfig.aiCredentialsKey = "old-credential-key-that-is-long-enough";
    await new AiProviderService(store, oldConfig).verifyAndSave(
      user.id,
      "cerebras",
      "csk-rotation-test-1234",
    );
    const newConfig = testConfig("/tmp/ai-new-key");
    newConfig.aiCredentialsKey = "new-credential-key-that-is-long-enough";
    newConfig.aiCredentialsPreviousKeys = [oldConfig.aiCredentialsKey];
    expect(
      new AiProviderService(store, newConfig).client(user.id).provider,
    ).toBe("cerebras");
    store.close();
  });
});
