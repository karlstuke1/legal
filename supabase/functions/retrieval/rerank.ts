/**
 * LLM-based result re-ranking for legal-research recall.
 *
 * Background: After we merge sub-query results from RIS / FINDOK /
 * EUR-Lex / etc., we end up with 20-40 candidate documents per chat
 * turn. The existing client-side rank uses heuristics (RS-Nummer
 * present? Leitsatz keyword? snippet length?) — none of which know
 * whether the document actually answers the user's question.
 *
 * This module adds a single Flash-Lite LLM call that scores each
 * candidate's relevance to the user's question on a 0-10 scale, then
 * folds the score into a `relevance` field on the result. The client's
 * existing ranker prefers high-relevance results when building
 * `sourceContext`.
 *
 * Cost / latency budget:
 *   - One OpenRouter GPT-5.5 call with low reasoning and strict schema.
 *
 * Failure-safe: any error returns the input list unchanged. The caller
 * never sees a thrown exception.
 */
import {
  extractMessageContent,
  getOpenRouterApiKey,
  openRouterChatCompletion,
  parseJsonObject,
  strictJsonSchema,
} from "../_shared/openrouter.ts";

export interface RerankableResult {
  title?: string;
  doc_ref?: string;
  snippet?: string;
  provider?: string;
  score?: number;
  // Output: 0..1 normalized relevance score added by this module.
  relevance?: number;
}

const MAX_RERANK = 25;
const PROMPT = `Du bist ein juristischer Recherche-Assistent. Aufgabe: bewerte die Relevanz jedes Dokuments für die Nutzerfrage.

Bewertungsskala (0–10):
  10 = direkt einschlägig, beantwortet die Frage zentral
   7 = klar relevant, deckt einen wichtigen Aspekt ab
   4 = lose verwandt, evtl. Kontextinformation
   1 = inhaltlich abseitig
   0 = irrelevant / off-topic

Antworte strikt nach JSON-Schema.`;

const RERANK_SCHEMA = strictJsonSchema("rerank_result", {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          score: { type: "number" },
          rationale: { type: "string" },
        },
        required: ["index", "score", "rationale"],
        additionalProperties: false,
      },
    },
  },
  required: ["scores"],
  additionalProperties: false,
});

function buildUserPrompt(question: string, results: RerankableResult[]): string {
  const lines: string[] = [];
  lines.push(`Nutzerfrage: ${question}`);
  lines.push("");
  lines.push("Dokumente:");
  results.forEach((r, i) => {
    const title = (r.title || r.doc_ref || `Dokument ${i + 1}`).slice(0, 200);
    const snippet = (r.snippet || "").slice(0, 400);
    lines.push(`[${i + 1}] (${r.provider || "?"}) ${title}`);
    if (snippet) lines.push(`    ${snippet}`);
  });
  return lines.join("\n");
}

/**
 * Re-ranks the input list in place (returns a new array). Adds a
 * normalized `relevance` field (0..1) and sorts by it descending.
 * Caps at MAX_RERANK candidates to keep the LLM prompt bounded;
 * anything beyond the cap is appended unranked at the end.
 */
export async function rerankResults<T extends RerankableResult>(
  question: string,
  results: T[],
  apiKey = getOpenRouterApiKey() || "",
): Promise<T[]> {
  if (!question || results.length === 0 || !apiKey) return results;

  const head = results.slice(0, MAX_RERANK);
  const tail = results.slice(MAX_RERANK);

  // Manual AbortController instead of AbortSignal.timeout — the latter
  // isn't available in some test environments (jsdom).
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  let scores: number[] = [];
  try {
    const resp = await openRouterChatCompletion({
      apiKey,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: buildUserPrompt(question, head) },
      ],
      responseFormat: RERANK_SCHEMA,
      maxTokens: 2500,
      reasoningEffort: "low",
      requireParameters: true,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      await resp.text();
      return results;
    }
    const data = await resp.json();
    const parsed = parseJsonObject(extractMessageContent(data));
    if (!Array.isArray(parsed.scores)) return results;
    const byIndex = new Map<number, number>();
    for (const entry of parsed.scores) {
      const idx = Number(entry?.index);
      const score = typeof entry?.score === "number" ? entry.score : parseFloat(String(entry?.score));
      if (Number.isFinite(idx) && idx >= 1 && idx <= head.length && Number.isFinite(score)) {
        byIndex.set(idx - 1, score);
      }
    }
    scores = head.map((_r, i) => {
      const num = byIndex.get(i) ?? 0;
      if (!Number.isFinite(num)) return 0;
      return Math.max(0, Math.min(10, num));
    });
  } catch (e) {
    clearTimeout(timeoutId);
    console.warn("[rerank] failed, returning unranked:", e);
    return results;
  }

  // Apply scores. Pad with zeros if the model returned fewer than head.length.
  const ranked = head.map((r, i) => ({
    ...r,
    relevance: (scores[i] ?? 0) / 10,
  }));

  // Stable sort by relevance descending, falling back to original score.
  ranked.sort((a, b) => {
    const ra = a.relevance ?? 0;
    const rb = b.relevance ?? 0;
    if (rb !== ra) return rb - ra;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  return [...ranked, ...tail];
}
