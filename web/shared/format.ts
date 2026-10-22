import type { AiThinkingLevel, AiProvider } from "./types";

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
  "gpt-5-mini": "Balanced",
  "gpt-5": "Most thorough, slower",
  "qwen-3.8-27b": "Fastest, no thinking",
};

export function analysisModelNote(model: string): string | null {
  return Object.hasOwn(analysisModelNotes, model)
    ? analysisModelNotes[model]!
    : null;
}
