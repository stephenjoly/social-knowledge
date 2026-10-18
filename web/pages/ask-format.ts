import type { AskSource, ChatMessage } from "../shared/types";

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
  add(topics[0] ? `What did I save about ${shortLabel(topics[0].label)}?` : null);
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
