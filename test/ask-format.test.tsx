import { describe, expect, it } from "vitest";
import {
  answerWithCaptureLinks,
  answerMeta,
  askModelOptions,
  conversationTimeLabel,
  defaultAskSelection,
  latestSources,
  modelLabel,
  resolveAskSelection,
  safeSourceUrl,
  selectionFor,
  sourceAttribution,
  suggestionsFrom,
  suggestionMaxLength,
  thumbTint,
  usableSelection,
} from "../web/pages/ask-format";
import { analysisModelNote } from "../web/shared/format";
import { invitationTokenFrom } from "../web/pages/auth";
import type { AiProvider, AiProviderState, AskSelection, AskSource, ChatMessage } from "../web/shared/types";

it.each([
  ["gpt-6-luna", "GPT-6 Luna", "Efficient"],
  ["gpt-6.1-sol", "GPT-6.1 Sol", "Balanced"],
  ["gpt-6-astra", "GPT-6 Astra", "Highest capability"],
  ["gpt-5-mini", "GPT-5 mini", "Previous generation"],
  ["gpt-5", "GPT-5", "Previous generation"],
  ["qwen-3.8-27b", "Qwen 3.8 27B", "Reasoning"],
])("labels %s consistently with its catalog note", (model, label, note) => {
  expect(modelLabel(model)).toBe(label);
  expect(analysisModelNote(model)).toBe(note);
});

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
  const analysis: AskSelection = { provider: "openai", model: "gpt-6-luna", thinkingLevel: null };
  const askDefault: AskSelection = { provider: "openai", model: "gpt-6.1-sol", thinkingLevel: null };
  const cerebras: AskSelection = { provider: "cerebras", model: "qwen-3.8-27b", thinkingLevel: null };
  const provider = (id: AiProvider["id"]): AiProvider => {
    const options = id === "openai"
      ? [{ model: "gpt-6-luna", thinkingLevels: ["low", "medium", "high"] as const }, { model: "gpt-6.1-sol", thinkingLevels: ["low", "medium", "high"] as const }]
      : [{ model: "qwen-3.8-27b", thinkingLevels: ["low", "medium", "high"] as const }];
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
    const chat = { ...analysis, model: "gpt-6-luna" };
    expect(defaultAskSelection(settings)).toEqual(askDefault);
    expect(resolveAskSelection(chat, settings)).toEqual(chat);
    expect(resolveAskSelection(null, settings)).toEqual(askDefault);
    expect(resolveAskSelection(null, state())).toEqual(analysis);
  });

  it("rejects explicit unsupported levels and falls through rather than normalizing them", () => {
    const settings = state(askDefault);
    const options = askModelOptions(settings);
    const invalidChat = { ...analysis, thinkingLevel: "minimal" as const };
    const invalidQwen = { ...cerebras, thinkingLevel: "minimal" as const };
    expect(usableSelection(invalidChat, options)).toBeNull();
    expect(usableSelection(invalidQwen, options)).toBeNull();
    expect(usableSelection({ ...analysis, thinkingLevel: "low" }, options)).toEqual({ ...analysis, thinkingLevel: "low" });
    expect(usableSelection(cerebras, options)).toEqual(cerebras);
    expect(resolveAskSelection(invalidChat, settings)).toEqual(askDefault);
    settings.selections.ask = invalidQwen;
    expect(defaultAskSelection(settings)).toEqual(analysis);
    expect(resolveAskSelection(invalidQwen, settings)).toEqual(analysis);
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
    expect(selectionFor(options[2]!, { ...analysis, thinkingLevel: "low" }, null)).toEqual({ ...cerebras, thinkingLevel: "low" });
    expect(selectionFor(options[2]!, analysis, cerebras)).toEqual(cerebras);
  });

  it("renders a null-thinking answer model without inventing a thinking level", () => {
    const answer = { ...message("assistant"), ...analysis };
    expect(answerMeta(answer).model).toBe("GPT-6 Luna");
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
  it("builds three short prompts with category attribution from the account's facets", () => {
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
      { text: "Summarise my travel saves", category: "Travel" },
      { text: "Lisbon I saved this month", category: "Lisbon" },
      { text: "What I saved about restaurants", category: null },
    ]);
  });

  it("falls back to generic prompts for an empty archive", () => {
    const prompts = suggestionsFrom({ categories: [], topics: [] });
    expect(prompts).toEqual([
      { text: "Summarise my recent saves", category: null },
      { text: "Compare themes in my saves", category: null },
      { text: "Find useful takeaways", category: null },
    ]);
    expect(new Set(prompts.map((prompt) => prompt.text)).size).toBe(3);
    expect(suggestionsFrom(null)).toEqual(prompts);
  });

  it("fills sparse leadership facets with neutral prompts without inventing travel or repetition", () => {
    const prompts = suggestionsFrom({ categories: [], topics: [{ label: "Leadership", count: 3 }] });
    expect(prompts).toEqual([
      { text: "What I saved about leadership", category: null },
      { text: "Summarise my recent saves", category: null },
      { text: "Compare themes in my saves", category: null },
    ]);
    expect(prompts.every((prompt) => prompt.category === null)).toBe(true);
    expect(prompts.map((prompt) => prompt.text).join(" ")).not.toMatch(/travel|places|more than once|repeated|duplicate/i);
    expect(prompts.every((prompt) => prompt.text.length <= suggestionMaxLength)).toBe(true);
  });
  it("drops oversized chips while keeping one short prompt per available kind", () => {
    const prompts = suggestionsFrom({
      categories: [
        { label: "Health & Wellness", kind: "domain", count: 5 },
        { label: "Food & Drink", kind: "domain", count: 3 },
        { label: "Clothing & Accessories", kind: "subcategory", count: 9 },
        { label: "Recipes", kind: "subcategory", count: 3 },
        { label: "Other", kind: "domain", count: 100 },
      ],
      topics: [{ label: "Leadership", count: 4 }],
    });
    expect(prompts).toEqual([
      { text: "Summarise my wellness saves", category: "Health & Wellness" },
      { text: "Recipes I saved this month", category: "Recipes" },
      { text: "What I saved about leadership", category: null },
    ]);
    expect(prompts.every((prompt) => prompt.text.length <= suggestionMaxLength)).toBe(true);
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
