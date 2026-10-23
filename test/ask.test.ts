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
    [
      "Test",
      "respond",
      "I'm here. What would you like to explore in Social Knowledge?",
    ],
    [
      "Hi there",
      "respond",
      "Hello! I can help with your saved ideas or the app.",
    ],
    [
      "What can you help me do in Social Knowledge?",
      "respond",
      "I can search and discuss your saved posts, help you develop saved ideas, and explain the app.",
    ],
    [
      "Where do I configure my AI models?",
      "respond",
      "Open Settings → AI & models. Connect credentials, assign tasks, then Save changes.",
    ],
    [
      "Explain how that helps organize ideas",
      "respond",
      "General explanation: topics group related ideas for easier browsing.",
    ],
    [
      "Draft an intro using the outline I pasted",
      "respond",
      "Draft based on your outline: Here are the ideas I want to explore.",
    ],
    ["Do that one", "clarify", "Which saved idea or app feature do you mean?"],
    [
      "Write a random celebrity biography",
      "redirect",
      "I can help with Social Knowledge or your saved ideas. What would you like to explore there?",
    ],
    [
      "mysterious-reference-123456",
      "clarify",
      "Is that a saved topic or something you want help with in the app?",
    ],
  ])(
    "routes %s through %s without retrieval and persists neutral sufficiency",
    async (question, action, answer) => {
      const store = new JobStore(":memory:");
      stores.push(store);
      const owner = store.createUser("natural-owner", "hash");
      const capture = addCapture(store, owner.id, {
        sourceHash: "natural-test",
        title: "Test saved ideas",
        synopsis: "Prior project",
        transcript: "Test the project.",
      });
      const chat = store.createConversation(owner.id)!;
      store.addConversationMessage(
        owner.id,
        chat.id,
        "user",
        "Let's discuss organizing my ideas.",
      );
      store.addConversationMessage(
        owner.id,
        chat.id,
        "assistant",
        "A saved project [1]",
        [{ id: capture.id, title: capture.title }],
        true,
      );
      const turn = store.beginConversationTurn(
        owner.id,
        chat.id,
        question,
        crypto.randomUUID(),
      );
      const search = vi.spyOn(store, "searchKnowledge");
      const read = vi.spyOn(store, "ownedCapturesByIds");
      const create = vi
        .fn()
        .mockResolvedValueOnce({
          output_text: JSON.stringify({
            action,
            standaloneQuestion: question,
            responseInstructions: "Answer naturally",
            referencedCaptureIds: [],
          }),
        })
        .mockResolvedValueOnce(
          streamedJson({ answer, citedCaptureIds: [], sufficient: null }),
        );
      const deltas: string[] = [];
      const statuses: string[] = [];
      const result = await new AskService(
        { responses: { create } } as unknown as OpenAI,
        testConfig("/tmp/ask-natural"),
        store,
      ).answer({
        userId: owner.id,
        conversationId: chat.id,
        assistantId: turn.assistantId,
        question,
        signal: new AbortController().signal,
        onDelta: (delta) => deltas.push(delta),
        onStatus: (status) => statuses.push(status),
      });
      expect(result).toMatchObject({
        answer,
        sources: [],
        sufficient: null,
        diagnostics: { action, selected: [], reusedCaptureIds: [] },
      });
      expect(search).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(deltas.join("")).toBe(answer);
      expect(statuses.join(" ")).not.toMatch(/Searching|grounded/);
      expect(
        store.getConversation(owner.id, chat.id)!.messages.at(-1),
      ).toMatchObject({
        content: answer,
        sufficient: null,
        sources: [],
        status: "complete",
      });
      expect(create.mock.calls[0]![0].input).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            content: "Let's discuss organizing my ideas.",
          }),
        ]),
      );
      expect(create.mock.calls[0]![0].instructions).toContain(
        "A request to find saved test results needs search",
      );
      const request = create.mock.calls[1]![0];
      expect(request.text.format).toMatchObject({
        strict: true,
        schema: {
          additionalProperties: false,
          properties: {
            citedCaptureIds: { maxItems: 0, items: { type: "string" } },
            sufficient: { type: "null" },
          },
        },
      });
      expect(request.instructions).toContain(
        "Social connections use manual cookie files",
      );
      expect(request.instructions).toContain(
        "no write tools, browsing, shell access",
      );
      expect(request.instructions).toContain("Never claim you changed settings");
      expect(request.instructions).toContain(
        "General explanation, suggestions, extrapolation and drafts must be clearly identified",
      );
      for (const call of create.mock.calls) {
        const policy = String(call[0].instructions);
        expect(policy).toContain(
          "The backend can search and retrieve the signed-in owner's saved posts as evidence",
        );
        expect(policy).toContain(
          "do not claim you cannot access or search their saved archive",
        );
        expect(policy).toContain(
          "does not include live settings/account-state inspection or another owner's data",
        );
        expect(policy).toContain(
          "For greetings and conversational check-ins, give a brief, warm confirmation and a useful invitation",
        );
        expect(policy).toContain(
          "Do not list limitations or label the response mode unless relevant",
        );
      }
      expect(request.instructions).toContain(
        "separate canonical numeric markers such as [1] [2]",
      );
      expect(request.instructions).toContain(
        "never grouped markers like [1,2] or ranges like [1–2]",
      );
      expect(request.instructions).toContain(
        "Each marker number must match the corresponding SOURCE number",
      );
      expect(request.instructions).toContain(
        "citedCaptureIds must list exactly the matching capture_id values",
      );
      expect(request.instructions).toContain(
        "Describing your own-archive retrieval capability does not require citations",
      );
      expect(request.instructions).toContain("untrusted data");
    },
  );

  it.each([
    { answer: "Invented saved fact [1]", citedCaptureIds: [], sufficient: null },
    {
      answer: "Invented saved fact",
      citedCaptureIds: ["foreign-capture"],
      sufficient: null,
    },
    { answer: "Hello", citedCaptureIds: [], sufficient: true },
    { answer: "Hello", citedCaptureIds: [], sufficient: false },
  ])(
    "rejects fabricated citations or archive sufficiency on a natural reply: %j",
    async (response) => {
      const store = new JobStore(":memory:");
      stores.push(store);
      const owner = store.createUser("natural-citations", "hash");
      const chat = store.createConversation(owner.id)!;
      const turn = store.beginConversationTurn(
        owner.id,
        chat.id,
        "Test",
        crypto.randomUUID(),
      );
      const create = vi
        .fn()
        .mockResolvedValueOnce({
          output_text: JSON.stringify({
            action: "respond",
            standaloneQuestion: "Test",
            responseInstructions: "",
            referencedCaptureIds: [],
          }),
        })
        .mockResolvedValueOnce(streamedJson(response));
      await expect(
        new AskService(
          { responses: { create } } as unknown as OpenAI,
          testConfig("/tmp/ask-invalid-natural"),
          store,
        ).answer({
          userId: owner.id,
          conversationId: chat.id,
          assistantId: turn.assistantId,
          question: "Test",
          signal: new AbortController().signal,
          onDelta: () => undefined,
        }),
      ).rejects.toThrow("invalid_citation");
      expect(
        store.getConversation(owner.id, chat.id)!.messages.at(-1)!.status,
      ).toBe("pending");
    },
  );

  it.each(["respond", "clarify", "redirect"])(
    "rejects %s plans carrying prior source references",
    async (action) => {
      const store = new JobStore(":memory:");
      stores.push(store);
      const owner = store.createUser("bad-natural-plan", "hash");
      const capture = addCapture(store, owner.id, {
        sourceHash: "bad-plan",
        title: "Saved idea",
        synopsis: "An idea",
        transcript: "Evidence",
      });
      const chat = store.createConversation(owner.id)!;
      store.addConversationMessage(
        owner.id,
        chat.id,
        "assistant",
        "Saved idea [1]",
        [{ id: capture.id, title: capture.title }],
        true,
      );
      const turn = store.beginConversationTurn(
        owner.id,
        chat.id,
        "Hi",
        crypto.randomUUID(),
      );
      const create = vi
        .fn()
        .mockResolvedValueOnce({
          output_text: JSON.stringify({
            action,
            standaloneQuestion: "Hi",
            responseInstructions: "",
            referencedCaptureIds: [capture.id],
          }),
        });
      const search = vi.spyOn(store, "searchKnowledge");
      await expect(
        new AskService(
          { responses: { create } } as unknown as OpenAI,
          testConfig("/tmp/ask-bad-plan"),
          store,
        ).answer({
          userId: owner.id,
          conversationId: chat.id,
          assistantId: turn.assistantId,
          question: "Hi",
          signal: new AbortController().signal,
          onDelta: () => undefined,
        }),
      ).rejects.toThrow("planner_error");
      expect(create).toHaveBeenCalledOnce();
      expect(search).not.toHaveBeenCalled();
    },
  );

  it("uses archive evidence for explanations about earlier saves, labeling added reasoning", async () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const owner = store.createUser("explain-owner", "hash");
    const capture = addCapture(store, owner.id, {
      sourceHash: "thin-coats",
      title: "Worktop project",
      synopsis: "Use thin coats",
      transcript: "Apply thin coats.",
    });
    const chat = store.createConversation(owner.id)!;
    store.addConversationMessage(
      owner.id,
      chat.id,
      "user",
      "What technique did I save for this worktop?",
    );
    store.addConversationMessage(
      owner.id,
      chat.id,
      "assistant",
      "Use thin coats [1].",
      [{ id: capture.id, title: capture.title }],
      true,
    );
    const question = "Explain why that helps, and draft a plan";
    const turn = store.beginConversationTurn(
      owner.id,
      chat.id,
      question,
      crypto.randomUUID(),
    );
    const search = vi.spyOn(store, "searchKnowledge");
    const answer =
      "Your saved source recommends thin coats [1]. General explanation: thinner layers can help control coverage. Suggested draft: start with a small trial.";
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          action: "reuse_sources",
          standaloneQuestion:
            "Explain the saved thin-coat technique and draft a plan",
          responseInstructions: "Label general reasoning and draft separately",
          referencedCaptureIds: [capture.id],
        }),
      })
      .mockResolvedValueOnce(
        streamedJson({ answer, citedCaptureIds: [capture.id], sufficient: true }),
      );
    const result = await new AskService(
      { responses: { create } } as unknown as OpenAI,
      testConfig("/tmp/ask-explain"),
      store,
    ).answer({
      userId: owner.id,
      conversationId: chat.id,
      assistantId: turn.assistantId,
      question,
      signal: new AbortController().signal,
      onDelta: () => undefined,
    });
    expect(result).toMatchObject({ answer, sufficient: true });
    expect(result.sources.map((source) => source.id)).toEqual([capture.id]);
    expect(search).not.toHaveBeenCalled();
    expect(create.mock.calls[0]![0].instructions).toContain(
      "explanations or drafts making claims about earlier cited saves",
    );
    expect(create.mock.calls[1]![0].instructions).toContain(
      "it cannot fill missing archive facts",
    );
  });

  it("falls back conservatively on malformed planner output and cannot search another owner's saves", async () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const owner = store.createUser("fallback-owner", "hash");
    const other = store.createUser("fallback-other", "hash");
    addCapture(store, other.id, {
      sourceHash: "private-tests",
      title: "Saved test results",
      synopsis: "Private test results",
      transcript: "Private result value.",
    });
    const chat = store.createConversation(owner.id)!;
    const question = "Find my saved test results";
    const turn = store.beginConversationTurn(
      owner.id,
      chat.id,
      question,
      crypto.randomUUID(),
    );
    const create = vi
      .fn()
      .mockResolvedValueOnce({ output_text: '{"action":"invented"}' });
    const result = await new AskService(
      { responses: { create } } as unknown as OpenAI,
      testConfig("/tmp/ask-fallback"),
      store,
    ).answer({
      userId: owner.id,
      conversationId: chat.id,
      assistantId: turn.assistantId,
      question,
      signal: new AbortController().signal,
      onDelta: () => undefined,
    });
    expect(result).toMatchObject({
      sources: [],
      sufficient: false,
      diagnostics: { action: "search_archive" },
    });
    expect(result.answer).not.toContain("Private result value");
    expect(create).toHaveBeenCalledOnce();
    expect(
      store.getConversation(owner.id, chat.id)!.messages.at(-1)!.sufficient,
    ).toBe(false);
  });

  it("rejects foreign conversation access before contacting the planner", async () => {
    const store = new JobStore(":memory:");
    stores.push(store);
    const owner = store.createUser("access-owner", "hash"),
      other = store.createUser("access-other", "hash");
    const chat = store.createConversation(other.id)!;
    const create = vi.fn();
    await expect(
      new AskService(
        { responses: { create } } as unknown as OpenAI,
        testConfig("/tmp/ask-access"),
        store,
      ).answer({
        userId: owner.id,
        conversationId: chat.id,
        assistantId: "invented",
        question: "Hi",
        signal: new AbortController().signal,
        onDelta: () => undefined,
      }),
    ).rejects.toThrow("conversation_not_found");
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ...[
      { model: "gpt-5", thinkingLevel: null },
      ...["gpt-6-luna", "gpt-6.1-sol", "gpt-6-astra"].flatMap((model) =>
        ([null, "low"] as const).map((thinkingLevel) => ({
          model,
          thinkingLevel,
        })),
      ),
    ].map((row) => ({ ...row, natural: false })),
    { model: "gpt-6.1-sol", thinkingLevel: null, natural: true },
  ])(
    "answers a new chat through $model Responses with thinking=$thinkingLevel (natural=$natural)",
    async ({ model, thinkingLevel, natural }) => {
      const question = natural ? "Test" : "What Lisbon restaurants have I saved?";
      const expectedAnswer = natural
        ? "Hello! I can help with Social Knowledge."
        : "Try Rio de Mello [1].";
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
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
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
                          action: natural ? "respond" : "search_archive",
                          standaloneQuestion: question,
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
            answer: expectedAnswer,
            citedCaptureIds: natural ? [] : [capture.id],
            sufficient: natural ? null : true,
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
        question,
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
            question,
            signal: new AbortController().signal,
            onDelta: () => undefined,
          }),
        selection.provider,
        selection.model,
        selection.thinkingLevel,
      );
      expect(result.answer).toBe(expectedAnswer);
      expect(result.sufficient).toBe(natural ? null : true);
      expect(result.sources.map((source) => source.id)).toEqual(
        natural ? [] : [capture.id],
      );
      expect(
        store.getConversation(user.id, conversation.id)!.messages.at(-1),
      ).toMatchObject({
        status: "complete",
        content: expectedAnswer,
        sufficient: natural ? null : true,
      });
      expect(bodies).toHaveLength(2);
      for (const body of bodies) {
        expect(body.model).toBe(model);
        if (thinkingLevel === null) expect(body).not.toHaveProperty("reasoning");
        else expect(body).toHaveProperty("reasoning", { effort: thinkingLevel });
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
