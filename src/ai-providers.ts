import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import OpenAI from "openai";
import { AsyncLocalStorage } from "node:async_hooks";
import type { AppConfig } from "./config.js";
import type { JobStore } from "./db.js";

export const aiProviderIds = ["openai", "cerebras"] as const;
export type AiProviderId = (typeof aiProviderIds)[number];
export const thinkingLevels = ["minimal", "low", "medium", "high"] as const;
export type ThinkingLevel = (typeof thinkingLevels)[number];
export const aiDiagnosticTasks = ["transcription", "analysis", "ask"] as const;
export type AiDiagnosticTask = (typeof aiDiagnosticTasks)[number];

export type AiDiagnosticAudio = {
  contentType: string;
  base64: string;
};

type AiDiagnosticSelection = {
  provider: AiProviderId;
  model: string;
  thinkingLevel: ThinkingLevel | null;
};

export type AiDiagnosticResult = {
  ok: boolean;
  code:
    | "ok"
    | "missing_selection"
    | "invalid_audio"
    | "unsupported_audio"
    | "invalid_audio_data"
    | "credential_error"
    | "model_error"
    | "quota_exceeded"
    | "rate_limited"
    | "timeout"
    | "provider_error"
    | "invalid_response"
    | "busy";
  checkedAt: string;
  durationMs: number;
  selection: AiDiagnosticSelection | null;
};

type ProviderConfigurationInput = {
  transcriptionModel: string | null;
  analysisModel: string | null;
  thinkingLevel: ThinkingLevel | null;
};

const diagnosticTimeoutMs = 45_000;
const diagnosticAttemptsPerMinute = 5;
const diagnosticAudioLimitBytes = 1024 * 1024;
const diagnosticAudioTypes = {
  "audio/mpeg": "mp3",
  "audio/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
} as const;

class DiagnosticFailure extends Error {
  constructor(
    readonly code: Exclude<AiDiagnosticResult["code"], "ok" | "busy">,
  ) {
    super(code);
  }
}

const definitions = {
  openai: {
    id: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    docsUrl: "https://platform.openai.com/api-keys",
    supportsVision: true,
  },
  cerebras: {
    id: "cerebras",
    name: "Cerebras",
    baseURL: "https://api.cerebras.ai/v1",
    docsUrl: "https://cloud.cerebras.ai/",
    supportsVision: false,
  },
} satisfies Record<AiProviderId, object>;

export class AiProviderService {
  private readonly encryptionKey: Buffer;
  private readonly encryptionKeyId: string;
  private readonly decryptionKeys = new Map<string, Buffer>();
  private readonly users = new AsyncLocalStorage<{
    userId: string;
    provider?: AiProviderId;
    model?: string;
    thinkingLevel?: ThinkingLevel;
    diagnostic?: boolean;
  }>();
  private readonly diagnosticRuns = new Map<
    string,
    { active: boolean; attempts: number[] }
  >();
  constructor(
    private readonly store: JobStore,
    private readonly config: AppConfig,
  ) {
    const derive = (secret: string) =>
      createHash("sha256")
        .update("social-knowledge-ai-provider-credentials\0")
        .update(secret)
        .digest();
    const identify = (key: Buffer) =>
      createHash("sha256").update(key).digest("hex").slice(0, 12);
    this.encryptionKey = derive(config.aiCredentialsKey);
    this.encryptionKeyId = identify(this.encryptionKey);
    this.decryptionKeys.set(this.encryptionKeyId, this.encryptionKey);
    for (const secret of config.aiCredentialsPreviousKeys) {
      const key = derive(secret);
      this.decryptionKeys.set(identify(key), key);
    }
  }

