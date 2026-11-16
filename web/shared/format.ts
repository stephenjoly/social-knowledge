import type { AiThinkingLevel, AiProvider } from "./types.js";

export function platformFor(url: string) {
  return url.includes("instagram.com") ? "instagram" : "facebook";
}

export function formatPreciseDuration(durationMs: number | null) {
  if (durationMs === null) return "pending";
  if (durationMs < 1000) return `${durationMs} ms`;
  if (durationMs < 60000) {
    const seconds = durationMs / 1000;
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`;
  }
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function transcriptionOptions(provider: AiProvider) {
  return provider.taskOptions?.transcription?.length
    ? provider.taskOptions.transcription
    : provider.models.transcription.map((model) => ({ model }));
}

export function analysisOptions(provider: AiProvider) {
  return provider.taskOptions?.analysis?.length
    ? provider.taskOptions.analysis
    : provider.models.analysis.map((model) => ({
        model,
        thinkingLevels: [] as AiThinkingLevel[],
      }));
}

/** Approved one-line notes for shipped analysis models; unknown ids get none. */
const analysisModelNotes: Record<string, string> = {
  "gpt-6-luna": "Efficient",
  "gpt-6.1-sol": "Balanced",
  "gpt-6-astra": "Highest capability",
  "gpt-5-mini": "Previous generation",
  "gpt-5": "Previous generation",
  "qwen-3.8-27b": "Reasoning",
};

export function analysisModelNote(model: string): string | null {
  return Object.hasOwn(analysisModelNotes, model)
    ? analysisModelNotes[model]!
    : null;
}

/** Official names for models whose ids do not format into them. */
const analysisModelLabels: Record<string, string> = {
  "gpt-6-luna": "GPT-6 Luna",
  "gpt-6.1-sol": "GPT-6.1 Sol",
  "gpt-6-astra": "GPT-6 Astra",
};

export function analysisModelLabel(model: string): string | null {
  return Object.hasOwn(analysisModelLabels, model)
    ? analysisModelLabels[model]!
    : null;
}
