import type {
  AiProvider,
  AiProviderState,
  AiThinkingLevel,
  AskSelection,
  AskSource,
  ChatMessage,
} from "../shared/types.js";

export type CaptureFacets = {
  categories: Array<{ label: string; kind: string; count: number }>;
  topics: Array<{ label: string; count: number }>;
};

/** Rewrites `[n]` and `[captureId]` citations into `capture:` links the renderer resolves. */
export function answerWithCaptureLinks(content: string, sources: AskSource[]) {
  const sourcesByCitation = new Map(
    sources.map((source) => [source.citation, source]),
  );
  let normalized = content;
  let replacedCaptureId = false;
  for (const source of sources) {
    const captureCitation = `[${source.id}]`;
    if (normalized.includes(captureCitation)) {
      normalized = normalized.replaceAll(
        captureCitation,
        `[${source.citation}]`,
      );
      replacedCaptureId = true;
    }
  }
  if (replacedCaptureId)
    normalized = normalized.replace(/\n{2,}Sources:\s*(?:\[\d+]\s*)+$/i, "");
  return normalized.replace(/\[(\d+)]/g, (citation, value: string) => {
    const source = sourcesByCitation.get(Number(value));
    return source ? `[${value}](capture:${source.id})` : citation;
  });
}

const fallbackSuggestions = [
  "What are the most useful things I've saved?",
  "Which recommendations came up more than once?",
  "What places have I saved?",
  "Which products have creators recommended?",
];

const shortLabel = (label: string) => label.trim().slice(0, 60);

/** Four prompts built from the account's own categories and topics. */
export function suggestionsFrom(facets: CaptureFacets | null): string[] {
  if (!facets) return fallbackSuggestions;
  const byCount = <T extends { count: number }>(items: T[]) =>
    [...items].sort((a, b) => b.count - a.count);
  const subcategories = byCount(
    facets.categories.filter((category) => category.kind === "subcategory"),
  );
  const domains = byCount(
    facets.categories.filter((category) => category.kind === "domain"),
  );
  const topics = byCount(facets.topics);
  const prompts: string[] = [];
  const add = (prompt: string | null) => {
    if (prompt && !prompts.includes(prompt)) prompts.push(prompt);
  };
  const subcategory = subcategories[0] ?? domains[0];
  add(
    subcategory
      ? `Summarise my saved ${shortLabel(subcategory.label)} recommendations`
      : null,
  );
  add(
    topics[0] ? `What did I save about ${shortLabel(topics[0].label)}?` : null,
  );
  const domain = domains.find((item) => item.label !== subcategory?.label);
  add(
    domain
      ? `What are the key takeaways from my ${shortLabel(domain.label)} saves?`
      : null,
  );
  add(
    topics[1]
      ? `Which ${shortLabel(topics[1].label)} tips came up more than once?`
      : null,
  );
  for (const fallback of fallbackSuggestions) {
    if (prompts.length >= 4) break;
    add(fallback);
  }
  return prompts.slice(0, 4);
}

const dayMs = 24 * 60 * 60 * 1000;

/** `Today`, `Yesterday`, a weekday within the last week, then `12 Oct`. */
export function conversationTimeLabel(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const startOfDay = (input: Date) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / dayMs);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)
    return new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(date);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}

/** The cited posts behind the most recent answer that used any. */
export function latestSources(messages: ChatMessage[] | undefined) {
  for (const message of [...(messages ?? [])].reverse())
    if (message.role === "assistant" && message.sources.length)
      return message.sources;
  return [];
}

export function platformName(platform: string) {
  const trimmed = platform.trim();
  return trimmed
    ? `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1).toLowerCase()}`
    : "Saved post";
}

export function sourceAttribution(
  source: Pick<AskSource, "creator" | "platform">,
  sourceType?: string,
) {
  const platform = `${platformName(source.platform)}${
    sourceType === "video" ? " reel" : ""
  }`;
  const creator = source.creator?.trim().replace(/^@/, "");
  return creator ? `@${creator} · ${platform}` : platform;
}

/** Only http(s) URLs are rendered as links to the original post. */
export function safeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const thumbTints = [
  "#f1e6d6",
  "#efe3d9",
  "#e3e8ef",
  "#e3ebe5",
  "#f0e1e1",
  "#e6e9df",
];

/** The placeholder tint for a source without a stored thumbnail, by citation number. */
export function thumbTint(citation: number) {
  const index = Math.max(0, Math.trunc(citation) - 1) % thumbTints.length;
  return thumbTints[index]!;
}

/** What a failed or stopped answer offers next. */
export type AskRecovery = "retry" | "rephrase" | "new-chat" | "setup";

export type AskFailure = { text: string; actions: AskRecovery[] };

