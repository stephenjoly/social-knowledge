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

type ProviderConfigurationInput = {
  transcriptionModel: string | null;
  analysisModel: string | null;
  thinkingLevel: ThinkingLevel | null;
};

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
  }>();
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
    this.upgradeLegacyConfiguration(userId);
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
                if (
                  completion &&
                  typeof (completion as any)[Symbol.asyncIterator] ===
                    "function"
                ) {
                  for await (const chunk of completion as any) {
                    const delta = chunk.choices?.[0]?.delta?.content;
                    if (typeof delta === "string" && delta)
                      yield {
                        type: "response.output_text.delta",
                        delta,
                      };
                  }
                  return;
                }
                const output =
                  (completion as any).choices?.[0]?.message?.content ?? "";
                if (output)
                  yield { type: "response.output_text.delta", delta: output };
              })();
            }
            return {
              output_text:
                (completion as any).choices?.[0]?.message?.content ?? "",
            };
          } catch (error) {
            if (
              (error as { status?: number }).status === 401 ||
              (error as { status?: number }).status === 403
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
        const configuration = this.assignmentConfiguration(
          userId,
          selections.transcription.provider,
        );
        if (!configuration.transcriptionModel)
          throw new Error("provider_configuration_required");
        if (
          selections.transcription.model !== undefined &&
          selections.transcription.model !== configuration.transcriptionModel
        )
          throw new Error("provider_configuration_mismatch");
        next.transcriptionProvider = "openai";
        next.transcriptionModel = configuration.transcriptionModel;
      }
    }
    if (selections.analysis !== undefined) {
      if (selections.analysis === null) {
        next.analysisProvider = null;
        next.analysisModel = null;
        next.analysisThinkingLevel = null;
      } else {
        const configuration = this.assignmentConfiguration(
          userId,
          selections.analysis.provider,
        );
        if (!configuration.analysisModel)
          throw new Error("provider_configuration_required");
        if (
          selections.analysis.model !== undefined &&
          selections.analysis.model !== configuration.analysisModel
        )
          throw new Error("provider_configuration_mismatch");
        if (
          selections.analysis.thinkingLevel !== undefined &&
          selections.analysis.thinkingLevel !== configuration.thinkingLevel
        )
          throw new Error("provider_configuration_mismatch");
        next.analysisProvider = selections.analysis.provider;
        next.analysisModel = configuration.analysisModel;
        next.analysisThinkingLevel = configuration.thinkingLevel;
      }
    }
    this.store.saveAiTaskSelections(userId, next);
    return this.settings(userId);
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

  private assignmentConfiguration(userId: string, provider: AiProviderId) {
    if (
      this.store.aiProviderConnection(userId, provider)?.status !== "verified"
    )
      throw new Error("invalid_provider_selection");
    const configuration = this.store.aiProviderConfiguration(userId, provider);
    if (!configuration) throw new Error("provider_configuration_required");
    return configuration;
  }

  private upgradeLegacyConfiguration(userId: string) {
    const selected = this.store.aiTaskSelections(userId);
    for (const provider of aiProviderIds) {
      if (
        this.store.aiProviderConnection(userId, provider)?.status !== "verified"
      )
        continue;
      const hasTranscription =
        provider === "openai" && selected.transcriptionProvider === provider;
      const hasAnalysis = selected.analysisProvider === provider;
      if (!hasTranscription && !hasAnalysis) continue;
      const configuration = this.store.aiProviderConfiguration(
        userId,
        provider,
      );
      const transcriptionModel = hasTranscription
        ? (selected.transcriptionModel ?? this.config.transcriptionModel)
        : (configuration?.transcriptionModel ?? null);
      const analysisModel = hasAnalysis
        ? (selected.analysisModel ?? this.analysisOptions(provider)[0]!.model)
        : (configuration?.analysisModel ?? null);
      const thinkingLevel = hasAnalysis
        ? (selected.analysisThinkingLevel ?? null)
        : (configuration?.thinkingLevel ?? null);
      if (
        !configuration ||
        (hasTranscription && configuration.transcriptionModel === null) ||
        (hasAnalysis && configuration.analysisModel === null)
      )
        this.store.saveAiProviderConfiguration(userId, provider, {
          transcriptionModel,
          analysisModel,
          thinkingLevel,
        });
    }
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
