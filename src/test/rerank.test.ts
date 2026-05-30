import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rerankResults, type RerankableResult } from "../../supabase/functions/retrieval/rerank";

const mockFetch = (responseBody: unknown, ok = true) => {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok,
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody),
  } as unknown as Response);
};

const scoresBody = (scores: number[]) => ({
  choices: [{
    message: {
      content: JSON.stringify({
        scores: scores.map((score, i) => ({ index: i + 1, score, rationale: "test" })),
      }),
    },
  }],
});

describe("rerankResults", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns input unchanged when API key is missing", async () => {
    const input: RerankableResult[] = [{ title: "A" }, { title: "B" }];
    const out = await rerankResults("frage", input, "");
    expect(out).toEqual(input);
  });

  it("returns input unchanged when results are empty", async () => {
    const out = await rerankResults("frage", [], "key");
    expect(out).toEqual([]);
  });

  it("scores and re-sorts results based on LLM relevance", async () => {
    // 3 docs, model returns 3, 9, 6 → expected order [B, C, A] with relevances 0.9, 0.6, 0.3
    mockFetch(scoresBody([3, 9, 6]));
    const input: RerankableResult[] = [
      { title: "A — wenig relevant", score: 0.5 },
      { title: "B — direkt einschlägig", score: 0.5 },
      { title: "C — verwandt", score: 0.5 },
    ];
    const out = await rerankResults("Was ist Eventualvorsatz?", input, "key");
    expect(out.map((r) => r.title)).toEqual([
      "B — direkt einschlägig",
      "C — verwandt",
      "A — wenig relevant",
    ]);
    expect(out[0].relevance).toBeCloseTo(0.9);
    expect(out[1].relevance).toBeCloseTo(0.6);
    expect(out[2].relevance).toBeCloseTo(0.3);
  });

  it("keeps verified paragraph norm sources visible even when the model scores them low", async () => {
    mockFetch(scoresBody([2, 9, 8]));
    const input: RerankableResult[] = [
      {
        title: "§ 33 Finanzstrafgesetz",
        doc_ref: "§ 33 FINSTRG",
        snippet: "Verifizierte RIS-Norm: § 33 Finanzstrafgesetz",
        provider: "RIS",
        score: 0.99,
        evidence_status: "verified_document",
      },
      { title: "Rechtssatz A", snippet: "Rechtssatz RS0123456", score: 0.96 },
      { title: "Rechtssatz B", snippet: "Rechtssatz RS0654321", score: 0.96 },
    ];

    const out = await rerankResults("Was regelt § 33 FinStrG?", input, "key");

    expect(out[0].title).toBe("§ 33 Finanzstrafgesetz");
    expect(out[0].relevance).toBeCloseTo(0.98);
  });

  it("falls back to original order on malformed JSON response", async () => {
    mockFetch({
      choices: [{ message: { content: "not json garbage" } }],
    });
    const input: RerankableResult[] = [{ title: "A" }, { title: "B" }];
    const out = await rerankResults("q", input, "key");
    expect(out).toEqual(input);
  });

  it("falls back to original order on HTTP error", async () => {
    mockFetch({}, false);
    const input: RerankableResult[] = [{ title: "A" }, { title: "B" }];
    const out = await rerankResults("q", input, "key");
    expect(out).toEqual(input);
  });

  it("clamps scores to the 0–10 range", async () => {
    mockFetch(scoresBody([15, -3, 7]));
    const input: RerankableResult[] = [
      { title: "A" },
      { title: "B" },
      { title: "C" },
    ];
    const out = await rerankResults("q", input, "key");
    // Find each by title; clamping: 15→10/10=1.0, -3→0/10=0.0, 7→0.7
    const a = out.find((r) => r.title === "A")!;
    const b = out.find((r) => r.title === "B")!;
    const c = out.find((r) => r.title === "C")!;
    expect(a.relevance).toBe(1.0);
    expect(b.relevance).toBe(0.0);
    expect(c.relevance).toBeCloseTo(0.7);
  });

  it("preserves results beyond the rerank cap (25) unchanged at the tail", async () => {
    // Build 30 results, model scores the first 25.
    const input: RerankableResult[] = Array.from({ length: 30 }, (_, i) => ({
      title: `Doc ${i}`,
      score: 0.5,
    }));
    // Model returns descending scores so the order flips for the head.
    const scores = Array.from({ length: 25 }, (_, i) => 25 - i);
    mockFetch(scoresBody(scores));
    const out = await rerankResults("q", input, "key");
    expect(out).toHaveLength(30);
    // Tail (originally Doc 25..29) must remain in original order.
    expect(out.slice(25).map((r) => r.title)).toEqual([
      "Doc 25",
      "Doc 26",
      "Doc 27",
      "Doc 28",
      "Doc 29",
    ]);
    // Head is now sorted descending by relevance; Doc 0 had score 25 → top.
    expect(out[0].title).toBe("Doc 0");
  });

  it("handles a model returning fewer scores than docs without crashing (pads with 0)", async () => {
    mockFetch(scoresBody([8, 4]));
    const input: RerankableResult[] = [
      { title: "A" },
      { title: "B" },
      { title: "C", score: 0.5 },
    ];
    const out = await rerankResults("q", input, "key");
    expect(out).toHaveLength(3);
    // C gets relevance 0 (missing score) → ranks last; A (0.8) > B (0.4) > C (0)
    expect(out.map((r) => r.title)).toEqual(["A", "B", "C"]);
  });

  it("strips a markdown code fence around the JSON before parsing", async () => {
    mockFetch({
      choices: [{ message: { content: "```json\n{\"scores\":[{\"index\":1,\"score\":7,\"rationale\":\"a\"},{\"index\":2,\"score\":3,\"rationale\":\"b\"}]}\n```" } }],
    });
    const input: RerankableResult[] = [{ title: "A" }, { title: "B" }];
    const out = await rerankResults("q", input, "key");
    expect(out[0].relevance).toBeCloseTo(0.7);
    expect(out[1].relevance).toBeCloseTo(0.3);
  });

  it("uses OpenRouter GPT-5.5 with low reasoning and strict schema", async () => {
    const fetchSpy = mockFetch(scoresBody([5]));
    await rerankResults("q", [{ title: "A" }], "key");
    const body = JSON.parse((fetchSpy.mock.calls[0][1]!.body as string));
    expect(body.model).toBe("openai/gpt-5.5");
    expect(body.reasoning).toEqual({ effort: "low", exclude: true });
    expect(body.response_format?.type).toBe("json_schema");
    expect(body.provider?.require_parameters).toBe(true);
  });
});
