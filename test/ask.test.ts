import { afterEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import {
  AskService,
  extractAnswer,
  normalizeInlineCitations,
} from "../src/ask.js";
import { JobStore } from "../src/db.js";
import { AiProviderService } from "../src/ai-providers.js";
import { testConfig } from "./helpers.js";

function addCapture(
  store: JobStore,
  userId: string,
  input: {
    sourceHash: string;
    title: string;
    synopsis: string;
    transcript: string;
  },
) {
  const { job } = store.createOrGet({
    ownerUserId: userId,
    sourceUrl: `https://instagram.com/reel/${input.sourceHash}`,
    normalizedUrl: `https://instagram.com/reel/${input.sourceHash}`,
    sourceHash: input.sourceHash,
  });
  return store.createCapture({
    job,
    sourceType: "video",
    sourceId: input.sourceHash,
    platform: "instagram",
    title: input.title,
    creator: "guide",
    creatorUrl: null,
    description: input.synopsis,
    transcript: input.transcript,
    sourceLanguage: "en",
    translatedTranscript: null,
    translationLanguage: null,
    comments: [],
    analysis: {
      title: input.title,
      synopsis: input.synopsis,
      whyUseful: "A practical saved reference.",
      takeaways: [input.transcript],
      topics: ["DIY", "saved reference"],
      entities: [],
      recommendations: [],
      claimsNeedingVerification: [],
      evidence: [],
      classification: {
        primaryDomain: "Home & Design",
        country: null,
        city: null,
        subcategory: "Home & Design",
        secondaryTopics: ["DIY"],
        confidence: 0.95,
      },
    },
    publishedAt: null,
    durationSeconds: 20,
    notePath: `Social Knowledge/Captures/${input.sourceHash}.md`,
    assets: [],
  })!;
}

function streamedJson(value: unknown) {
  const payload = JSON.stringify(value);
  return (async function* () {
    for (const delta of [payload.slice(0, 25), payload.slice(25)])
      yield { type: "response.output_text.delta", delta };
  })();
}

describe("AskService", () => {
  const stores: JobStore[] = [];
  afterEach(() => {
    stores.splice(0).forEach((store) => store.close());
    vi.unstubAllGlobals();
  });

  it.each([
    { model: "gpt-5", thinkingLevel: null },
    ...["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"].flatMap((model) =>
      ([null, "low"] as const).map((thinkingLevel) => ({
        model,
        thinkingLevel,
      })),
    ),
  ])(
    "answers a new chat through $model Responses with thinking=$thinkingLevel",
    async ({ model, thinkingLevel }) => {
      const store = new JobStore(":memory:");
      stores.push(store);
      const user = store.createUser("normal-gpt-five", "hash");
      const config = testConfig("/tmp/normal-gpt-five-ask");
      const capture = addCapture(store, user.id, {
        sourceHash: "normal-gpt-five",
        title: "Seven Lisbon restaurants",
        synopsis: "Restaurants for a Lisbon trip",
        transcript: "Try Rio de Mello for grilled chicken.",
      });
      const bodies: Array<Record<string, unknown>> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
          const url = input instanceof Request ? input.url : String(input);
          if (url.endsWith("/models"))
            return new Response(JSON.stringify({ data: [] }), { status: 200 });
          expect(url).toBe("https://api.openai.com/v1/responses");
          const body = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          bodies.push(body);
          if (!body.stream)
            return new Response(
              JSON.stringify({
                object: "response",
                status: "completed",
                output: [
                  {
                    type: "message",
                    role: "assistant",
                    content: [
                      {
                        type: "output_text",
                        annotations: [],
                        text: JSON.stringify({
                          action: "search_archive",
                          standaloneQuestion:
                            "What Lisbon restaurants have I saved?",
                          responseInstructions: "Answer directly",
                          referencedCaptureIds: [],
                        }),
                      },
                    ],
                  },
                ],
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          const answer = JSON.stringify({
            answer: "Try Rio de Mello [1].",
            citedCaptureIds: [capture.id],
            sufficient: true,
          });
          return new Response(
            [
              { type: "response.output_text.delta", delta: answer },
              { type: "response.completed", response: { status: "completed" } },
            ]
              .map(
                (event) =>
                  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
              )
              .join(""),
            { status: 200, headers: { "content-type": "text/event-stream" } },
          );
        }),
      );
      const providers = new AiProviderService(store, config);
      await providers.verifyAndSave(
        user.id,
        "openai",
        "sk-synthetic-new-chat-credential",
      );
      providers.saveSelections(user.id, {
        analysis: { provider: "openai", model, thinkingLevel },
      });
      const conversation = store.createConversation(user.id)!;
      const turn = store.beginConversationTurn(
        user.id,
        conversation.id,
        "What Lisbon restaurants have I saved?",
        "normal-new-chat",
      );
      const ask = new AskService(providers.routedClient(), config, store);
      const selection = providers.resolveAskSelection(user.id)!;
      const result = await providers.runForUser(
        user.id,
        () =>
          ask.answer({
            userId: user.id,
            conversationId: conversation.id,
            assistantId: turn.assistantId,
            question: "What Lisbon restaurants have I saved?",
            signal: new AbortController().signal,
            onDelta: () => undefined,
          }),
        selection.provider,
        selection.model,
        selection.thinkingLevel,
      );
      expect(result.answer).toBe("Try Rio de Mello [1].");
      expect(result.sources.map((source) => source.id)).toEqual([capture.id]);
      expect(
        store.getConversation(user.id, conversation.id)!.messages.at(-1),
      ).toMatchObject({ status: "complete", content: "Try Rio de Mello [1]." });
      expect(bodies).toHaveLength(2);
      for (const body of bodies) {
        expect(body.model).toBe(model);
        if (thinkingLevel === null)
          expect(body).not.toHaveProperty("reasoning");
        else
          expect(body).toHaveProperty("reasoning", { effort: thinkingLevel });
        expect(body).not.toHaveProperty("reasoning_effort");
        expect(body).not.toHaveProperty("temperature");
      }
      expect(bodies[0]).toHaveProperty(
        "text.format.name",
        "conversation_turn_plan",
      );
      expect(bodies[1]).toHaveProperty("text.format.name", "archive_answer");
      expect(bodies[1]).toHaveProperty("stream", true);
    },
  );

  it.each([
    { status: "complete", chain: false, checkpoint: false },
    { status: "failed", chain: false, checkpoint: false },
    { status: "cancelled", chain: false, checkpoint: false },
    { status: "pending", chain: false, checkpoint: false },
    { status: "complete", chain: true, checkpoint: false },
    { status: "complete", chain: true, checkpoint: true },
  ] as const)("uses one successful answer in context after a $status retry (chain=$chain, checkpoint=$checkpoint)", async ({ status, chain, checkpoint }) => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const owner = store.createUser("retry-context", "hash");
    const capture = addCapture(store, owner.id, { sourceHash: "retry-context", title: "Saved project", synopsis: "A saved project", transcript: "Prime, coat and seal the saved project." });
    const conversation = store.createConversation(owner.id)!;
    const original = store.beginConversationTurn(owner.id, conversation.id, "Tell me about my saved project", "original-question");
    const sources = [{ id: capture.id, citation: 1, title: capture.title, creator: capture.creator, platform: capture.platform, synopsis: capture.synopsis, sourceUrl: capture.sourceUrl, breadcrumb: [] }];
    store.completeConversationAttempt(owner.id, conversation.id, original.assistantId, "Original project answer [1]", sources, true);
    if (checkpoint) store.saveConversationCompaction({
      userId: owner.id, conversationId: conversation.id, throughMessageId: original.assistantId,
      summary: "STALE ORIGINAL CHECKPOINT", sourceIds: [capture.id], provider: null, model: null, estimatedTokens: 10,
    });
    let retry = store.beginConversationRetry(owner.id, conversation.id, original.assistantId, "retry-question");
    if (chain) {
      store.failConversationAttempt(owner.id, conversation.id, retry.assistantId, "failed", "provider_error");
      retry = store.beginConversationRetry(owner.id, conversation.id, retry.assistantId, "chain-retry-question");
    }
    if (status === "complete") store.completeConversationAttempt(owner.id, conversation.id, retry.assistantId, "Replacement project answer [1]", sources, true);
    else if (status !== "pending") store.failConversationAttempt(owner.id, conversation.id, retry.assistantId, status, "provider_error");
    const current = status === "pending" ? retry : store.beginConversationTurn(owner.id, conversation.id, "Summarize my saved project", "followup-question");
    const create = vi.fn().mockResolvedValueOnce({ output_text: JSON.stringify({ action: "reuse_sources", standaloneQuestion: "Saved project", responseInstructions: "Be brief", referencedCaptureIds: [capture.id] }) }).mockResolvedValueOnce(streamedJson({ answer: "Project follow-up [1]", citedCaptureIds: [capture.id], sufficient: true }));
    await new AskService({ responses: { create } } as unknown as OpenAI, testConfig("/tmp/ask-retry-context"), store).answer({
      userId: owner.id, conversationId: conversation.id, assistantId: current.assistantId,
      question: "Summarize my saved project", signal: new AbortController().signal, onDelta: () => undefined,
    });
    const plannerInput = create.mock.calls[0]![0].input as Array<{ role: string; content: string }>;
    expect(plannerInput.filter((message) => message.role === "assistant").map((message) => message.content)).toEqual([
      status === "complete" ? "Replacement project answer [1]" : "Original project answer [1]",
    ]);
    expect(JSON.stringify(plannerInput)).not.toContain("STALE ORIGINAL CHECKPOINT");
    const answerInput = create.mock.calls[1]![0].input as Array<{ role: string; content: string }>;
    expect(answerInput.filter((message) => message.role === "assistant").map((message) => message.content)).toEqual([
      status === "complete" ? "Replacement project answer [1]" : "Original project answer [1]",
    ]);
    // Superseded turns remain in the transcript; only provider context is filtered.
    expect(store.getConversation(owner.id, conversation.id)!.messages.find((message) => message.id === original.assistantId)!.content).toBe("Original project answer [1]");
  });

  it("retrieves saved knowledge and persists a cited answer", async () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const user = store.createUser("demo", "hash");
    const capture = addCapture(store, user.id, {
      sourceHash: "lisbon",
      title: "Seven Lisbon restaurants",
      synopsis: "Restaurants for a Lisbon trip",
      transcript: "Try Rio de Mello for grilled chicken.",
    });
    const conversation = store.createConversation(user.id)!;
    const payload = JSON.stringify({
      answer: "Rio de Mello is one saved option [1].",
      citedCaptureIds: [capture.id],
      sufficient: true,
    });
    let providerFinished = false;
    const turn = store.beginConversationTurn(
      user.id,
      String(conversation.id),
      "What Lisbon restaurants have I saved?",
      crypto.randomUUID(),
    );
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          action: "search_archive",
          standaloneQuestion: "What Lisbon restaurants have I saved?",
          responseInstructions: "Answer directly.",
          referencedCaptureIds: [],
        }),
      })
      .mockImplementationOnce(async () =>
        (async function* () {
          yield {
            type: "response.output_text.delta",
            delta: payload.slice(0, 25),
          };
          await new Promise((resolve) => setTimeout(resolve, 25));
          yield {
            type: "response.output_text.delta",
            delta: payload.slice(25),
          };
          providerFinished = true;
        })(),
      );
    const deltas: string[] = [];
    let deltaReceivedBeforeProviderFinished = false;
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
      onDelta: (text) => {
        deltas.push(text);
        if (!providerFinished) deltaReceivedBeforeProviderFinished = true;
      },
    });
    expect(result.sources.map((source) => source.id)).toEqual([capture.id]);
    expect(
      store.getConversation(user.id, String(conversation.id))?.messages,
    ).toHaveLength(2);
    expect(deltas.join("")).toBe("Rio de Mello is one saved option [1].");
    expect(deltaReceivedBeforeProviderFinished).toBe(true);
    expect(String(create.mock.calls[0]?.[0]?.instructions)).toContain(
      "untrusted data",
    );
    expect(String(create.mock.calls[1]?.[0]?.instructions)).toContain(
      "GitHub-flavored Markdown",
    );
  });

  it("uses the prior answer's sources for a formatting-only follow-up", async () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const user = store.createUser("follow-up", "hash");
    const capture = addCapture(store, user.id, {
      sourceHash: "microcement",
      title: "DIY microcement kitchen worktop",
      synopsis: "A beginner worktop coating project.",
      transcript: "Prime the plywood, apply thin coats, sand, and seal.",
    });
    const conversation = store.createConversation(user.id)!;
    store.addConversationMessage(
      user.id,
      conversation.id,
      "user",
      "What DIY projects have I saved?",
    );
    store.addConversationMessage(
      user.id,
      conversation.id,
      "assistant",
      "The saved project is a DIY microcement kitchen worktop [1].",
      [
        {
          id: capture.id,
          citation: 1,
          title: capture.title,
          creator: capture.creator,
          platform: capture.platform,
          synopsis: capture.synopsis,
          sourceUrl: capture.sourceUrl,
          breadcrumb: [],
        },
      ],
      true,
    );
    const turn = store.beginConversationTurn(
      user.id,
      conversation.id,
      "Can you just give me a really brief bulleted list?",
      crypto.randomUUID(),
    );
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          action: "reuse_sources",
          standaloneQuestion: "What DIY projects have I saved?",
          responseInstructions: "Return a really brief bulleted list.",
          referencedCaptureIds: [capture.id],
        }),
      })
      .mockResolvedValueOnce(
        streamedJson({
          answer: "- DIY microcement kitchen worktop [1]",
          citedCaptureIds: [capture.id],
          sufficient: true,
        }),
      );
    const search = vi.spyOn(store, "searchKnowledge");
    const statuses: string[] = [];
    const result = await new AskService(
      { responses: { create } } as unknown as OpenAI,
      testConfig("/tmp/ask-follow-up"),
      store,
    ).answer({
      userId: user.id,
      conversationId: conversation.id,
      assistantId: turn.assistantId,
      question: "Can you just give me a really brief bulleted list?",
      signal: new AbortController().signal,
      onDelta: () => undefined,
      onStatus: (status) => statuses.push(status),
    });
    expect(result.sources.map((source) => source.id)).toEqual([capture.id]);
    expect(result.diagnostics.action).toBe("reuse_sources");
    expect(search).not.toHaveBeenCalled();
    expect(statuses).toContain("Using sources from the previous answer…");
    const plannerInput = JSON.stringify(create.mock.calls[0]?.[0]?.input);
    const answerInput = JSON.stringify(create.mock.calls[1]?.[0]?.input);
    expect(plannerInput).toContain("What DIY projects have I saved?");
    expect(plannerInput).toContain(
      "Can you just give me a really brief bulleted list?",
    );
    expect(answerInput).not.toContain("stain removal");
    expect(result.answer).toContain("DIY microcement");
  });

  it("returns insufficiency without an answer-generation call when evidence is absent", async () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const user = store.createUser("empty", "hash");
    const conversation = store.createConversation(user.id)!;
    const create = vi.fn().mockResolvedValueOnce({
      output_text: JSON.stringify({
        action: "search_archive",
        standaloneQuestion: "quantum submarines",
        responseInstructions: "Answer directly.",
        referencedCaptureIds: [],
      }),
    });
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
    expect(create).toHaveBeenCalledOnce();
  });

  it("keeps the full transcript while falling back to a local compaction checkpoint", async () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const user = store.createUser("long-chat", "hash");
    const capture = addCapture(store, user.id, {
      sourceHash: "long-diy",
      title: "DIY project notes",
      synopsis: "A saved project.",
      transcript: "Use thin coats and seal the finished worktop.",
    });
    const conversation = store.createConversation(user.id)!;
    store.addConversationMessage(
      user.id,
      conversation.id,
      "user",
      "Remember this project and its important details.",
    );
    store.addConversationMessage(
      user.id,
      conversation.id,
      "assistant",
      "The project is saved as DIY project notes [1].",
      [{ id: capture.id, title: capture.title, breadcrumb: [] }],
      true,
    );
    const longText =
      "A detailed preference and correction from the user. ".repeat(35);
    for (let index = 0; index < 8; index++) {
      store.addConversationMessage(
        user.id,
        conversation.id,
        "user",
        `${longText} User turn ${index}`,
      );
      store.addConversationMessage(
        user.id,
        conversation.id,
        "assistant",
        `${longText} Assistant turn ${index}`,
      );
    }
    const turn = store.beginConversationTurn(
      user.id,
      conversation.id,
      "Give me the saved project as a short list.",
      crypto.randomUUID(),
    );
    const config = testConfig("/tmp/ask-compaction");
    config.askContextBudgetTokens = 24000;
    config.askCompactionThreshold = 0.5;
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary summarizer outage"))
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          action: "reuse_sources",
          standaloneQuestion: "What saved DIY project should I list?",
          responseInstructions: "Use a short bullet list.",
          referencedCaptureIds: [capture.id],
        }),
      })
      .mockResolvedValueOnce(
        streamedJson({
          answer: "- DIY project notes [1]",
          citedCaptureIds: [capture.id],
          sufficient: true,
        }),
      );
    const result = await new AskService(
      { responses: { create } } as unknown as OpenAI,
      config,
      store,
    ).answer({
      userId: user.id,
      conversationId: conversation.id,
      assistantId: turn.assistantId,
      question: "Give me the saved project as a short list.",
      signal: new AbortController().signal,
      onDelta: () => undefined,
    });
    expect(result.diagnostics.compacted).toBe(true);
    expect(result.diagnostics.compactionFallback).toBe(true);
    expect(
      store.latestConversationCompaction(user.id, conversation.id),
    ).not.toBeNull();
    expect(
      store.getConversation(user.id, conversation.id)!.messages.length,
    ).toBe(20);
  });

  it("decodes an answer split across escaped JSON chunks", () => {
    expect(extractAnswer('{"answer":"Line one\\nLine')).toBe("Line one\nLine");
    expect(
      extractAnswer('{"answer":"Line one\\nLine two","citedCaptureIds":[]}'),
    ).toBe("Line one\nLine two");
  });

  it("normalizes capture IDs inline and removes the duplicate fallback footer", () => {
    const id = "2bd8d8da-03a3-46f7-8874-0a61f2eff666";
    expect(
      normalizeInlineCitations(
        `- Gyopo — Korean brewery [${id}].\n\nSources: [1]`,
        [
          {
            id,
            citation: 1,
            title: "Toronto date-night restaurants",
            creator: null,
            platform: "facebook",
            synopsis: "Restaurant recommendations",
            sourceUrl: "https://facebook.com/reel/example",
            breadcrumb: [],
          },
        ],
      ),
    ).toBe("- Gyopo — Korean brewery [1].");
  });
});