  list(userId: string) {
    const connections = this.store.aiProviderConnections(userId);
    return aiProviderIds.map((id) => ({
      ...definitions[id],
      capabilities: {
        transcription: id === "openai",
        analysis: true,
      },
      models: {
        transcription: this.transcriptionModels(id),
        analysis: this.analysisOptions(id).map((option) => option.model),
      },
      taskOptions: {
        transcription: this.transcriptionModels(id).map((model) => ({ model })),
        analysis: this.analysisOptions(id),
      },
      configuration: this.store.aiProviderConfiguration(userId, id) ?? null,
      connected: connections.some(
        (connection) =>
          connection.provider === id && connection.status === "verified",
      ),
      status:
        connections.find((connection) => connection.provider === id)?.status ??
        "not_connected",
      keyHint:
        connections.find((connection) => connection.provider === id)?.keyHint ??
        null,
      verifiedAt:
        connections.find((connection) => connection.provider === id)
          ?.verifiedAt ?? null,
    }));
  }

  settings(userId: string) {
    this.upgradeLegacySelections(userId);
    const selected = this.store.aiTaskSelections(userId);
    const connections = this.store.aiProviderConnections(userId);
    const verified = (provider: string | null) =>
      Boolean(
        provider &&
        connections.some(
          (connection) =>
            connection.provider === provider &&
            connection.status === "verified",
        ),
      );
    const transcription =
      selected.transcriptionProvider === "openai" &&
      selected.transcriptionModel !== null &&
      this.isTranscriptionModel("openai", selected.transcriptionModel) &&
      verified("openai")
        ? {
            provider: "openai" as const,
            model: selected.transcriptionModel,
          }
        : null;
    const analysis =
      selected.analysisProvider &&
      selected.analysisModel !== null &&
      this.isAnalysisModel(selected.analysisProvider, selected.analysisModel) &&
      this.supportsThinkingLevel(
        selected.analysisProvider,
        selected.analysisModel,
        selected.analysisThinkingLevel,
      ) &&
      verified(selected.analysisProvider)
        ? {
            provider: selected.analysisProvider as AiProviderId,
            model: selected.analysisModel,
            thinkingLevel: selected.analysisThinkingLevel,
          }
        : null;
    return {
      providers: this.list(userId),
      selections: { transcription, analysis },
      readiness: {
        capture: Boolean(transcription && analysis),
        ask: Boolean(analysis),
      },
    };
  }

  configured(userId: string) {
    return this.settings(userId).readiness.ask;
  }

  captureSelections(userId: string) {
    const settings = this.settings(userId);
    if (!settings.selections.transcription)
      throw new Error("transcription_required");
    if (!settings.selections.analysis)
      throw new Error("analysis_provider_required");
    return {
      transcriptionProvider: settings.selections.transcription.provider,
      transcriptionModel: settings.selections.transcription.model,
      analysisProvider: settings.selections.analysis.provider,
      analysisModel: settings.selections.analysis.model,
      analysisThinkingLevel: settings.selections.analysis.thinkingLevel,
    };
  }

  activeProvider(userId: string): AiProviderId | null {
    return this.settings(userId).selections.analysis?.provider ?? null;
  }

  runForUser<T>(
    userId: string,
    action: () => T,
    provider?: AiProviderId | null,
    model?: string | null,
    thinkingLevel?: ThinkingLevel | null,
  ): T {
    const analysis = this.settings(userId).selections.analysis;
    const selectedProvider = provider ?? analysis?.provider;
    const selectedModel = model ?? analysis?.model;
    const selectedThinkingLevel =
      thinkingLevel === undefined ? analysis?.thinkingLevel : thinkingLevel;
    return this.users.run(
      {
        userId,
        ...(selectedProvider ? { provider: selectedProvider } : {}),
        ...(selectedModel ? { model: selectedModel } : {}),
        ...(selectedThinkingLevel
          ? { thinkingLevel: selectedThinkingLevel }
          : {}),
      },
      action,
    );
  }

  enterUser(
    userId: string,
    provider?: AiProviderId | null,
    model?: string | null,
    thinkingLevel?: ThinkingLevel | null,
  ) {
    this.users.enterWith({
      userId,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(thinkingLevel ? { thinkingLevel } : {}),
    });
  }

