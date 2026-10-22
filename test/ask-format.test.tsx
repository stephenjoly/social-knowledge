import { describe, expect, it } from "vitest";
import {
  answerWithCaptureLinks,
  conversationTimeLabel,
  latestSources,
  safeSourceUrl,
  sourceAttribution,
  suggestionsFrom,
  thumbTint,
} from "../web/pages/ask-format";
import { invitationTokenFrom } from "../web/pages/auth";
import type { AskSource, ChatMessage } from "../web/shared/types";

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
