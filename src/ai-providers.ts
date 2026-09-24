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
        transcription: id === "openai" ? [this.config.transcriptionModel] : [],
        analysis: [
          id === "openai"
            ? this.config.analysisModel
            : this.config.cerebrasAnalysisModel,
        ],
      },
      connected: connections.some(
        (connection) => connection.provider === id && connection.status === "verified",
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
      (selected.transcriptionModel === null ||
        selected.transcriptionModel === this.config.transcriptionModel) &&
      verified("openai")
        ? {
            provider: "openai" as const,
            model: selected.transcriptionModel ?? this.config.transcriptionModel,
          }
        : null;
    const analysis =
      selected.analysisProvider &&
      (selected.analysisModel === null ||
        selected.analysisModel === this.analysisModel(selected.analysisProvider)) &&
      verified(selected.analysisProvider)
        ? {
            provider: selected.analysisProvider as AiProviderId,
            model:
              selected.analysisModel ??
              this.analysisModel(selected.analysisProvider as AiProviderId),
          }
        : null;
    return {
      providers: this.list(userId),
      selections: { transcription, analysis },
      readiness: { capture: Boolean(transcription && analysis), ask: Boolean(analysis) },
    };
  }

  configured(userId: string) {
    return this.settings(userId).readiness.ask;
  }

  captureSelections(userId: string) {
    const settings = this.settings(userId);
    if (!settings.selections.transcription) throw new Error("transcription_required");
    if (!settings.selections.analysis) throw new Error("analysis_provider_required");
    return {
      transcriptionProvider: settings.selections.transcription.provider,
      transcriptionModel: settings.selections.transcription.model,
      analysisProvider: settings.selections.analysis.provider,
      analysisModel: settings.selections.analysis.model,
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
  ): T {
    const analysis = this.settings(userId).selections.analysis;
    const selectedProvider = provider ?? analysis?.provider;
    const selectedModel = model ?? analysis?.model;
    return this.users.run(
      {
        userId,
        ...(selectedProvider ? { provider: selectedProvider } : {}),
        ...(selectedModel ? { model: selectedModel } : {}),
      },
      action,
    );
  }

  enterUser(userId: string, provider?: AiProviderId | null, model?: string | null) {
    this.users.enterWith({
      userId,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
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
            if (route.provider === "openai")
              return await route.client.responses.create(
                { ...request, model: route.model },
                options,
              );

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
              service.store.markAiProviderAttention(context.userId, route.provider);
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
    const models = (await response.json().catch(() => null)) as {
      data?: Array<{ id?: string }>;
    } | null;
    const requiredModels =
      provider === "cerebras"
        ? [this.config.cerebrasAnalysisModel]
        : [this.config.transcriptionModel, this.config.analysisModel];
    if (
      Array.isArray(models?.data) &&
      requiredModels.some(
        (requiredModel) => !models.data!.some((model) => model.id === requiredModel),
      )
    )
      throw new Error("model_unavailable");
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
    const current = this.store.aiTaskSelections(userId);
    this.store.saveAiTaskSelections(userId, {
      transcriptionProvider:
        current.transcriptionProvider ?? (provider === "openai" ? "openai" : null),
      transcriptionModel:
        current.transcriptionModel ??
        (provider === "openai" ? this.config.transcriptionModel : null),
      analysisProvider: current.analysisProvider ?? provider,
      analysisModel: current.analysisModel ?? this.analysisModel(provider),
    });
    return this.settings(userId);
  }

  remove(userId: string, provider: AiProviderId) {
    this.store.deleteAiProviderConnection(userId, provider);
    return this.settings(userId);
  }

  saveSelections(userId: string, selections: {
    transcription?: { provider: "openai"; model: string } | null | undefined;
    analysis?: { provider: AiProviderId; model: string } | null | undefined;
  }) {
    const current = this.store.aiTaskSelections(userId);
    const next = {
      transcriptionProvider:
        selections.transcription === undefined
          ? current.transcriptionProvider
          : selections.transcription?.provider ?? null,
      transcriptionModel:
        selections.transcription === undefined
          ? current.transcriptionModel
          : selections.transcription?.model ?? null,
      analysisProvider:
        selections.analysis === undefined
          ? current.analysisProvider
          : selections.analysis?.provider ?? null,
      analysisModel:
        selections.analysis === undefined
          ? current.analysisModel
          : selections.analysis?.model ?? null,
    };
    if (
      next.transcriptionProvider !== null &&
      (next.transcriptionProvider !== "openai" ||
        next.transcriptionModel !== this.config.transcriptionModel ||
        this.store.aiProviderConnection(userId, "openai")?.status !== "verified")
    )
      throw new Error("invalid_transcription_selection");
    if (
      next.analysisProvider !== null &&
      (next.analysisModel !== this.analysisModel(next.analysisProvider as AiProviderId) ||
        this.store.aiProviderConnection(userId, next.analysisProvider)?.status !== "verified")
    )
      throw new Error("invalid_analysis_selection");
    this.store.saveAiTaskSelections(userId, next);
    return this.settings(userId);
  }

  client(userId: string, expectedProvider?: AiProviderId, expectedModel?: string) {
    const connection = this.store.aiProviderConnectionSecret(userId, expectedProvider);
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
    const model = expectedModel ?? this.analysisModel(provider);
    if (
      model !== this.analysisModel(provider) &&
      !(provider === "openai" && model === this.config.transcriptionModel)
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

  private analysisModel(provider: AiProviderId) {
    return provider === "cerebras"
      ? this.config.cerebrasAnalysisModel
      : this.config.analysisModel;
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
