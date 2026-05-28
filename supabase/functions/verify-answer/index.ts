import { makeCorsHeaders } from "../_shared/cors.ts";
import {
  extractMessageContent,
  openRouterChatCompletion,
  parseJsonObject,
  strictJsonSchema,
} from "../_shared/openrouter.ts";

/**
 * Answer Verification Loop — Post-generation validation pass
 * Uses a fast model to cross-check citations in the AI response against sourceContext.
 * Returns flagged issues (hallucinated citations, unsupported claims).
 * 
 * IMPORTANT: This is conservative — only flags clear fabrications, not legitimate
 * case references that simply weren't in the search results.
 */
const VERIFY_ANSWER_SCHEMA = strictJsonSchema("verify_answer_result", {
  type: "object",
  properties: {
    verified: { type: "boolean" },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["hallucinated_citation", "unsupported_claim", "factual_error"] },
          detail: { type: "string" },
          citation: { type: "string" },
        },
        required: ["type", "detail", "citation"],
        additionalProperties: false,
      },
    },
    repaired_text: { type: "string" },
  },
  required: ["verified", "issues", "repaired_text"],
  additionalProperties: false,
});

Deno.serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { response_text, source_context, citations } = await req.json();
    
    if (!response_text || typeof response_text !== "string") {
      return new Response(JSON.stringify({ error: "Missing response_text" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If no source context, skip verification (nothing to verify against)
    if (!source_context || source_context.trim().length < 50) {
      return new Response(JSON.stringify({ verified: true, issues: [], skipped: true, reason: "no_sources" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // Check 1: Suspicious citations (existing logic)
    // ============================================================
    const suspiciousCitations = (citations || [])
      .filter((c: any) => 
        !c.verified && 
        (c.type === "case_ref" || c.type === "rs_number" || c.type === "ecli" || c.type === "bge")
      );

    // ============================================================
    // Check 2: Factual claims — deadlines, amounts, percentages
    // Extract numbers with context from the response and cross-check against sources
    // ============================================================
    const factualClaimsRe = /(\d+[\.,]?\d*)\s*(Jahr|Monat|Woch|Tag|Prozent|%|Euro|EUR|CHF|Frist|Verjährung)/gi;
    const factualClaims: string[] = [];
    let match;
    while ((match = factualClaimsRe.exec(response_text)) !== null) {
      // Grab surrounding context (±40 chars) for the verification prompt
      const start = Math.max(0, match.index - 40);
      const end = Math.min(response_text.length, match.index + match[0].length + 40);
      factualClaims.push(response_text.slice(start, end).trim());
    }
    
    const hasFactualClaims = factualClaims.length > 0;
    // Even a single unverified case ref / RS number is a hallucination risk — flag it.
    const hasSuspiciousCitations = suspiciousCitations.length >= 1;

    // If nothing to verify, skip
    if (!hasFactualClaims && !hasSuspiciousCitations) {
      return new Response(JSON.stringify({ verified: true, issues: [], skipped: true, reason: "nothing_to_check" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build citation list for prompt
    const citationList = suspiciousCitations
      .slice(0, 8)
      .map((c: any) => `- ${c.normalized} (${c.type})`)
      .join("\n");

    // Build factual claims list for prompt
    const factualClaimsList = factualClaims
      .slice(0, 6)
      .map((c, i) => `${i + 1}. „${c}"`)
      .join("\n");

    const prompt = `Du bist ein juristischer Faktenprüfer. Prüfe die KI-Antwort gegen die bereitgestellten Quellen.

${hasSuspiciousCitations ? `## NICHT-VERIFIZIERTE ZITATIONEN:
${citationList}` : ""}

${hasFactualClaims ? `## FAKTISCHE BEHAUPTUNGEN (Fristen, Zahlen, Beträge):
${factualClaimsList}` : ""}

## QUELLEN-KONTEXT (Wahrheitsgrundlage):
${source_context.slice(0, 5000)}

## AUFGABE:
${hasSuspiciousCitations ? `1. Prüfe Zitationen: Gibt es OFFENSICHTLICH erfundene Aktenzeichen?
   - Nur KLARE Fälschungen melden (ungültiges Format, widersprüchliche Angaben)
   - Nicht im Quellen-Kontext ist bei harten Quellenangaben ein Risiko; wenn die konkrete Angabe weder in source_context noch in citation/source_map Daten steht, entferne sie.` : ""}
${hasFactualClaims ? `${hasSuspiciousCitations ? "2" : "1"}. Prüfe Fakten: Widersprechen die genannten Zahlen/Fristen den Quellen?
   - Beispiel: Antwort sagt "30 Jahre Verjährung" aber Quellen zeigen "3 Jahre" → FLAGGEN
   - Beispiel: Antwort sagt "2 Jahre Gewährleistung" und Quellen bestätigen das → OK
   - Wenn eine konkrete Zahl/Frist/Rechtsfolge nicht aus den Quellen belegbar ist, melde sie als unsupported_claim` : ""}

Wenn du Issues findest, gib in repaired_text die vollständige Antwort zurück, aber:
- erfundene harte Zitationen entfernen
- nicht belegbare Zahlen/Fristen/Beträge/Rechtsfolgen entfernen oder ausdrücklich als "nicht aus den Quellen verifiziert" kennzeichnen
- alle übrigen Formulierungen möglichst unverändert lassen

Wenn KEINE klaren Probleme: verified=true, issues=[], repaired_text="".`;

    const resp = await openRouterChatCompletion({
      messages: [
        { role: "system", content: "Du bist ein juristischer Faktenprüfer. Antworte strikt nach JSON-Schema." },
        { role: "user", content: prompt },
      ],
      responseFormat: VERIFY_ANSWER_SCHEMA,
      maxTokens: 9000,
      reasoningEffort: "low",
      requireParameters: true,
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      await resp.text();
      console.error(`[verify-answer] API error: ${resp.status}`);
      return new Response(JSON.stringify({ verified: true, issues: [], skipped: true, reason: "api_error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    try {
      const result = parseJsonObject(extractMessageContent(data));
      const issues = Array.isArray(result.issues) ? result.issues.slice(0, 3) : [];
      return new Response(JSON.stringify({
        verified: issues.length === 0,
        issues,
        repaired_text: typeof result.repaired_text === "string" ? result.repaired_text : "",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      console.warn("[verify-answer] Failed to parse verification response");
      return new Response(JSON.stringify({ verified: true, issues: [], skipped: true, reason: "parse_error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("[verify-answer] error:", e);
    return new Response(JSON.stringify({ verified: true, issues: [], skipped: true, reason: "error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