  /** An OpenAI-shaped generation client so existing generation stages remain provider-agnostic. */
  routedClient(): OpenAI {
    const service = this;
    return {
      responses: {
        create: async (request: any, options?: any) => {
          const context = service.users.getStore();
          if (!context) throw new Error("ai_provider_required");
          if (!context.provider || !context.model)
            throw new Error("analysis_provider_required");
          const route = service.client(
            context.userId,
            context.provider,
            context.model,
          );
          try {
            if (route.provider === "openai") {
              const routedRequest = {
                ...request,
                model: route.model,
              };
              if (
                !context.thinkingLevel &&
                !service.supportsAnyThinkingLevel(route.provider, route.model)
              )
                delete routedRequest.reasoning;
              return await route.client.responses.create(
                {
                  ...routedRequest,
                  ...(context.thinkingLevel &&
                  service.supportsThinkingLevel(
                    route.provider,
                    route.model,
                    context.thinkingLevel,
                  )
                    ? {
                        reasoning: {
                          ...(request.reasoning ?? {}),
                          effort: context.thinkingLevel,
                        },
                      }
                    : {}),
                },
                options,
              );
            }

            const inputMessages =
              typeof request.input === "string"
                ? [{ role: "user", content: request.input }]
                : (request.input ?? [])
                    .filter(
                      (message: any) =>
                        message?.type === "message" ||
                        ["system", "developer", "user", "assistant"].includes(
                          message?.role,
                        ),
                    )
                    .map((message: any) => ({
                      role:
                        message.role === "developer"
                          ? "system"
                          : (message.role ?? "user"),
                      content:
                        typeof message.content === "string"
                          ? message.content
                          : (message.content ?? [])
                              .filter((item: any) => item.type === "input_text")
                              .map((item: any) => item.text)
                              .join("\n"),
                    }))
                    .filter((message: any) => message.content);
            const messages = [
              ...(request.instructions
                ? [{ role: "system", content: request.instructions }]
                : []),
              ...inputMessages,
            ];
            const format = request.text?.format;
            const completion = await route.client.chat.completions.create(
              {
                model: route.model,
                messages,
                ...(context.thinkingLevel &&
                service.supportsThinkingLevel(
                  route.provider,
                  route.model,
                  context.thinkingLevel,
                )
                  ? { reasoning_effort: context.thinkingLevel }
                  : {}),
                ...(request.stream ? { stream: true } : {}),
                ...(context.diagnostic &&
                typeof request.max_output_tokens === "number"
                  ? { max_completion_tokens: request.max_output_tokens }
                  : {}),
                ...(format?.type === "json_schema"
                  ? {
                      response_format: {
                        type: "json_schema" as const,
                        json_schema: {
                          name: format.name,
                          strict: format.strict ?? true,
                          schema: format.schema,
                        },
                      },
                    }
                  : {}),
              },
              options,
            );
            if (request.stream) {
              return (async function* () {
                let finishReason: string | null = null;
                if (
                  completion &&
                  typeof (completion as any)[Symbol.asyncIterator] ===
                    "function"
                ) {
                  for await (const chunk of completion as any) {
                    const delta = chunk.choices?.[0]?.delta?.content;
                    const chunkFinishReason =
                      chunk.choices?.[0]?.finish_reason;
                    if (typeof chunkFinishReason === "string")
                      finishReason = chunkFinishReason;
                    if (typeof delta === "string" && delta)
                      yield {
                        type: "response.output_text.delta",
                        delta,
                      };
                  }
                  if (context.diagnostic)
                    yield finishReason === "stop"
                      ? {
                          type: "response.completed",
                          response: { status: "completed" },
                        }
                      : {
                          type: "response.incomplete",
                          response: { status: "incomplete" },
                        };
                  return;
                }
                const output =
                  (completion as any).choices?.[0]?.message?.content ?? "";
                const directFinishReason =
                  (completion as any).choices?.[0]?.finish_reason;
                if (output)
                  yield { type: "response.output_text.delta", delta: output };
                if (context.diagnostic)
                  yield directFinishReason === "stop"
                    ? {
                        type: "response.completed",
                        response: { status: "completed" },
                      }
                    : {
                        type: "response.incomplete",
                        response: { status: "incomplete" },
                      };
              })();
            }
            const finishReason = (completion as any).choices?.[0]?.finish_reason;
            return {
              output_text:
                (completion as any).choices?.[0]?.message?.content ?? "",
              ...(context.diagnostic
                ? {
                    status:
                      finishReason === "stop" ? "completed" : "incomplete",
                  }
                : {}),
            };
          } catch (error) {
            if (
              !context.diagnostic &&
              ((error as { status?: number }).status === 401 ||
                (error as { status?: number }).status === 403)
            )
              service.store.markAiProviderAttention(
                context.userId,
                route.provider,
              );
            throw error;
          }
        },
      },
    } as unknown as OpenAI;
  }

