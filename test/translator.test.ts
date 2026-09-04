import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { Translator } from "../src/translator.js";
import { testConfig } from "./helpers.js";

describe("Translator", () => {
  it("preserves the original and returns a foreign-language translation", async () => {
    const create = vi.fn(async () => ({
      output_text: JSON.stringify({
        sourceLanguage: "French",
        sameAsDefault: false,
        translatedTranscript: "Six Portuguese specialties to try in Porto.",
      }),
    }));
    const client = { responses: { create } } as unknown as OpenAI;
    const result = await new Translator(
      client,
      testConfig("/tmp/translator-test"),
    ).translate(
      "Six spécialités portugaises à tester à Porto.",
      "English",
      true,
    );
    expect(result.sourceLanguage).toBe("French");
    expect(result.translatedTranscript).toContain("Portuguese specialties");
  });

  it("does not call OpenAI for an empty transcript", async () => {
    const create = vi.fn();
    const client = { responses: { create } } as unknown as OpenAI;
    const result = await new Translator(
      client,
      testConfig("/tmp/translator-test"),
    ).translate("", "English", true);
    expect(create).not.toHaveBeenCalled();
    expect(result.translatedTranscript).toBeNull();
  });
});
