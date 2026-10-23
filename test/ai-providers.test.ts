import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderService } from "../src/ai-providers.js";
import { JobStore } from "../src/db.js";
import { testConfig } from "./helpers.js";
import { loadConfig } from "../src/config.js";

describe("AI provider settings", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts without a deployment-wide OpenAI key", () => {
    const config = loadConfig({
      API_TOKEN: "test-token-that-is-at-least-24-characters",
    });
    expect(config.openAiApiKey).toBeUndefined();
  });

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
    expect(
      providers.providers.find((item) => item.id === "cerebras"),
    ).toMatchObject({
      connected: true,
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

  it("keeps legacy provider preferences separate from direct task assignment", async () => {
    const store = new JobStore(":memory:");
    const user = store.createUser("two-step", "hash");
    const config = testConfig("/tmp/ai-two-step");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
      ),
    );
    const service = new AiProviderService(store, config);
    await service.verifyAndSave(user.id, "openai", "sk-two-step-test-key");
    store.saveAiProviderConnection(
      user.id,
      "cerebras",
      "stored-secret",
      "cs…test",
    );
    expect(service.settings(user.id).selections).toEqual({
      ask: null,
      transcription: null,
      analysis: null,
    });
    expect(() =>
      service.saveSelections(user.id, { analysis: { provider: "openai" } }),
    ).toThrow("invalid_model_selection");
    expect(() =>
      service.saveConfiguration(user.id, "openai", {
        transcriptionModel: "not-a-model",
        analysisModel: config.analysisModel,
        thinkingLevel: null,
      }),
    ).toThrow("invalid_transcription_configuration");
    expect(() =>
      service.saveConfiguration(user.id, "cerebras", {
        transcriptionModel: null,
        analysisModel: config.cerebrasAnalysisModel,
        thinkingLevel: "high",
      }),
    ).toThrow("invalid_thinking_level");

    service.saveConfiguration(user.id, "openai", {
      transcriptionModel: config.transcriptionModel,
      analysisModel: config.analysisModel,
      thinkingLevel: "high",
    });
    const assigned = service.saveSelections(user.id, {
      transcription: { provider: "openai" },
      analysis: { provider: "openai" },
    });
    expect(assigned.selections.analysis).toEqual({
      provider: "openai",
      model: config.analysisModel,
      thinkingLevel: "high",
    });
    const direct = service.saveSelections(user.id, {
      analysis: { provider: "openai", model: "gpt-5", thinkingLevel: "low" },
    });
    expect(direct.selections.analysis).toEqual({
      provider: "openai",
      model: "gpt-5",
      thinkingLevel: "low",
    });

    await service.verifyAndSave(user.id, "openai", "sk-replacement-test-key");
    expect(
      service.settings(user.id).providers.find((item) => item.id === "openai"),
    ).toMatchObject({
      configuration: {
        transcriptionModel: config.transcriptionModel,
        analysisModel: config.analysisModel,
        thinkingLevel: "high",
      },
    });
    store.close();
  });

  it("migrates legacy selected defaults without letting later preference edits mutate assignments", () => {
    const store = new JobStore(":memory:");
    const user = store.createUser("legacy-configuration", "hash");
    const config = testConfig("/tmp/ai-legacy-configuration");
    store.saveAiProviderConnection(
      user.id,
      "openai",
      "legacy-payload",
      "sk…test",
    );
    store.saveAiTaskSelections(user.id, {
      transcriptionProvider: "openai",
      transcriptionModel: null,
      analysisProvider: "openai",
      analysisModel: null,
      analysisThinkingLevel: null,
    });
    const service = new AiProviderService(store, config);
    expect(service.settings(user.id).selections).toEqual({
      ask: null,
      transcription: { provider: "openai", model: config.transcriptionModel },
      analysis: {
        provider: "openai",
        model: config.analysisModel,
        thinkingLevel: null,
      },
    });
    service.saveConfiguration(user.id, "openai", {
      transcriptionModel: null,
      analysisModel: null,
      thinkingLevel: null,
    });
    expect(service.settings(user.id).selections).toEqual({
      ask: null,
      transcription: { provider: "openai", model: config.transcriptionModel },
      analysis: {
        provider: "openai",
        model: config.analysisModel,
        thinkingLevel: null,
      },
    });
    expect(store.aiProviderConfiguration(user.id, "openai")).toEqual({
      transcriptionModel: null,
      analysisModel: null,
      thinkingLevel: null,
    });
    store.close();
  });

  it("applies the saved OpenAI thinking level to routed requests", async () => {
    const store = new JobStore(":memory:");
    const user = store.createUser("thinking-route", "hash");
    const config = testConfig("/tmp/ai-thinking-route");
    let requestBody: Record<string, unknown> | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith("/models"))
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        return new Response(JSON.stringify({ output: [], output_text: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const service = new AiProviderService(store, config);
    await service.verifyAndSave(user.id, "openai", "sk-thinking-route-key");
    service.saveConfiguration(user.id, "openai", {
      transcriptionModel: config.transcriptionModel,
      analysisModel: config.analysisModel,
      thinkingLevel: "high",
    });
    service.saveSelections(user.id, { analysis: { provider: "openai" } });
    await service.runForUser(user.id, () =>
      service.routedClient().responses.create({
        model: "ignored",
        input: "test",
        reasoning: { effort: "low" },
      }),
    );
    expect(requestBody).toMatchObject({
      model: config.analysisModel,
      reasoning: { effort: "high" },
    });
    store.close();
  });

  it("keeps both connections and selects transcription independently", async () => {
    const store = new JobStore(":memory:");
    const user = store.createUser("separate-tasks", "hash");
    const config = testConfig("/tmp/ai-separate-tasks");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : String(input);
        const data = url.includes("cerebras")
          ? [{ id: config.cerebrasAnalysisModel }]
          : [{ id: config.transcriptionModel }, { id: config.analysisModel }];
        return new Response(JSON.stringify({ data }), { status: 200 });
      }),
    );
    const service = new AiProviderService(store, config);
    await service.verifyAndSave(user.id, "openai", "sk-openai-test-key");
    await service.verifyAndSave(user.id, "cerebras", "csk-cerebras-test-key");
    service.saveConfiguration(user.id, "openai", {
      transcriptionModel: config.transcriptionModel,
      analysisModel: config.analysisModel,
      thinkingLevel: null,
    });
    service.saveConfiguration(user.id, "cerebras", {
      transcriptionModel: null,
      analysisModel: config.cerebrasAnalysisModel,
      thinkingLevel: null,
    });
    const settings = service.saveSelections(user.id, {
      transcription: { provider: "openai" },
      analysis: { provider: "cerebras" },
    });
    expect(
      settings.providers.filter((provider) => provider.connected),
    ).toHaveLength(2);
    expect(settings.selections).toEqual({
      ask: null,
      transcription: { provider: "openai", model: config.transcriptionModel },
      analysis: {
        provider: "cerebras",
        model: config.cerebrasAnalysisModel,
        thinkingLevel: null,
      },
    });
    expect(settings.readiness).toEqual({ capture: true, ask: true });

    const afterRemoval = service.remove(user.id, "openai");
    expect(afterRemoval.selections.transcription).toBeNull();
    expect(afterRemoval.selections.analysis?.provider).toBe("cerebras");
    expect(afterRemoval.readiness).toEqual({ capture: false, ask: true });
    const afterReconnect = await service.verifyAndSave(
      user.id,
      "openai",
      "sk-openai-reconnected-key",
    );
    expect(afterReconnect.selections.transcription).toBeNull();
    expect(
      afterReconnect.providers.find((provider) => provider.id === "openai")
        ?.configuration,
    ).toBeNull();
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
    service.saveConfiguration(user.id, "cerebras", {
      transcriptionModel: null,
      analysisModel: "qwen-3.8-27b",
      thinkingLevel: null,
    });
    service.saveSelections(user.id, { analysis: { provider: "cerebras" } });
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
    service.saveConfiguration(user.id, "cerebras", {
      transcriptionModel: null,
      analysisModel: "qwen-3.8-27b",
      thinkingLevel: null,
    });
    service.saveSelections(user.id, { analysis: { provider: "cerebras" } });
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
    service.saveConfiguration(user.id, "cerebras", {
      transcriptionModel: null,
      analysisModel: "qwen-3.8-27b",
      thinkingLevel: null,
    });
    service.saveSelections(user.id, { analysis: { provider: "cerebras" } });
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

  it("reports unavailable local credential keys without changing shared account state, and recovers with the previous key ring", async () => {
    const store = new JobStore(":memory:");
    try {
      const user = store.createUser("key-ring-owner", "hash");
      const other = store.createUser("key-ring-other", "hash");
      let generationRequests = 0;
      vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith("/models")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
        generationRequests++;
        return new Response(JSON.stringify({ object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: '{"ok":true}', annotations: [] }] }] }), { status: 200, headers: { "content-type": "application/json" } });
      }));
      const originalConfig = testConfig("/tmp/local-key-original");
      originalConfig.aiCredentialsKey = "synthetic-original-encryption-identity";
      const original = new AiProviderService(store, originalConfig);
      await original.verifyAndSave(user.id, "openai", "sk-synthetic-owner-credential");
      original.saveSelections(user.id, { transcription: { provider: "openai", model: originalConfig.transcriptionModel }, analysis: { provider: "openai", model: "gpt-5", thinkingLevel: null } });
      const previewConfig = testConfig("/tmp/local-key-preview");
      previewConfig.aiCredentialsKey = "synthetic-preview-encryption-identity";
      const preview = new AiProviderService(store, previewConfig);
      await preview.verifyAndSave(other.id, "openai", "sk-synthetic-other-credential");
      preview.saveSelections(other.id, { analysis: { provider: "openai", model: "gpt-5", thinkingLevel: null } });
      const metadataBefore = store.aiProviderConnection(user.id, "openai");
      const selectionsBefore = store.aiTaskSelections(user.id);
      const changesBefore = store.database.prepare("SELECT total_changes() AS count").get();
      expect(preview.settings(user.id).providers.find((provider) => provider.id === "openai")).toMatchObject({ connected: false, status: "needs_attention" });
      expect(preview.settings(user.id).readiness).toEqual({ capture: false, ask: false });
      expect(preview.settings(user.id).selections.analysis).toEqual({ provider: "openai", model: "gpt-5", thinkingLevel: null });
      expect(preview.resolveAskSelection(user.id)).toBeNull();
      expect(preview.settings(other.id).providers.find((provider) => provider.id === "openai")).toMatchObject({ connected: true, status: "verified" });
      expect(preview.settings(other.id).readiness.ask).toBe(true);
      expect(() => preview.client(user.id, "openai", "gpt-5")).toThrow("ai_credentials_unreadable");
      expect(await preview.testConnection(user.id, "analysis")).toMatchObject({ ok: false, code: "credential_error", selection: { provider: "openai", model: "gpt-5", thinkingLevel: null } });
      expect(await preview.testConnection(user.id, "ask")).toMatchObject({ ok: false, code: "credential_error" });
      expect(generationRequests).toBe(0);
      expect(store.aiProviderConnection(user.id, "openai")).toEqual(metadataBefore);
      expect(store.aiTaskSelections(user.id)).toEqual(selectionsBefore);
      expect(store.database.prepare("SELECT total_changes() AS count").get()).toEqual(changesBefore);
      expect(preview.client(other.id, "openai", "gpt-5").provider).toBe("openai");
      expect(original.client(user.id, "openai", "gpt-5").provider).toBe("openai");
      const recoveredConfig = { ...previewConfig, aiCredentialsPreviousKeys: [originalConfig.aiCredentialsKey] };
      const recovered = new AiProviderService(store, recoveredConfig);
      expect(recovered.settings(user.id).providers.find((provider) => provider.id === "openai")).toMatchObject({ connected: true, status: "verified" });
      expect(recovered.settings(user.id).readiness).toEqual({ capture: true, ask: true });
      expect(recovered.resolveAskSelection(user.id)).toEqual({ provider: "openai", model: "gpt-5", thinkingLevel: null });
      expect(await recovered.testConnection(user.id, "analysis")).toMatchObject({ ok: true, code: "ok", selection: { provider: "openai", model: "gpt-5", thinkingLevel: null } });
      expect(generationRequests).toBe(1);
      expect(store.aiProviderConnection(user.id, "openai")).toEqual(metadataBefore);
      expect(store.aiTaskSelections(user.id)).toEqual(selectionsBefore);
      expect(store.database.prepare("SELECT total_changes() AS count").get()).toEqual(changesBefore);
    } finally { store.close(); }
  });

  it.each(["openai", "cerebras"] as const)(
    "preserves configured %s defaults when upgrading legacy selections without a model",
    async (provider) => {
      const store = new JobStore(":memory:");
      try {
        const user = store.createUser(`legacy-${provider}`, "hash");
        const config = testConfig("/tmp/catalog-legacy");
        const service = new AiProviderService(store, config);
        vi.stubGlobal(
          "fetch",
          vi.fn(
            async () =>
              new Response(JSON.stringify({ data: [] }), { status: 200 }),
          ),
        );
        await service.verifyAndSave(
          user.id,
          provider,
          "synthetic-legacy-credential",
        );
        store.saveAiTaskSelections(user.id, {
          ...store.aiTaskSelections(user.id),
          analysisProvider: provider,
          analysisModel: null,
          analysisThinkingLevel: null,
        });
        const expected =
          provider === "openai"
            ? config.analysisModel
            : config.cerebrasAnalysisModel;
        expect(service.client(user.id, provider).model).toBe(expected);
        expect(service.settings(user.id).selections.analysis).toEqual({
          provider,
          model: expected,
          thinkingLevel: null,
        });
        expect(store.aiTaskSelections(user.id).analysisModel).toBe(expected);
      } finally {
        store.close();
      }
    },
  );

  it("orders current models before configured and legacy options without changing saved defaults", () => {
    const store = new JobStore(":memory:");
    try {
      const user = store.createUser("catalog-owner", "hash");
      const config = {
        ...testConfig("/tmp/catalog"),
        analysisModel: "custom-analysis",
      };
      const service = new AiProviderService(store, config);
      store.saveAiProviderConnection(user.id, "openai", "unused", "synthetic");
      const legacy = {
        provider: "openai" as const,
        model: "gpt-5",
        thinkingLevel: "minimal" as const,
      };
      service.saveSelections(user.id, { analysis: legacy, ask: legacy });
      const before = store.aiTaskSelections(user.id);
      const options = service
        .list(user.id)
        .find((provider) => provider.id === "openai")!.taskOptions.analysis;
      expect(options.map((option) => option.model)).toEqual([
        "gpt-6-luna",
        "gpt-6.1-sol",
        "gpt-6-astra",
        "custom-analysis",
        "gpt-5-mini",
        "gpt-5",
      ]);
      expect(
        options.slice(0, 3).map((option) => option.thinkingLevels),
      ).toEqual(Array(3).fill(["low", "medium", "high"]));
      expect(
        options.find((option) => option.model === "custom-analysis")!
          .thinkingLevels,
      ).toEqual([]);
      expect(
        options.find((option) => option.model === "gpt-5")!.thinkingLevels,
      ).toEqual(["minimal", "low", "medium", "high"]);
      expect(service.settings(user.id).selections).toMatchObject({
        analysis: legacy,
        ask: legacy,
      });
      expect(store.aiTaskSelections(user.id)).toEqual(before);
      expect(config.analysisModel).toBe("custom-analysis");
      const configuredCurrent = new AiProviderService(store, {
        ...config,
        analysisModel: "gpt-6-luna",
      });
      expect(
        configuredCurrent
          .list(user.id)[0]!
          .models.analysis.filter((model) => model === "gpt-6-luna"),
      ).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it.each([
    ...([null, "high"] as const).map((thinkingLevel) => ({
      model: "gpt-5",
      thinkingLevel,
    })),
    ...["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"].flatMap((model) =>
      ([null, "low", "medium", "high"] as const).map((thinkingLevel) => ({
        model,
        thinkingLevel,
      })),
    ),
  ])(
    "sends $model diagnostics through Responses with thinking=$thinkingLevel",
    async ({ model, thinkingLevel }) => {
      const store = new JobStore(":memory:");
      try {
        const user = store.createUser("gpt-five-route", "hash");
        const bodies: Array<Record<string, unknown>> = [];
        const expectedEndpoints: boolean[] = [];
        vi.stubGlobal(
          "fetch",
          vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = input instanceof Request ? input.url : String(input);
            if (url.endsWith("/models"))
              return new Response(JSON.stringify({ data: [] }), {
                status: 200,
              });
            expectedEndpoints.push(
              url === "https://api.openai.com/v1/responses",
            );
            const body = JSON.parse(String(init?.body)) as Record<
              string,
              unknown
            >;
            bodies.push(body);
            if (body.stream)
              return new Response(
                [
                  {
                    type: "response.output_text.delta",
                    delta: "diagnostic-ok",
                  },
                  {
                    type: "response.completed",
                    response: { status: "completed" },
                  },
                ]
                  .map(
                    (event) =>
                      `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
                  )
                  .join(""),
                {
                  status: 200,
                  headers: { "content-type": "text/event-stream" },
                },
              );
            return new Response(
              JSON.stringify({
                object: "response",
                status: "completed",
                output: [
                  {
                    type: "message",
                    role: "assistant",
                    content: [
                      {
                        type: "output_text",
                        text: '{"ok":true}',
                        annotations: [],
                      },
                    ],
                  },
                ],
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }),
        );
        const service = new AiProviderService(
          store,
          testConfig("/tmp/gpt-five-route"),
        );
        await service.verifyAndSave(
          user.id,
          "openai",
          "sk-synthetic-gpt-five-credential",
        );
        service.saveSelections(user.id, {
          analysis: { provider: "openai", model, thinkingLevel },
        });
        const result = await service.testConnection(user.id, "analysis");
        expect(expectedEndpoints).toEqual([true]);
        expect(bodies).toHaveLength(1);
        expect(result).toMatchObject({ ok: true, code: "ok" });
        expect(await service.testConnection(user.id, "ask")).toMatchObject({
          ok: true,
          code: "ok",
        });
        expect(bodies).toHaveLength(2);
        expect(bodies[0]).toMatchObject({
          model,
          store: false,
          max_output_tokens: 2048,
          text: { format: { type: "json_schema", strict: true } },
        });
        expect(bodies[1]).toMatchObject({
          model,
          store: false,
          max_output_tokens: 2048,
          stream: true,
        });
        for (const body of bodies) {
          if (thinkingLevel === null)
            expect(body).not.toHaveProperty("reasoning");
          else
            expect(body).toHaveProperty("reasoning", { effort: thinkingLevel });
          expect(body).not.toHaveProperty("reasoning_effort");
          expect(body).not.toHaveProperty("temperature");
        }
      } finally {
        store.close();
      }
    },
  );
});