  async verifyAndSave(userId: string, provider: AiProviderId, apiKey: string) {
    const key = apiKey.trim();
    if (!key) throw new Error("invalid_api_key");
    const response = await fetch(`${definitions[provider].baseURL}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw new Error("invalid_api_key");
      throw new Error("provider_unavailable");
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(key, "utf8"),
      cipher.final(),
    ]);
    const encryptedPayload = Buffer.concat([
      iv,
      cipher.getAuthTag(),
      encrypted,
    ]).toString("base64url");
    const payload = `v1.${this.encryptionKeyId}.${encryptedPayload}`;
    const keyHint = `${key.slice(0, 5)}…${key.slice(-4)}`;
    this.store.saveAiProviderConnection(userId, provider, payload, keyHint);
    return this.settings(userId);
  }

  remove(userId: string, provider: AiProviderId) {
    this.store.deleteAiProviderConnection(userId, provider);
    return this.settings(userId);
  }

  saveConfiguration(
    userId: string,
    provider: AiProviderId,
    configuration: ProviderConfigurationInput,
  ) {
    if (
      this.store.aiProviderConnection(userId, provider)?.status !== "verified"
    )
      throw new Error("provider_not_connected");
    if (
      configuration.transcriptionModel !== null &&
      !this.isTranscriptionModel(provider, configuration.transcriptionModel)
    )
      throw new Error("invalid_transcription_configuration");
    if (
      configuration.analysisModel !== null &&
      !this.isAnalysisModel(provider, configuration.analysisModel)
    )
      throw new Error("invalid_analysis_configuration");
    if (
      !this.supportsThinkingLevel(
        provider,
        configuration.analysisModel,
        configuration.thinkingLevel,
      )
    )
      throw new Error("invalid_thinking_level");
    this.store.saveAiProviderConfiguration(userId, provider, configuration);
    return this.settings(userId);
  }

  saveSelections(
    userId: string,
    selections: {
      transcription?:
        { provider: "openai"; model?: string | undefined } | null | undefined;
      analysis?:
        | {
            provider: AiProviderId;
            model?: string | undefined;
            thinkingLevel?: ThinkingLevel | null | undefined;
          }
        | null
        | undefined;
    },
  ) {
    const current = this.store.aiTaskSelections(userId);
    const next = { ...current };
    if (selections.transcription !== undefined) {
      if (selections.transcription === null) {
        next.transcriptionProvider = null;
        next.transcriptionModel = null;
      } else {
        this.assertVerifiedProvider(userId, selections.transcription.provider);
        const model =
          selections.transcription.model ??
          this.legacyConfiguration(userId, selections.transcription.provider)
            ?.transcriptionModel;
        if (
          !model ||
          !this.isTranscriptionModel(selections.transcription.provider, model)
        )
          throw new Error("invalid_model_selection");
        next.transcriptionProvider = "openai";
        next.transcriptionModel = model;
      }
    }
    if (selections.analysis !== undefined) {
      if (selections.analysis === null) {
        next.analysisProvider = null;
        next.analysisModel = null;
        next.analysisThinkingLevel = null;
      } else {
        this.assertVerifiedProvider(userId, selections.analysis.provider);
        const configuration = this.legacyConfiguration(
          userId,
          selections.analysis.provider,
        );
        const model = selections.analysis.model ?? configuration?.analysisModel;
        const thinkingLevel =
          selections.analysis.thinkingLevel === undefined
            ? (configuration?.thinkingLevel ?? null)
            : selections.analysis.thinkingLevel;
        if (
          !model ||
          !this.isAnalysisModel(selections.analysis.provider, model)
        )
          throw new Error("invalid_model_selection");
        if (
          !this.supportsThinkingLevel(
            selections.analysis.provider,
            model,
            thinkingLevel,
          )
        )
          throw new Error("invalid_thinking_level");
        next.analysisProvider = selections.analysis.provider;
        next.analysisModel = model;
        next.analysisThinkingLevel = thinkingLevel;
      }
    }
    this.store.saveAiTaskSelections(userId, next);
    return this.settings(userId);
  }

  async testConnection(
    userId: string,
    task: AiDiagnosticTask,
    audio?: AiDiagnosticAudio,
  ): Promise<AiDiagnosticResult> {
    const startedAt = Date.now();
    const selection = this.diagnosticSelection(userId, task);
    const result = (code: AiDiagnosticResult["code"]): AiDiagnosticResult => ({
      ok: code === "ok",
      code,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      selection,
    });
    if (!selection) return result("missing_selection");

    const admission = this.startDiagnostic(userId);
    if (admission !== "ok") return result(admission);
    try {
      await this.withDiagnosticTimeout(async (signal) => {
        if (task === "transcription") {
          const decoded = this.decodeDiagnosticAudio(audio);
          const route = this.client(userId, selection.provider, selection.model);
          const response = await route.client.audio.transcriptions.create(
            {
              file: await OpenAI.toFile(
                decoded.bytes,
                `connection-test.${decoded.extension}`,
                { type: decoded.contentType },
              ),
              model: selection.model,
              response_format: "json",
            },
            { signal, maxRetries: 0 },
          );
          if (!response.text.trim())
            throw new DiagnosticFailure("invalid_response");
          return;
        }

        if (task === "analysis") {
          const response = await this.runStructuredDiagnostic(
            userId,
            selection,
            signal,
          );
          if (
            (response.status !== undefined && response.status !== "completed") ||
            !response.output_text.trim()
          )
            throw new DiagnosticFailure("invalid_response");
          let parsed: unknown;
          try {
            parsed = JSON.parse(response.output_text);
          } catch {
            throw new DiagnosticFailure("invalid_response");
          }
          if (
            !parsed ||
            typeof parsed !== "object" ||
            (parsed as { ok?: unknown }).ok !== true
          )
            throw new DiagnosticFailure("invalid_response");
          return;
        }

        const stream = await this.runStreamingDiagnostic(
          userId,
          selection,
          signal,
        );
        let receivedText = false;
        let completed = false;
        for await (const event of stream) {
          if (
            event.type === "response.output_text.delta" &&
            typeof event.delta === "string" &&
            event.delta.trim().length > 0
          )
            receivedText = true;
          if (event.type === "response.completed") {
            if (event.response.status !== "completed")
              throw new DiagnosticFailure("invalid_response");
            completed = true;
          }
          if (
            event.type === "error" ||
            event.type === "response.failed" ||
            event.type === "response.incomplete"
          )
            throw new DiagnosticFailure("invalid_response");
        }
        if (!receivedText || !completed)
          throw new DiagnosticFailure("invalid_response");
      });
      return result("ok");
    } catch (error) {
      return result(this.diagnosticFailureCode(error));
    } finally {
      this.finishDiagnostic(userId);
    }
  }

  private runStructuredDiagnostic(
    userId: string,
    selection: AiDiagnosticSelection,
    signal: AbortSignal,
  ) {
    return this.users.run(
      {
        userId,
        provider: selection.provider,
        model: selection.model,
        ...(selection.thinkingLevel
          ? { thinkingLevel: selection.thinkingLevel }
          : {}),
        diagnostic: true,
      },
      () =>
        this.routedClient().responses.create(
          {
            model: selection.model,
            store: false,
            max_output_tokens: 2048,
            instructions:
              "This is a connection diagnostic. Return only the requested structured result. Do not use tools or external data.",
            input: "Return the diagnostic result now.",
            text: {
              format: {
                type: "json_schema",
                name: "connection_diagnostic",
                strict: true,
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["ok"],
                  properties: { ok: { type: "boolean", enum: [true] } },
                },
              },
            },
          },
          { signal, maxRetries: 0 },
        ),
    );
  }

  private runStreamingDiagnostic(
    userId: string,
    selection: AiDiagnosticSelection,
    signal: AbortSignal,
  ) {
    return this.users.run(
      {
        userId,
        provider: selection.provider,
        model: selection.model,
        ...(selection.thinkingLevel
          ? { thinkingLevel: selection.thinkingLevel }
          : {}),
        diagnostic: true,
      },
      () =>
        this.routedClient().responses.create(
          {
            model: selection.model,
            store: false,
            max_output_tokens: 2048,
            instructions:
              "This is a connection diagnostic. Reply with exactly diagnostic-ok and nothing else.",
            input: "Run the harmless streaming connection diagnostic now.",
            stream: true,
          },
          { signal, maxRetries: 0 },
        ),
    );
  }

  client(
    userId: string,
    expectedProvider?: AiProviderId,
    expectedModel?: string,
  ) {
    const connection = this.store.aiProviderConnectionSecret(
      userId,
      expectedProvider,
    );
    if (!connection || connection.status !== "verified")
      throw new Error("ai_provider_required");
    if (expectedProvider && connection.provider !== expectedProvider)
      throw new Error("ai_provider_changed");
    const parts = connection.encryptedPayload.split(".");
    const encoded = parts[0] === "v1" ? parts[2]! : connection.encryptedPayload;
    const candidates =
      parts[0] === "v1"
        ? [this.decryptionKeys.get(parts[1]!)].filter((key): key is Buffer =>
            Boolean(key),
          )
        : [...this.decryptionKeys.values()];
    let apiKey: string | null = null;
    const raw = Buffer.from(encoded, "base64url");
    for (const key of candidates) {
      try {
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key,
          raw.subarray(0, 12),
        );
        decipher.setAuthTag(raw.subarray(12, 28));
        apiKey = Buffer.concat([
          decipher.update(raw.subarray(28)),
          decipher.final(),
        ]).toString("utf8");
        break;
      } catch {
        // Try the next configured historical key.
      }
    }
    if (!apiKey) throw new Error("ai_credentials_unreadable");
    const provider = connection.provider as AiProviderId;
    const model = expectedModel ?? this.analysisOptions(provider)[0]!.model;
    if (
      !this.isAnalysisModel(provider, model) &&
      !this.isTranscriptionModel(provider, model)
    )
      throw new Error("model_unavailable");
    return {
      provider: connection.provider as AiProviderId,
      model,
      client: new OpenAI({
        apiKey,
        ...(connection.provider === "cerebras"
          ? { baseURL: definitions.cerebras.baseURL }
          : {}),
      }),
    };
  }

  private transcriptionModels(provider: AiProviderId) {
    if (provider !== "openai") return [];
    return [
      ...new Set([
        this.config.transcriptionModel,
        "gpt-4o-mini-transcribe",
        "gpt-4o-transcribe",
      ]),
    ];
  }

  private analysisOptions(provider: AiProviderId) {
    if (provider === "cerebras")
      return [
        {
          model: this.config.cerebrasAnalysisModel,
          thinkingLevels: [] as ThinkingLevel[],
        },
      ];
    return [...new Set([this.config.analysisModel, "gpt-5-mini", "gpt-5"])].map(
      (model) => ({
        model,
        thinkingLevels:
          model === "gpt-5-mini" || model === "gpt-5"
            ? [...thinkingLevels]
            : [],
      }),
    );
  }

  private isTranscriptionModel(provider: AiProviderId, model: string) {
    return this.transcriptionModels(provider).includes(model);
  }

  private isAnalysisModel(provider: AiProviderId, model: string) {
    return this.analysisOptions(provider).some(
      (option) => option.model === model,
    );
  }

  private supportsThinkingLevel(
    provider: AiProviderId,
    model: string | null,
    thinkingLevel: ThinkingLevel | null,
  ) {
    if (thinkingLevel === null) return true;
    return Boolean(
      model &&
      this.analysisOptions(provider)
        .find((option) => option.model === model)
        ?.thinkingLevels.includes(thinkingLevel),
    );
  }

  private supportsAnyThinkingLevel(provider: AiProviderId, model: string) {
    return this.analysisOptions(provider).some(
      (option) => option.model === model && option.thinkingLevels.length > 0,
    );
  }

  private assertVerifiedProvider(userId: string, provider: AiProviderId) {
    if (
      this.store.aiProviderConnection(userId, provider)?.status !== "verified"
    )
      throw new Error("invalid_provider_selection");
  }

  private legacyConfiguration(userId: string, provider: AiProviderId) {
    return this.store.aiProviderConfiguration(userId, provider);
  }

  private upgradeLegacySelections(userId: string) {
    const selected = this.store.aiTaskSelections(userId);
    const next = { ...selected };
    let changed = false;
    if (
      selected.transcriptionProvider === "openai" &&
      selected.transcriptionModel === null &&
      this.store.aiProviderConnection(userId, "openai")?.status === "verified"
    ) {
      const model =
        this.legacyConfiguration(userId, "openai")?.transcriptionModel ??
        this.config.transcriptionModel;
      if (this.isTranscriptionModel("openai", model)) {
        next.transcriptionModel = model;
        changed = true;
      }
    }
    if (
      selected.analysisProvider &&
      selected.analysisModel === null &&
      this.store.aiProviderConnection(userId, selected.analysisProvider)
        ?.status === "verified"
    ) {
      const provider = selected.analysisProvider;
      const configuration = this.legacyConfiguration(userId, provider);
      const model =
        configuration?.analysisModel ?? this.analysisOptions(provider)[0]!.model;
      if (this.isAnalysisModel(provider, model)) {
        next.analysisModel = model;
        next.analysisThinkingLevel = this.supportsThinkingLevel(
          provider,
          model,
          configuration?.thinkingLevel ?? null,
        )
          ? (configuration?.thinkingLevel ?? null)
          : null;
        changed = true;
      }
    }
    if (changed) this.store.saveAiTaskSelections(userId, next);
  }

  private diagnosticSelection(
    userId: string,
    task: AiDiagnosticTask,
  ): AiDiagnosticSelection | null {
    const settings = this.settings(userId).selections;
    if (task === "transcription")
      return settings.transcription
        ? { ...settings.transcription, thinkingLevel: null }
        : null;
    return settings.analysis ? { ...settings.analysis } : null;
  }

  private startDiagnostic(userId: string): "ok" | "rate_limited" | "busy" {
    const now = Date.now();
    const state = this.diagnosticRuns.get(userId) ?? {
      active: false,
      attempts: [],
    };
    state.attempts = state.attempts.filter(
      (attempt) => attempt > now - 60_000,
    );
    if (state.active) return "busy";
    if (state.attempts.length >= diagnosticAttemptsPerMinute)
      return "rate_limited";
    state.active = true;
    state.attempts.push(now);
    this.diagnosticRuns.set(userId, state);
    return "ok";
  }

  private finishDiagnostic(userId: string) {
    const state = this.diagnosticRuns.get(userId);
    if (state) state.active = false;
  }

  private async withDiagnosticTimeout<T>(
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, diagnosticTimeoutMs);
    try {
      return await action(controller.signal);
    } catch (error) {
      if (timedOut) throw new DiagnosticFailure("timeout");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private decodeDiagnosticAudio(audio: AiDiagnosticAudio | undefined) {
    if (!audio) throw new DiagnosticFailure("invalid_audio");
    const extension = diagnosticAudioTypes[
      audio.contentType as keyof typeof diagnosticAudioTypes
    ];
    if (!extension) throw new DiagnosticFailure("unsupported_audio");
    if (
      !audio.base64 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        audio.base64,
      )
    )
      throw new DiagnosticFailure("invalid_audio_data");
    const bytes = Buffer.from(audio.base64, "base64");
    if (
      !bytes.length ||
      bytes.length > diagnosticAudioLimitBytes ||
      bytes.toString("base64") !== audio.base64 ||
      !this.matchesDiagnosticAudioType(audio.contentType, bytes)
    )
      throw new DiagnosticFailure("invalid_audio_data");
    return { bytes, extension, contentType: audio.contentType };
  }

  private matchesDiagnosticAudioType(contentType: string, bytes: Buffer) {
    if (contentType === "audio/wav")
      return (
        bytes.length >= 12 &&
        bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        bytes.subarray(8, 12).toString("ascii") === "WAVE"
      );
    if (contentType === "audio/ogg")
      return bytes.subarray(0, 4).toString("ascii") === "OggS";
    if (contentType === "audio/webm")
      return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (contentType === "audio/mp4")
      return bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp";
    return (
      bytes.subarray(0, 3).toString("ascii") === "ID3" ||
      (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
    );
  }

  private diagnosticFailureCode(
    error: unknown,
  ): Exclude<AiDiagnosticResult["code"], "ok" | "busy"> {
    if (error instanceof DiagnosticFailure) return error.code;
    const details = error as {
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
      message?: unknown;
    };
    const status =
      typeof details.status === "number"
        ? details.status
        : typeof details.statusCode === "number"
          ? details.statusCode
          : null;
    const code = typeof details.code === "string" ? details.code.toLowerCase() : "";
    const message =
      typeof details.message === "string" ? details.message.toLowerCase() : "";
    if (status === 401 || status === 403 || code === "invalid_api_key")
      return "credential_error";
    if (code === "insufficient_quota" || /\b(quota|billing)\b/.test(message))
      return "quota_exceeded";
    if (status === 429) return "rate_limited";
    if (
      status === 404 ||
      /\b(model_not_found|unsupported_model|model_unavailable)\b/.test(code) ||
      /\bmodel\b.*\b(not found|unavailable|unsupported|does not exist)\b/.test(
        message,
      )
    )
      return "model_error";
    if (
      (error instanceof Error && error.name === "AbortError") ||
      /\b(timeout|timed out)\b/.test(message)
    )
      return "timeout";
    return "provider_error";
  }
}

export async function createStructuredCompletion(input: {
  provider: AiProviderId;
  client: OpenAI;
  model: string;
  instructions: string;
  content: string;
  name: string;
  schema: Record<string, unknown>;
}) {
  if (input.provider === "openai") {
    const response = await input.client.responses.create({
      model: input.model,
      instructions: input.instructions,
      input: input.content,
      text: {
        format: {
          type: "json_schema",
          name: input.name,
          strict: true,
          schema: input.schema,
        },
      },
    });
    return response.output_text;
  }
  const response = await input.client.chat.completions.create({
    model: input.model,
    messages: [
      { role: "system", content: input.instructions },
      { role: "user", content: input.content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: input.name, strict: true, schema: input.schema },
    },
  });
  return response.choices[0]?.message.content ?? "";
}
