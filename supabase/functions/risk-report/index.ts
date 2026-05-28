import { makeCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  extractMessageContent,
  openRouterChatCompletion,
  parseJsonObject,
  strictJsonSchema,
} from "../_shared/openrouter.ts";

const RISK_REPORT_SCHEMA = strictJsonSchema("risk_report", {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    overallScore: { type: "number" },
    clauses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          clause: { type: "string" },
          risk: { type: "string", enum: ["high", "medium", "low"] },
          explanation: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["clause", "risk", "explanation", "suggestion"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "summary", "overallScore", "clauses"],
  additionalProperties: false,
});

Deno.serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.length < 50) {
      return new Response(JSON.stringify({ error: "Text too short for analysis" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const response = await openRouterChatCompletion({
      messages: [
          {
            role: "system",
            content: `Du bist ein juristischer Dokumenten-Prüfer. Analysiere den Text klausel-für-klausel und erstelle einen Risikobericht.

Antworte AUSSCHLIESSLICH als valides JSON:
{
  "title": "Prüfbericht: [Dokumentenart]",
  "summary": "Kurze Gesamtbewertung (2-3 Sätze)",
  "overallScore": 0-100 (100 = kein Risiko),
  "clauses": [
    {
      "clause": "Name der Klausel oder des Abschnitts",
      "risk": "high|medium|low",
      "explanation": "Warum diese Risikobewertung (1-2 Sätze)",
      "suggestion": "Konkrete Handlungsempfehlung (1-2 Sätze)"
    }
  ]
}

Bewertungskriterien:
- HIGH: Fehlende Pflichtklauseln, unwirksame AGB-Klauseln (§§ 864a, 879 ABGB, KSchG), Haftungsrisiken, DSGVO-Verstöße, übermäßige Vertragsstrafen
- MEDIUM: Unklare Formulierungen, fehlende Definitionen, einseitige Regelungen die anfechtbar sein könnten
- LOW: Geringfügige Formfehler, verbesserungswürdige Formulierungen, Best-Practice-Empfehlungen

Maximal 12 Klauseln. Sortiere nach Risiko (hoch zuerst).`
          },
          {
            role: "user",
            content: `Analysiere dieses Dokument:\n\n${text.slice(0, 25000)}`
          }
        ],
      responseFormat: RISK_REPORT_SCHEMA,
      maxTokens: 6000,
      reasoningEffort: "high",
      requireParameters: true,
    });

    if (!response.ok) throw new Error("AI analysis failed");
    const data = await response.json();
    const parsed = parseJsonObject(extractMessageContent(data));

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[risk-report]", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
