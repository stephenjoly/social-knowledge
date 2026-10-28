import { describe, expect, it } from "vitest";
import { aiTestSelection, matchesCurrentTestSelection } from "../web/pages/settings";
import type { AiAnalysisSelection, AiProviderState, AiTestResult } from "../web/shared/types";

const analysis: AiAnalysisSelection = { provider: "openai", model: "analysis-model", thinkingLevel: "high" };
const ask: AiAnalysisSelection = { provider: "cerebras", model: "ask-model", thinkingLevel: null };
function state(selections: Partial<AiProviderState["selections"]> = {}): AiProviderState {
  return {
    providers: [],
    selections: { transcription: null, analysis, ask, ...selections },
    readiness: { capture: false, ask: true },
  };
}
function passed(selection: AiTestResult["selection"]): AiTestResult {
  return { ok: true, code: "ok", checkedAt: "2026-10-23T12:00:00Z", durationMs: 10, selection };
}

describe("saved diagnostic selections", () => {
  it("allows Ask-only assignments without an Analysis prerequisite", () => {
    expect(aiTestSelection("ask", state({ analysis: null }))).toEqual(ask);
    expect(matchesCurrentTestSelection("ask", state({ analysis: null }), passed(ask))).toBe(true);
  });

  it("accepts the saved Ask result when Ask and Analysis differ", () => {
    expect(aiTestSelection("ask", state())).toEqual(ask);
    expect(matchesCurrentTestSelection("ask", state(), passed(ask))).toBe(true);
    expect(matchesCurrentTestSelection("ask", state(), passed(analysis))).toBe(false);
  });

  it("falls back to Analysis only when Ask is unset", () => {
    expect(aiTestSelection("ask", state({ ask: null }))).toEqual(analysis);
    expect(matchesCurrentTestSelection("ask", state({ ask: null }), passed(analysis))).toBe(true);
    expect(aiTestSelection("ask", state({ ask: null, analysis: null }))).toBeNull();
    expect(aiTestSelection("ask", null)).toBeUndefined();
  });

  it.each([
    { ...ask, provider: "openai" as const },
    { ...ask, model: "changed-model" },
    { ...ask, thinkingLevel: "low" as const },
  ])("rejects stale Ask results after saved selection changes: %j", (changed) => {
    expect(matchesCurrentTestSelection("ask", state({ ask: changed }), passed(ask))).toBe(false);
  });

  it("keeps transcription and Analysis diagnostics on their own selections", () => {
    const transcription = { provider: "openai" as const, model: "audio-model" };
    const current = state({ transcription });
    expect(aiTestSelection("transcription", current)).toEqual(transcription);
    expect(aiTestSelection("analysis", current)).toEqual(analysis);
    expect(matchesCurrentTestSelection("transcription", current, passed(transcription))).toBe(true);
    expect(matchesCurrentTestSelection("analysis", current, passed(analysis))).toBe(true);
    expect(matchesCurrentTestSelection("analysis", current, passed(ask))).toBe(false);
    expect(matchesCurrentTestSelection("ask", current, passed(null))).toBe(false);
  });
});
