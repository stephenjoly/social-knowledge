import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderService } from "../src/ai-providers.js";
import { JobStore } from "../src/db.js";
import { testConfig } from "./helpers.js";

function urlOf(input: string | URL | Request) {
  return input instanceof Request ? input.url : String(input);
}

function tinyWav() {
  return Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.alloc(4),
    Buffer.from("WAVEfmt "),
  ]).toString("base64");
}

function stream(events: Array<Record<string, unknown>>) {
  return new Response(
    events
      .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      .join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}

describe("AI connection diagnostics", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function connectedService(
    respond: (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Response | Promise<Response>,
  ) {
    const store = new JobStore(":memory:");
    const user = store.createUser("diagnostic-user", "hash");
    const config = testConfig("/tmp/ai-diagnostics");
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        if (urlOf(input).endsWith("/models"))
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        return respond(input, init);
      },
    );
    vi.stubGlobal("fetch", fetch);
    const service = new AiProviderService(store, config);
    await service.verifyAndSave(user.id, "openai", "sk-diagnostic-placeholder");
    service.saveSelections(user.id, {
      transcription: { provider: "openai", model: config.transcriptionModel },
      analysis: { provider: "openai", model: "gpt-5", thinkingLevel: "high" },
    });
    return { config, fetch, service, store, user };
  }

  async function connectedCerebrasService(
    respond: (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Response | Promise<Response>,
  ) {
    const store = new JobStore(":memory:");
    const user = store.createUser("cerebras-diagnostic-user", "hash");
    const config = testConfig("/tmp/cerebras-ai-diagnostics");
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        if (urlOf(input).endsWith("/models"))
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        return respond(input, init);
      },
    );
    vi.stubGlobal("fetch", fetch);
    const service = new AiProviderService(store, config);
    await service.verifyAndSave(
      user.id,
      "cerebras",
      "csk-diagnostic-placeholder",
    );
    service.saveSelections(user.id, {
      analysis: {
        provider: "cerebras",
        model: config.cerebrasAnalysisModel,
        thinkingLevel: null,
      },
    });
    return { config, fetch, service, store, user };
  }

  it("runs bounded structured and streaming tests with the saved selection only", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    const { config, fetch, service, store, user } = await connectedService(
      (_input, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        requestBodies.push(body);
        if (body.stream)
          return stream([
            {
              type: "response.output_text.delta",
              delta: "diagnostic-ok",
            },
            { type: "response.completed", response: { status: "completed" } },
          ]);
        return new Response(JSON.stringify({ output_text: '{"ok":true}' }), {
          headers: { "content-type": "application/json" },
        });
      },
    );
    const beforeSelections = store.aiTaskSelections(user.id);
    const beforeJobs = store.database
      .prepare("SELECT COUNT(*) AS count FROM jobs")
      .get() as { count: number };
    const analysis = await service.testConnection(user.id, "analysis");
    const ask = await service.testConnection(user.id, "ask");

    expect(analysis).toMatchObject({
      ok: true,
      code: "ok",
      selection: { provider: "openai", model: "gpt-5", thinkingLevel: "high" },
    });
    expect(ask).toMatchObject({
      ok: true,
      code: "ok",
      selection: { provider: "openai", model: "gpt-5", thinkingLevel: "high" },
    });
    expect(analysis.checkedAt).toEqual(expect.any(String));
    expect(analysis.durationMs).toBeGreaterThanOrEqual(0);
    expect(requestBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: "gpt-5",
          store: false,
          max_output_tokens: 2048,
          reasoning: { effort: "high" },
          text: expect.objectContaining({ format: expect.any(Object) }),
        }),
        expect.objectContaining({
          model: "gpt-5",
          store: false,
          max_output_tokens: 2048,
          reasoning: { effort: "high" },
          stream: true,
        }),
      ]),
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(store.aiTaskSelections(user.id)).toEqual(beforeSelections);
    expect(
      store.database.prepare("SELECT COUNT(*) AS count FROM jobs").get(),
    ).toEqual(beforeJobs);
    expect(
      store.database
        .prepare("SELECT COUNT(*) AS count FROM conversation_messages")
        .get(),
    ).toEqual({ count: 0 });
    expect(config.transcriptionModel).toBe("gpt-4o-mini-transcribe");
    store.close();
  });

  it("uploads only bounded, signature-checked in-memory audio", async () => {
    const receivedSignals: AbortSignal[] = [];
    const { config, service, store, user } = await connectedService(
      (_input, init) => {
        if (init?.signal instanceof AbortSignal) receivedSignals.push(init.signal);
        return new Response(JSON.stringify({ text: "diagnostic transcript" }), {
          headers: { "content-type": "application/json" },
        });
      },
    );
    const good = await service.testConnection(user.id, "transcription", {
      contentType: "audio/wav",
      base64: tinyWav(),
    });
    const unsupported = await service.testConnection(user.id, "transcription", {
      contentType: "audio/x-wav",
      base64: tinyWav(),
    });
    const badSignature = await service.testConnection(user.id, "transcription", {
      contentType: "audio/wav",
      base64: Buffer.from("not a wave").toString("base64"),
    });
    const tooLarge = await service.testConnection(user.id, "transcription", {
      contentType: "audio/wav",
      base64: Buffer.concat([
        Buffer.from("RIFF"),
        Buffer.alloc(4),
        Buffer.from("WAVE"),
        Buffer.alloc(1024 * 1024),
      ]).toString("base64"),
    });

    expect(good).toMatchObject({
      ok: true,
      code: "ok",
      selection: {
        provider: "openai",
        model: config.transcriptionModel,
        thinkingLevel: null,
      },
    });
    expect(unsupported).toMatchObject({ ok: false, code: "unsupported_audio" });
    expect(badSignature).toMatchObject({ ok: false, code: "invalid_audio_data" });
    expect(tooLarge).toMatchObject({ ok: false, code: "invalid_audio_data" });
    expect(receivedSignals).toHaveLength(1);
    expect(receivedSignals[0]!.aborted).toBe(false);
    store.close();
  });

  it("rejects partial terminal stream failures and never retries a diagnostic request", async () => {
    let calls = 0;
    const { service, store, user } = await connectedService((_input, _init) => {
      calls++;
      return stream([
        { type: "response.output_text.delta", delta: "partial" },
        { type: "response.incomplete", response: { status: "incomplete" } },
      ]);
    });
    const result = await service.testConnection(user.id, "ask");

    expect(result).toMatchObject({ ok: false, code: "invalid_response" });
    expect(calls).toBe(1);
    store.close();
  });

  it("requires a non-whitespace delta and completed event from OpenAI streams", async () => {
    const eof = await connectedService(() =>
      stream([{ type: "response.output_text.delta", delta: "partial" }]),
    );
    await expect(eof.service.testConnection(eof.user.id, "ask")).resolves.toMatchObject({
      ok: false,
      code: "invalid_response",
    });
    eof.store.close();

    const whitespace = await connectedService(() =>
      stream([
        { type: "response.output_text.delta", delta: " \n\t" },
        { type: "response.completed", response: { status: "completed" } },
      ]),
    );
    await expect(
      whitespace.service.testConnection(whitespace.user.id, "ask"),
    ).resolves.toMatchObject({ ok: false, code: "invalid_response" });
    whitespace.store.close();
  });

  it("maps Cerebras diagnostic caps and accepts only stop finish reasons", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const complete = await connectedCerebrasService((_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { role: "assistant", content: '{"ok":true}' },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    });
    await expect(
      complete.service.testConnection(complete.user.id, "analysis"),
    ).resolves.toMatchObject({ ok: true, code: "ok" });
    expect(requestBody).toMatchObject({
      model: complete.config.cerebrasAnalysisModel,
      max_completion_tokens: 2048,
    });
    expect(requestBody).not.toHaveProperty("max_output_tokens");
    complete.store.close();

    const truncated = await connectedCerebrasService(() =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "length",
              message: { role: "assistant", content: '{"ok":true}' },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(
      truncated.service.testConnection(truncated.user.id, "analysis"),
    ).resolves.toMatchObject({ ok: false, code: "invalid_response" });
    truncated.store.close();
  });

  it("rejects Cerebras streamed length and content-filter finish reasons", async () => {
    for (const finishReason of ["length", "content_filter"]) {
      const service = await connectedCerebrasService(() =>
        stream([
          {
            choices: [
              { delta: { content: "partial" }, finish_reason: null },
            ],
          },
          { choices: [{ delta: {}, finish_reason: finishReason }] },
        ]),
      );
      await expect(
        service.service.testConnection(service.user.id, "ask"),
      ).resolves.toMatchObject({ ok: false, code: "invalid_response" });
      service.store.close();
    }
  });

  it("rejects incomplete structured output even when it contains valid JSON", async () => {
    const { service, store, user } = await connectedService(
      () =>
        new Response(
          JSON.stringify({ status: "incomplete", output_text: '{"ok":true}' }),
          { headers: { "content-type": "application/json" } },
        ),
    );
    await expect(service.testConnection(user.id, "analysis")).resolves.toMatchObject({
      ok: false,
      code: "invalid_response",
    });
    store.close();
  });

  it("caps active and recent diagnostic work per account", async () => {
    let resolveStream: ((response: Response) => void) | undefined;
    const busyService = await connectedService((_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { stream?: boolean };
      if (!body.stream)
        return new Response(JSON.stringify({ output_text: '{"ok":true}' }), {
          headers: { "content-type": "application/json" },
        });
      return new Promise<Response>((resolve) => {
        resolveStream = resolve;
      });
    });
    const active = busyService.service.testConnection(busyService.user.id, "ask");
    await vi.waitFor(() => expect(resolveStream).toBeTypeOf("function"));
    await expect(
      busyService.service.testConnection(busyService.user.id, "ask"),
    ).resolves.toMatchObject({ ok: false, code: "busy" });
    resolveStream!(
      stream([
        { type: "response.output_text.delta", delta: "diagnostic-ok" },
        { type: "response.completed", response: { status: "completed" } },
      ]),
    );
    await expect(active).resolves.toMatchObject({ ok: true, code: "ok" });
    busyService.store.close();

    const rateService = await connectedService(
      () =>
        new Response(JSON.stringify({ output_text: '{"ok":true}' }), {
          headers: { "content-type": "application/json" },
        }),
    );
    for (let attempt = 0; attempt < 5; attempt++)
      await expect(
        rateService.service.testConnection(rateService.user.id, "analysis"),
      ).resolves.toMatchObject({ ok: true, code: "ok" });
    await expect(
      rateService.service.testConnection(rateService.user.id, "analysis"),
    ).resolves.toMatchObject({ ok: false, code: "rate_limited" });
    rateService.store.close();
  });

  it("classifies provider credential, quota, and model failures without persisting diagnostics", async () => {
    const { service, store, user } = await connectedService(
      () =>
        new Response(
          JSON.stringify({ error: { code: "insufficient_quota" } }),
          { status: 429, headers: { "content-type": "application/json" } },
        ),
    );
    const quota = await service.testConnection(user.id, "analysis");
    expect(quota).toMatchObject({ ok: false, code: "quota_exceeded" });
    expect(store.aiProviderConnection(user.id, "openai")?.status).toBe(
      "verified",
    );
    store.close();

    const credential = await connectedService(
      () =>
        new Response(JSON.stringify({ error: { message: "invalid key" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      credential.service.testConnection(credential.user.id, "analysis"),
    ).resolves.toMatchObject({ ok: false, code: "credential_error" });
    expect(
      credential.store.aiProviderConnection(credential.user.id, "openai")
        ?.status,
    ).toBe("verified");
    credential.store.close();

    const model = await connectedService(
      () =>
        new Response(JSON.stringify({ error: { message: "unknown model" } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
    );
    await expect(
      model.service.testConnection(model.user.id, "analysis"),
    ).resolves.toMatchObject({ ok: false, code: "model_error" });
    model.store.close();
  });
});
