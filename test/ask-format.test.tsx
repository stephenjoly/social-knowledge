import { describe, expect, it } from "vitest";
import {
  answerWithCaptureLinks,
  answerMeta,
  askModelOptions,
  conversationTimeLabel,
  defaultAskSelection,
  latestSources,
  resolveAskSelection,
  safeSourceUrl,
  selectionFor,
  sourceAttribution,
  suggestionsFrom,
  thumbTint,
  usableSelection,
} from "../web/pages/ask-format";
import { invitationTokenFrom } from "../web/pages/auth";
import type { AiProvider, AiProviderState, AskSelection, AskSource, ChatMessage } from "../web/shared/types";

const source = (citation: number, id = `capture-${citation}`): AskSource => ({
  id,
  citation,
  title: `Saved post ${citation}`,
  creator: "lisbonfoodie",
  platform: "instagram",
  synopsis: "",
  sourceUrl: "https://www.instagram.com/reel/example/",
  breadcrumb: ["Travel", "Lisbon"],
});

const message = (
  role: ChatMessage["role"],
  sources: AskSource[] = [],
): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content: "",
  sources,
  sufficient: null,
  provider: null,
  model: null,
  thinkingLevel: null,
  status: "complete",
  errorCode: null,
  retryOf: null,
  userMessageId: null,
  createdAt: new Date().toISOString(),
});

describe("Ask model selection contract", () => {
  const analysis: AskSelection = { provider: "openai", model: "gpt-5-mini", thinkingLevel: null };
  const askDefault: AskSelection = { provider: "openai", model: "gpt-5", thinkingLevel: null };
  const cerebras: AskSelection = { provider: "cerebras", model: "qwen-3.8-27b", thinkingLevel: null };
  const provider = (id: AiProvider["id"]): AiProvider => {
    const options = id === "openai"
      ? [{ model: "gpt-5-mini", thinkingLevels: ["low", "medium"] as const }, { model: "gpt-5", thinkingLevels: ["low", "medium", "high"] as const }]
      : [{ model: "qwen-3.8-27b", thinkingLevels: [] as const }];
    return {
      id, name: id, docsUrl: "https://example.test/models", connected: true,
      status: "verified", keyHint: null, verifiedAt: null, supportsVision: false,
      capabilities: { transcription: id === "openai", analysis: true },
      models: { transcription: [], analysis: options.map((option) => option.model) },
      taskOptions: { transcription: [], analysis: options.map((option) => ({ ...option, thinkingLevels: [...option.thinkingLevels] })) },
    };
  };
  const state = (ask: AskSelection | null = null): AiProviderState => ({
    providers: [provider("openai"), provider("cerebras")],
    selections: { transcription: null, analysis, ask },
    readiness: { capture: false, ask: true },
  });

  it("keeps a historical null-thinking Analysis selection usable as the new-chat default", () => {
    const settings = state();
    expect(usableSelection(analysis, askModelOptions(settings))).toEqual(analysis);
    expect(defaultAskSelection(settings)).toEqual(analysis);
    expect(resolveAskSelection(null, settings)).toEqual(analysis);
  });

  it("preserves null-thinking chat > Ask default > Analysis priority", () => {
    const settings = state(askDefault);
    const chat = { ...analysis, model: "gpt-5-mini" };
    expect(defaultAskSelection(settings)).toEqual(askDefault);
    expect(resolveAskSelection(chat, settings)).toEqual(chat);
    expect(resolveAskSelection(null, settings)).toEqual(askDefault);
    expect(resolveAskSelection(null, state())).toEqual(analysis);
  });

  it("rejects explicit unsupported levels and falls through rather than normalizing them", () => {
    const settings = state(askDefault);
    const options = askModelOptions(settings);
    const invalidChat = { ...analysis, thinkingLevel: "high" as const };
    const invalidNoThinking = { ...cerebras, thinkingLevel: "high" as const };
    expect(usableSelection(invalidChat, options)).toBeNull();
    expect(usableSelection(invalidNoThinking, options)).toBeNull();
    expect(usableSelection({ ...analysis, thinkingLevel: "low" }, options)).toEqual({ ...analysis, thinkingLevel: "low" });
    expect(usableSelection(cerebras, options)).toEqual(cerebras);
    expect(resolveAskSelection(invalidChat, settings)).toEqual(askDefault);
    settings.selections.ask = invalidNoThinking;
    expect(defaultAskSelection(settings)).toEqual(analysis);
    expect(resolveAskSelection(invalidNoThinking, settings)).toEqual(analysis);
  });

  it("falls back from unknown models and disconnected providers, or returns no usable selection", () => {
    const settings = state(askDefault);
    const unknown = { ...analysis, model: "unknown-model" };
    expect(usableSelection(unknown, askModelOptions(settings))).toBeNull();
    expect(resolveAskSelection(unknown, settings)).toEqual(askDefault);
    settings.selections.ask = unknown;
    expect(defaultAskSelection(settings)).toEqual(analysis);
    settings.providers[0]!.connected = false;
    settings.selections.ask = askDefault;
    settings.selections.analysis = cerebras;
    expect(usableSelection(analysis, askModelOptions(settings))).toBeNull();
    expect(resolveAskSelection(analysis, settings)).toEqual(cerebras);
    settings.providers[1]!.connected = false;
    expect(resolveAskSelection(analysis, settings)).toBeNull();
    expect(resolveAskSelection(analysis, null)).toBeNull();
  });

  it("keeps provider-default thinking when choosing the default's own model", () => {
    const options = askModelOptions(state());
    expect(selectionFor(options[0]!, { ...analysis, thinkingLevel: "low" }, analysis)).toEqual(analysis);
    expect(selectionFor(options[2]!, { ...analysis, thinkingLevel: "low" }, null)).toEqual(cerebras);
  });

  it("renders a null-thinking answer model without inventing a thinking level", () => {
    const answer = { ...message("assistant"), ...analysis };
    expect(answerMeta(answer).model).toBe("GPT-5 mini");
  });
});

