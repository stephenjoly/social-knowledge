import path from "node:path";
import { z } from "zod";

const booleanFromEnv = z
  .string()
  .optional()
  .transform(
    (value) =>
      value === undefined ||
      ["1", "true", "yes", "on"].includes(value.toLowerCase()),
  );

const optionalUrl = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().url().optional(),
);
const optionalSecret = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(32).optional(),
);

const schema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LOG_LEVEL: z.string().default("info"),
  DATA_DIR: z.string().default("./data"),
  VAULT_DIR: z.string().default("./data/vault"),
  MEDIA_DIR: z.string().default("./data/media"),
  UI_DIR: z.string().default("./dist-ui"),
  API_TOKEN: z.string().min(24),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  OPENAI_ANALYSIS_MODEL: z.string().default("gpt-5-mini"),
  CEREBRAS_ANALYSIS_MODEL: z.string().default("qwen-3.8-27b"),
  COOKIES_FILE: z.string().optional(),
  FACEBOOK_COOKIES_FILE: z.string().optional(),
  INSTAGRAM_COOKIES_FILE: z.string().optional(),
  PLATFORM_CREDENTIALS_KEY: z.string().min(32).optional(),
  AI_CREDENTIALS_KEY: optionalSecret,
  AI_CREDENTIALS_PREVIOUS_KEYS: z.string().default(""),
  ASK_CONTEXT_BUDGET_TOKENS: z.coerce.number().int().min(8000).default(24000),
  ASK_COMPACTION_THRESHOLD: z.coerce.number().min(0.4).max(0.9).default(0.7),
  FACEBOOK_IMPERSONATE: z.string().default("chrome-99"),
  BOOTSTRAP_ADMIN_USERNAME: z.string().default("demo"),
  BOOTSTRAP_ADMIN_PASSWORD_HASH: z.string().optional(),
  SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  APP_URL: z.string().url().default("http://localhost:8787"),
  TRUSTED_PROXIES: z.string().default(""),
  NTFY_URL: optionalUrl,
  NTFY_TOPIC: z.string().optional(),
  NTFY_TOKEN: z.string().optional(),
  FETCH_COMMENTS: booleanFromEnv,
  MAX_DURATION_SECONDS: z.coerce.number().int().positive().default(1800),
  MAX_DOWNLOAD_BYTES: z.coerce.number().int().positive().default(524_288_000),
  WORKER_POLL_MS: z.coerce.number().int().min(250).default(2000),
  MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.parse(env);
  const dataDir = path.resolve(parsed.DATA_DIR);

  return {
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    dataDir,
    vaultDir: path.resolve(parsed.VAULT_DIR),
    mediaDir: path.resolve(parsed.MEDIA_DIR),
    uiDir: path.resolve(parsed.UI_DIR),
    databasePath: path.join(dataDir, "social-knowledge.sqlite3"),
    workDir: path.join(dataDir, "work"),
    exportDir: path.join(dataDir, "exports"),
    apiToken: parsed.API_TOKEN,
    openAiApiKey: parsed.OPENAI_API_KEY,
    transcriptionModel: parsed.OPENAI_TRANSCRIPTION_MODEL,
    analysisModel: parsed.OPENAI_ANALYSIS_MODEL,
    cerebrasAnalysisModel: parsed.CEREBRAS_ANALYSIS_MODEL,
    facebookCookiesFile:
      parsed.FACEBOOK_COOKIES_FILE || parsed.COOKIES_FILE
        ? path.resolve(
            parsed.FACEBOOK_COOKIES_FILE || parsed.COOKIES_FILE || "",
          )
        : undefined,
    instagramCookiesFile: parsed.INSTAGRAM_COOKIES_FILE
      ? path.resolve(parsed.INSTAGRAM_COOKIES_FILE)
      : undefined,
    platformCredentialsKey: parsed.PLATFORM_CREDENTIALS_KEY ?? parsed.API_TOKEN,
    aiCredentialsKey:
      parsed.AI_CREDENTIALS_KEY ??
      parsed.PLATFORM_CREDENTIALS_KEY ??
      parsed.API_TOKEN,
    aiCredentialsPreviousKeys: parsed.AI_CREDENTIALS_PREVIOUS_KEYS.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    askContextBudgetTokens: parsed.ASK_CONTEXT_BUDGET_TOKENS,
    askCompactionThreshold: parsed.ASK_COMPACTION_THRESHOLD,
    facebookImpersonate: parsed.FACEBOOK_IMPERSONATE.trim() || undefined,
    bootstrapAdminUsername: parsed.BOOTSTRAP_ADMIN_USERNAME,
    bootstrapAdminPasswordHash: parsed.BOOTSTRAP_ADMIN_PASSWORD_HASH,
    sessionDays: parsed.SESSION_DAYS,
    appUrl: parsed.APP_URL.replace(/\/$/, ""),
    trustedProxies: parsed.TRUSTED_PROXIES.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    ntfyUrl: parsed.NTFY_URL?.replace(/\/$/, ""),
    ntfyTopic: parsed.NTFY_TOPIC,
    ntfyToken: parsed.NTFY_TOKEN,
    fetchComments: parsed.FETCH_COMMENTS,
    maxDurationSeconds: parsed.MAX_DURATION_SECONDS,
    maxDownloadBytes: parsed.MAX_DOWNLOAD_BYTES,
    workerPollMs: parsed.WORKER_POLL_MS,
    maxAttempts: parsed.MAX_ATTEMPTS,
  };
}
