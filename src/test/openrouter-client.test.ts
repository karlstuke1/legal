import { describe, expect, it } from "vitest";
import {
  buildOpenRouterChatBody,
  DEFAULT_EMBEDDING_MODEL,
  OPENROUTER_EMBEDDINGS_URL,
  strictJsonSchema,
} from "../../supabase/functions/_shared/openrouter";

describe("OpenRouter client helpers", () => {
  it("defaults high-stakes calls to GPT-5.5 with low reasoning", () => {
    const body = buildOpenRouterChatBody({
      messages: [{ role: "user", content: "test" }],
      reasoningEffort: "low",
    });

    expect(body.model).toBe("openai/gpt-5.5");
    expect(body.reasoning).toEqual({ effort: "low", exclude: true });
    expect(body.provider).toEqual({ require_parameters: true });
  });

  it("builds strict json_schema response formats", () => {
    const responseFormat = strictJsonSchema("test_schema", {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
      additionalProperties: false,
    });

    expect(responseFormat).toEqual({
      type: "json_schema",
      json_schema: {
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
      },
    });
  });

  it("documents the OpenRouter embeddings endpoint and default model", () => {
    expect(OPENROUTER_EMBEDDINGS_URL).toBe("https://openrouter.ai/api/v1/embeddings");
    expect(DEFAULT_EMBEDDING_MODEL).toBe("openai/text-embedding-3-small");
  });
});