const askFailureCopy: Record<string, AskFailure> = {
  cancelled: {
    text: "You stopped this answer before it finished.",
    actions: ["retry"],
  },
  timeout: {
    text: "This answer took too long and was stopped. Retry, or ask a narrower question.",
    actions: ["retry", "rephrase"],
  },
  invalid_citation: {
    text: "This answer’s citations couldn’t be verified against your archive. Retry to get a checked answer.",
    actions: ["retry"],
  },
  planner_error: {
    text: "Ask couldn’t work out how to search your archive for this question. Try rephrasing it.",
    actions: ["rephrase", "retry"],
  },
  context_limit: {
    text: "This conversation is too long to continue. Start a new chat, or ask a shorter question.",
    actions: ["new-chat", "rephrase"],
  },
  provider_error: {
    text: "The AI provider didn’t finish this answer. Retry, and check AI & models if it keeps failing.",
    actions: ["retry", "setup"],
  },
  connection_lost: {
    text: "The connection dropped before this answer finished. Check your connection, then retry.",
    actions: ["retry"],
  },
  conversation_busy: {
    text: "This conversation is already answering in another tab. Wait for it to finish, then retry.",
    actions: ["retry"],
  },
  analysis_provider_required: {
    text: "Ask needs a connected analysis model before it can answer.",
    actions: ["setup", "retry"],
  },
};
/** A Map of own entries, so codes like `constructor` or `__proto__` never match. */
const askFailures = new Map<string, AskFailure>([
  ...Object.entries(askFailureCopy),
  ["ai_provider_required", askFailureCopy.analysis_provider_required!],
]);
const genericFailure: AskFailure = {
  text: "Ask AI couldn’t finish this answer.",
  actions: ["retry"],
};

/**
 * Plain-language reason and recovery for a failed or stopped answer, keyed by
 * its stored error code. Unknown codes fall back to generic copy so server or
 * provider text is never shown.
 */
export function askFailure(
  errorCode: string | null | undefined,
  status: string,
): AskFailure {
  const known = errorCode ? askFailures.get(errorCode) : undefined;
  if (known) return known;
  return status === "cancelled"
    ? askFailures.get("cancelled")!
    : genericFailure;
}

/** The question an answer responds to: its linked message, else the one before it. */
export function questionFor(
  messages: ChatMessage[] | undefined,
  answer: ChatMessage,
) {
  const all = messages ?? [];
  const linked = answer.userMessageId
    ? all.find((message) => message.id === answer.userMessageId)
    : undefined;
  if (linked) return linked;
  const index = all.findIndex((message) => message.id === answer.id);
  for (let at = index - 1; at >= 0; at -= 1)
    if (all[at]!.role === "user") return all[at]!;
  return null;
}

export type SourcePanelState = {
  /** The answer whose sources the panel lists, or null before any answer. */
  answer: ChatMessage | null;
  /** True when that answer is the latest one in the thread. */
  isLatest: boolean;
  /** The nearest answer before the bound one that cited saved posts. */
  earlierCited: ChatMessage | null;
};

/**
 * Binds the sources panel to one answer: the chosen one, else the latest.
 * An uncited answer never inherits another answer's sources; it can only
 * point to the nearest cited answer that came before it.
 */
export function sourcePanelFor(
  messages: ChatMessage[] | undefined,
  selectedId: string | null,
): SourcePanelState {
  const answers = (messages ?? []).filter(
    (message) => message.role === "assistant",
  );
  const latest = answers[answers.length - 1] ?? null;
  const answer =
    (selectedId && answers.find((message) => message.id === selectedId)) ||
    latest;
  const position = answer ? answers.indexOf(answer) : -1;
  const earlierCited =
    answer && !answer.sources.length
      ? (answers
          .slice(0, position)
          .reverse()
          .find((message) => message.sources.length) ?? null)
      : null;
  return { answer, isLatest: answer === latest, earlierCited };
}

/** Shortens a question for a one-line label. */
export function questionExcerpt(text: string, limit = 80) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat;
}

/**
 * Keeps one citation chip per point: every linked citation on a line moves to
 * the end of that line, once per source. Code blocks and table rows are left
 * alone because moving text inside them would change their meaning.
 */
export function citationsPerPoint(markdown: string) {
  const citation = /[ \t]*\[(\d+)]\(capture:([^)\s]+)\)/g;
  let fenced = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced || /^\s*\|/.test(line)) return line;
      const found = [...line.matchAll(citation)];
      if (!found.length) return line;
      const seen = new Set<string>();
      const chips: string[] = [];
      for (const [, number, id] of found) {
        if (seen.has(id!)) continue;
        seen.add(id!);
        chips.push(`[${number}](capture:${id})`);
      }
      const text = line
        .replace(citation, "")
        .replace(/[ \t]+([.,;:!?)])/g, "$1")
        .trimEnd();
      return `${text} ${chips.join(" ")}`;
    })
    .join("\n");
}

const thinkingNames: Record<AiThinkingLevel, string> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function thinkingName(level: AiThinkingLevel) {
  return thinkingNames[level];
}

