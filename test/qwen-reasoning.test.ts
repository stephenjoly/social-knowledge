import { afterEach, expect, it, vi } from "vitest";
import { AiProviderService } from "../src/ai-providers.js";
import { JobStore } from "../src/db.js";
import { testConfig } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

it.each([null, "low", "medium", "high"] as const)(
  "serializes Qwen effort %s for structured planning, streaming and diagnostics without exposing reasoning",
  async (thinkingLevel) => {
    const store = new JobStore(":memory:");
    try {
      const user = store.createUser("qwen-reasoning", "hash");
      const bodies: Record<string, unknown>[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
          const url = input instanceof Request ? input.url : String(input);
          if (url.endsWith("/models")) return Response.json({ data: [] });
          expect(url).toBe("https://api.cerebras.ai/v1/chat/completions");
          const body = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          bodies.push(body);
          if (body.stream)
            return new Response(
              [
                {
                  choices: [
                    {
                      delta: { reasoning: "PRIVATE_REASONING_SENTINEL" },
                      finish_reason: null,
                    },
                  ],
                },
                {
                  choices: [
                    { delta: { content: "Final answer" }, finish_reason: null },
                  ],
                },
                { choices: [{ delta: {}, finish_reason: "stop" }] },
              ]
                .map((event) => `data: ${JSON.stringify(event)}\n\n`)
                .join("") + "data: [DONE]\n\n",
              { headers: { "content-type": "text/event-stream" } },
            );
          return Response.json({
            choices: [
              {
                message: {
                  content: '{"ok":true}',
                  reasoning: "PRIVATE_REASONING_SENTINEL",
                },
                finish_reason: "stop",
              },
            ],
          });
        }),
      );
      const service = new AiProviderService(
        store,
        testConfig("/tmp/qwen-reasoning"),
      );
      await service.verifyAndSave(user.id, "cerebras", "synthetic-qwen-key");
      const selection = {
        provider: "cerebras" as const,
        model: "qwen-3.8-27b",
        thinkingLevel,
      };
      service.saveSelections(user.id, { analysis: selection, ask: selection });
      const structured = await service.runForUser(user.id, () =>
        service
          .routedClient()
          .responses.create({
            model: selection.model,
            input: "Plan",
            text: {
              format: {
                type: "json_schema",
                name: "planner",
                strict: true,
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["ok"],
                  properties: { ok: { type: "boolean" } },
                },
              },
            },
          }),
      );
      expect(structured.output_text).toBe('{"ok":true}');
      const stream = await service.runForUser(user.id, () =>
        service
          .routedClient()
          .responses.create({
            model: selection.model,
            input: "Answer",
            stream: true,
          }),
      );
      const events = [];
      for await (const event of stream) events.push(event);
      expect(events).toEqual([
        { type: "response.output_text.delta", delta: "Final answer" },
      ]);
      expect(await service.testConnection(user.id, "analysis")).toMatchObject({
        ok: true,
      });
      expect(await service.testConnection(user.id, "ask")).toMatchObject({
        ok: true,
      });
      expect(bodies).toHaveLength(4);
      for (const body of bodies) {
        expect(body.model).toBe(selection.model);
        if (thinkingLevel === null)
          expect(body).not.toHaveProperty("reasoning_effort");
        else expect(body.reasoning_effort).toBe(thinkingLevel);
        for (const unsupported of [
          "enable_thinking",
          "disable_reasoning",
          "thinking_budget",
          "reasoning_format",
        ])
          expect(body).not.toHaveProperty(unsupported);
      }
      expect(JSON.stringify({ structured, events })).not.toContain(
        "PRIVATE_REASONING_SENTINEL",
      );
      expect(() =>
        service.saveSelections(user.id, {
          ask: { ...selection, thinkingLevel: "minimal" },
        }),
      ).toThrow("invalid_selection");
    } finally {
      store.close();
    }
  },
);