describe("answerWithCaptureLinks", () => {
  it("links known citation numbers and leaves unknown ones as text", () => {
    expect(answerWithCaptureLinks("Go early. [1] Or [4].", [source(1)])).toBe(
      "Go early. [1](capture:capture-1) Or [4].",
    );
  });

  it("rewrites capture-id citations and drops the trailing sources line", () => {
    expect(
      answerWithCaptureLinks("Go early [capture-1].\n\nSources: [1]", [
        source(1),
      ]),
    ).toBe("Go early [1](capture:capture-1).");
  });
});

describe("suggestionsFrom", () => {
  it("builds four prompts from the account's categories and topics", () => {
    expect(
      suggestionsFrom({
        categories: [
          { label: "Travel", kind: "domain", count: 4 },
          { label: "Health", kind: "domain", count: 2 },
          { label: "Lisbon", kind: "subcategory", count: 3 },
        ],
        topics: [
          { label: "restaurants", count: 3 },
          { label: "endurance", count: 1 },
        ],
      }),
    ).toEqual([
      "Summarise my saved Lisbon recommendations",
      "What did I save about restaurants?",
      "What are the key takeaways from my Travel saves?",
      "Which endurance tips came up more than once?",
    ]);
  });

  it("falls back to generic prompts for an empty archive", () => {
    const prompts = suggestionsFrom({ categories: [], topics: [] });
    expect(prompts).toHaveLength(4);
    expect(new Set(prompts).size).toBe(4);
    expect(suggestionsFrom(null)).toEqual(prompts);
  });
});

describe("conversationTimeLabel", () => {
  const now = new Date(2026, 9, 18, 15, 0);
  it("reads as today, yesterday, a weekday, then a date", () => {
    expect(conversationTimeLabel(new Date(2026, 9, 18, 9).toISOString(), now)).toBe("Today");
    expect(conversationTimeLabel(new Date(2026, 9, 17, 23).toISOString(), now)).toBe("Yesterday");
    expect(conversationTimeLabel(new Date(2026, 9, 13, 12).toISOString(), now)).toBe("Tuesday");
    expect(conversationTimeLabel(new Date(2026, 9, 9, 12).toISOString(), now)).toBe("9 Oct");
    expect(conversationTimeLabel(new Date(2025, 9, 9, 12).toISOString(), now)).toBe("9 Oct 2025");
    expect(conversationTimeLabel("not a date", now)).toBe("");
  });
});

describe("source helpers", () => {
  it("uses the sources of the latest answer that cited any", () => {
    const cited = [source(1), source(2)];
    expect(
      latestSources([
        message("user"),
        message("assistant", cited),
        message("user"),
        message("assistant"),
      ]),
    ).toBe(cited);
    expect(latestSources(undefined)).toEqual([]);
  });

  it("attributes the creator and platform", () => {
    expect(sourceAttribution(source(1), "video")).toBe(
      "@lisbonfoodie · Instagram reel",
    );
    expect(sourceAttribution({ creator: null, platform: "facebook" })).toBe(
      "Facebook",
    );
  });

  it("only links http and https originals", () => {
    expect(safeSourceUrl("https://www.instagram.com/reel/a/")).toBe(
      "https://www.instagram.com/reel/a/",
    );
    expect(safeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(safeSourceUrl("not a url")).toBeNull();
  });

  it("assigns placeholder tints by citation number", () => {
    expect(thumbTint(1)).toBe("#f1e6d6");
    expect(thumbTint(7)).toBe(thumbTint(1));
  });
});

describe("invitationTokenFrom", () => {
  const token = "A".repeat(43);
  it("reads the token from a pasted invitation link or a bare token", () => {
    expect(invitationTokenFrom(`https://example.test/#invite=${token}`)).toBe(
      token,
    );
    expect(invitationTokenFrom(`  ${token}  `)).toBe(token);
  });

  it("rejects links without a plausible token", () => {
    expect(invitationTokenFrom("https://example.test/")).toBeNull();
    expect(invitationTokenFrom("https://example.test/#invite=short")).toBeNull();
    expect(invitationTokenFrom("")).toBeNull();
  });
});