/** A readable name for a provider model id, e.g. `gpt-5-mini` → `GPT-5 mini`. */
export function modelLabel(model: string) {
  const parts = model.trim().split("-").filter(Boolean);
  if (!parts.length) return model;
  const word = (part: string) =>
    /^\d+(\.\d+)?[bmk]$/i.test(part) ? part.toUpperCase() : part;
  if (parts[0]!.toLowerCase() === "gpt") {
    const [, family, ...rest] = parts;
    return [`GPT${family ? `-${family}` : ""}`, ...rest.map(word)].join(" ");
  }
  const [first, ...rest] = parts;
  return [
    `${first!.slice(0, 1).toUpperCase()}${first!.slice(1)}`,
    ...rest.map(word),
  ].join(" ");
}

export type AskModelOption = {
  provider: AiProvider["id"];
  providerName: string;
  model: string;
  thinkingLevels: AiThinkingLevel[];
};

/** Analysis models of connected providers, in provider order. */
export function askModelOptions(
  state: AiProviderState | null,
): AskModelOption[] {
  if (!state) return [];
  return state.providers
    .filter((provider) => provider.connected && provider.capabilities.analysis)
    .flatMap((provider) => {
      const options = provider.taskOptions?.analysis?.length
        ? provider.taskOptions.analysis
        : provider.models.analysis.map((model) => ({
            model,
            thinkingLevels: [] as AiThinkingLevel[],
          }));
      return options.map((option) => ({
        provider: provider.id,
        providerName: provider.name,
        model: option.model,
        thinkingLevels: option.thinkingLevels ?? [],
      }));
    });
}

export function sameSelection(
  a: AskSelection | null | undefined,
  b: AskSelection | null | undefined,
) {
  return Boolean(
    a &&
    b &&
    a.provider === b.provider &&
    a.model === b.model &&
    (a.thinkingLevel ?? null) === (b.thinkingLevel ?? null),
  );
}

export function sameModel(
  a: Pick<AskSelection, "provider" | "model"> | null | undefined,
  b: Pick<AskSelection, "provider" | "model"> | null | undefined,
) {
  return Boolean(a && b && a.provider === b.provider && a.model === b.model);
}

/**
 * A selection is usable when its provider is connected and offers that model.
 * A null thinking level means the provider's default and is always allowed;
 * an explicit level the model does not offer is rejected, as the server does
 * (including any level for a model without thinking levels).
 */
export function usableSelection(
  selection: AskSelection | null | undefined,
  options: AskModelOption[],
): AskSelection | null {
  if (!selection) return null;
  const option = options.find((item) => sameModel(item, selection));
  if (!option) return null;
  const thinkingLevel = selection.thinkingLevel ?? null;
  if (thinkingLevel === null) return { ...selection, thinkingLevel: null };
  return option.thinkingLevels.includes(thinkingLevel) ? selection : null;
}

/** The model the next answer uses: this chat's choice, else Ask default, else Analysis. */
export function resolveAskSelection(
  chat: AskSelection | null | undefined,
  state: AiProviderState | null,
) {
  const options = askModelOptions(state);
  return (
    usableSelection(chat, options) ??
    usableSelection(state?.selections.ask, options) ??
    usableSelection(state?.selections.analysis, options)
  );
}

/** The default new chats start on: Ask default, else Analysis. */
export function defaultAskSelection(state: AiProviderState | null) {
  return resolveAskSelection(null, state);
}

/** Picks a thinking level for a newly chosen model, keeping the current one when allowed. */
export function selectionFor(
  option: AskModelOption,
  current: AskSelection | null,
  fallback: AskSelection | null,
): AskSelection {
  const levels = option.thinkingLevels;
  if (!levels.length)
    return {
      provider: option.provider,
      model: option.model,
      thinkingLevel: null,
    };
  // Keep the default's own level for its model, including null (provider default).
  if (fallback && sameModel(fallback, option)) {
    const level = fallback.thinkingLevel ?? null;
    if (level === null || levels.includes(level))
      return {
        provider: option.provider,
        model: option.model,
        thinkingLevel: level,
      };
  }
  const pick = (level: AiThinkingLevel | null | undefined) =>
    level && levels.includes(level) ? level : null;
  const thinkingLevel =
    pick(current?.thinkingLevel) ?? pick("medium") ?? levels[0]!;
  return { provider: option.provider, model: option.model, thinkingLevel };
}

/** `14:02` for an answer's time. */
export function answerTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

/** The meta line parts for a stored answer; the model only when it was recorded. */
export function answerMeta(message: ChatMessage) {
  const parts: string[] = [];
  const count = message.sources.length;
  if (count) parts.push(`${count} saved ${count === 1 ? "post" : "posts"}`);
  const time = answerTime(message.createdAt);
  if (time) parts.push(time);
  const model = message.model
    ? `${modelLabel(message.model)}${message.thinkingLevel ? ` · ${thinkingName(message.thinkingLevel)}` : ""}`
    : null;
  return { model, parts };
}
