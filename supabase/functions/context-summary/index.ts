import { makeCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractMessageContent, openRouterChatCompletion } from "../_shared/openrouter.ts";

/**
 * context-summary: Summarizes old chat messages into a concise structured context
 * using a lightweight LLM call. This replaces the naive rule-based truncation.
 * 
 * Input: { messages: { role: string; content: string }[] }
 * Output: { summary: string }
 */
Deno.serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Authenticate
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ summary: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap input to prevent abuse: max 30 messages, max 500 chars each
    const capped = messages.slice(0, 30).map((m: { role: string; content: string }) => ({
      role: m.role,
      content: (m.content || "").slice(0, 500),
    }));

    // Build a compact transcript for the LLM
    const transcript = capped.map((m: { role: string; content: string }) => {
      const label = m.role === "user" ? "NUTZER" : m.role === "assistant" ? "ASSISTENT" : "SYSTEM";
      return `[${label}]: ${m.content}`;
    }).join("\n\n");

    const systemPrompt = `Du bist ein juristischer Kontext-Komprimierer. Deine Aufgabe ist es, einen Gesprächsverlauf zwischen einem Nutzer und einem juristischen KI-Assistenten in eine kompakte, strukturierte Zusammenfassung zu verdichten.

## Ausgabeformat (STRIKT einhalten)

[KONTEXT-ZUSAMMENFASSUNG]

**Thema:** [1 Satz: Worum geht es?]

**Rechtsfragen:**
- [Frage 1]
- [Frage 2]

**Bisherige Ergebnisse:**
- [Ergebnis/Schlussfolgerung 1]
- [Ergebnis/Schlussfolgerung 2]

**Referenzierte Normen:** [§ 1295 ABGB, RS0094010, Art. 6 DSGVO, ...]

**Offene Punkte:** [Was wurde noch nicht beantwortet?]

## Regeln
1. Maximal 400 Wörter
2. ALLE genannten Paragraphen, RS-Nummern, ECLI-Nummern, Aktenzeichen und Gesetze MÜSSEN in "Referenzierte Normen" aufgelistet werden — nichts weglassen
3. Konkrete Rechtsergebnisse des Assistenten bewahren (z.B. "Verjährungsfrist beträgt 3 Jahre gemäß § 1489 ABGB")
4. Keine neuen Informationen erfinden
5. Jurisdiktion benennen (AT)`;

    const response = await openRouterChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Fasse den folgenden Gesprächsverlauf zusammen:\n\n${transcript}` },
      ],
      maxTokens: 1024,
      temperature: 0.1,
      reasoningEffort: "low",
      requireParameters: true,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[context-summary] AI gateway error:", response.status, errText);
      // Fallback: return empty summary so the caller can use rule-based fallback
      return new Response(JSON.stringify({ summary: "", error: "ai_error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const summary = extractMessageContent(data);

    console.log(`[context-summary] Summarized ${messages.length} messages into ${summary.length} chars`);

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[context-summary] Error:", e);
    return new Response(JSON.stringify({ summary: "", error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 200, // Return 200 so caller can gracefully fallback
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
