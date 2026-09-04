import { afterEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { AskService, extractAnswer } from "../src/ask.js";
import { JobStore } from "../src/db.js";
import { testConfig } from "./helpers.js";

describe("AskService", () => {
  const stores: JobStore[] = [];
  afterEach(() => stores.splice(0).forEach((store) => store.close()));
  it("retrieves saved knowledge and persists a cited answer", async () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const user = store.createUser("demo", "hash");
    const { job } = store.createOrGet({
      ownerUserId: user.id,
      sourceUrl: "https://instagram.com/reel/lisbon",
      normalizedUrl: "https://instagram.com/reel/lisbon",
      sourceHash: "lisbon",
    });
    const capture = store.createCapture({
      job,
      sourceType: "video",
      sourceId: "lisbon",
      platform: "instagram",
      title: "Seven Lisbon restaurants",
      creator: "guide",
      creatorUrl: null,
      description: "Restaurants for a Lisbon trip",
      transcript: "Try Rio de Mello for grilled chicken.",
      sourceLanguage: "en",
      translatedTranscript: null,
      translationLanguage: null,
      comments: [],
      analysis: {
        title: "Seven Lisbon restaurants",
        synopsis: "A Lisbon restaurant shortlist.",
        whyUseful: "A practical food itinerary.",
        takeaways: ["Rio de Mello serves grilled chicken."],
        topics: ["Lisbon", "restaurants"],
        entities: [],
        recommendations: [],
        claimsNeedingVerification: [],
        evidence: [],
        classification: {
          primaryDomain: "Travel",
          country: "Portugal",
          city: "Lisbon",
          subcategory: "Restaurants",
          secondaryTopics: ["food"],
          confidence: 0.95,
        },
      },
      publishedAt: null,
      durationSeconds: 20,
      notePath: "Social Knowledge/Captures/instagram-lisbon.md",
      assets: [],
    })!;
    store.assignClassification(capture.id, capture.analysis.classification);
    const conversation = store.createConversation(user.id)!;
    const payload = JSON.stringify({
      answer: "Rio de Mello is one saved option [1].",
      citedCaptureIds: [capture.id],
      sufficient: true,
    });
    const create = vi.fn(async (_request: Record<string, unknown>) =>
      (async function* () {
        for (const delta of [payload.slice(0, 25), payload.slice(25)])
          yield { type: "response.output_text.delta", delta };
      })(),
    );
    const turn = store.beginConversationTurn(
      user.id,
      String(conversation.id),
      "What Lisbon restaurants have I saved?",
      crypto.randomUUID(),
    );
    const deltas: string[] = [];
    const result = await new AskService(
      { responses: { create } } as unknown as OpenAI,
      testConfig("/tmp/ask-test"),
      store,
    ).answer({
      userId: user.id,
      conversationId: String(conversation.id),
      assistantId: turn.assistantId,
      question: "What Lisbon restaurants have I saved?",
      signal: new AbortController().signal,
      onDelta: (text) => deltas.push(text),
    });
    expect(result.sources.map((source) => source.id)).toEqual([capture.id]);
    expect(
      store.getConversation(user.id, String(conversation.id))?.messages,
    ).toHaveLength(2);
    expect(deltas.join("")).toBe("Rio de Mello is one saved option [1].");
    expect(String(create.mock.calls[0]?.[0]?.instructions)).toContain(
      "untrusted data",
    );
    expect(String(create.mock.calls[0]?.[0]?.instructions)).toContain(
      "GitHub-flavored Markdown",
    );
  });

  it("does not call the model when the archive has no relevant evidence", async () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const user = store.createUser("demo", "hash");
    const conversation = store.createConversation(user.id)!;
    const create = vi.fn();
    const turn = store.beginConversationTurn(
      user.id,
      String(conversation.id),
      "quantum submarines",
      crypto.randomUUID(),
    );
    const result = await new AskService(
      { responses: { create } } as unknown as OpenAI,
      testConfig("/tmp/ask-empty"),
      store,
    ).answer({
      userId: user.id,
      conversationId: String(conversation.id),
      assistantId: turn.assistantId,
      question: "quantum submarines",
      signal: new AbortController().signal,
      onDelta: () => undefined,
    });
    expect(result.sufficient).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("decodes an answer split across escaped JSON chunks", () => {
    expect(extractAnswer('{"answer":"Line one\\nLine')).toBe("Line one\nLine");
    expect(
      extractAnswer('{"answer":"Line one\\nLine two","citedCaptureIds":[]}'),
    ).toBe("Line one\nLine two");
  });
});
