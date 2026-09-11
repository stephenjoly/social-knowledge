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
  private readonly users = new AsyncLocalStorage<string>();
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
    const active = this.store.aiProviderConnection(userId);
    return aiProviderIds.map((id) => ({
      ...definitions[id],
      connected: active?.provider === id && active.status === "verified",
      active: active?.provider === id,
      status: active?.provider === id ? active.status : "not_connected",
      keyHint: active?.provider === id ? active.keyHint : null,
      verifiedAt: active?.provider === id ? active.verifiedAt : null,
    }));
  }

  configured(userId: string) {
    return this.store.aiProviderConnection(userId)?.status === "verified";
  }

  activeProvider(userId: string): AiProviderId | null {
    const connection = this.store.aiProviderConnection(userId);
    return connection?.status === "verified"
      ? (connection.provider as AiProviderId)
      : null;
  }

  runForUser<T>(
    userId: string,
    action: () => T,
    provider?: AiProviderId | null,
  ): T {
    return this.users.run(`${userId}:${provider ?? ""}`, action);
  }

  enterUser(userId: string) {
    this.users.enterWith(userId);
  }

  /** An OpenAI-shaped generation client so existing generation stages remain provider-agnostic. */
  routedClient(): OpenAI {
    const service = this;
    return {
      responses: {
        create: async (request: any, options?: any) => {
          const context = service.users.getStore();
          if (!context) throw new Error("ai_provider_required");
          const separator = context.lastIndexOf(":");
          const userId = separator < 0 ? context : context.slice(0, separator);
          const boundProvider =
            separator < 0
              ? null
              : (context.slice(separator + 1) as AiProviderId);
          const route = service.client(userId, boundProvider || undefined);
          try {
            if (route.provider === "openai")
              return await route.client.responses.create(
                { ...request, model: route.model },
                options,
              );

            const content =
              typeof request.input === "string"
                ? request.input
                : (request.input ?? [])
                    .flatMap((message: any) =>
                      (Array.isArray(message.content) ? message.content : [])
                        .filter((item: any) => item.type === "input_text")
                        .map((item: any) => item.text),
                    )
                    .join("\n");
            const format = request.text?.format;
            const completion = await route.client.chat.completions.create(
              {
                model: route.model,
                messages: [
                  { role: "system", content: request.instructions ?? "" },
                  { role: "user", content },
                ],
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
            const output = completion.choices[0]?.message.content ?? "";
            if (request.stream) {
              return (async function* () {
                yield { type: "response.output_text.delta", delta: output };
              })();
            }
            return { output_text: output };
          } catch (error) {
            if (
              (error as { status?: number }).status === 401 ||
              (error as { status?: number }).status === 403
            )
              service.store.markAiProviderAttention(userId, route.provider);
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
    const requiredModel =
      provider === "cerebras"
        ? this.config.cerebrasAnalysisModel
        : this.config.analysisModel;
    if (
      Array.isArray(models?.data) &&
      !models.data.some((model) => model.id === requiredModel)
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
    return this.list(userId);
  }

  remove(userId: string) {
    return this.store.deleteAiProviderConnection(userId);
  }

  client(userId: string, expectedProvider?: AiProviderId) {
    const connection = this.store.aiProviderConnectionSecret(userId);
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
    return {
      provider: connection.provider as AiProviderId,
      model:
        connection.provider === "cerebras"
          ? this.config.cerebrasAnalysisModel
          : this.config.analysisModel,
      client: new OpenAI({
        apiKey,
        ...(connection.provider === "cerebras"
          ? { baseURL: definitions.cerebras.baseURL }
          : {}),
      }),
    };
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
