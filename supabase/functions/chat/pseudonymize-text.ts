/**
 * Inline text pseudonymization for the chat flow.
 *
 * Used by chat/index.ts when a user has `auto_pseudonymize_chat = true`
 * in their profile. Replaces personenbezogene Daten (Namen, Adressen,
 * IBAN, etc.) in the last user message with placeholders BEFORE the
 * message is forwarded to the LLM. This is the technical mitigation
 * that makes the tool defensible under RAO § 9 Verschwiegenheitspflicht
 * for Austrian lawyers using it with real Mandantendaten.
 *
 * The function calls OpenRouter GPT-5.5 with strict structured output.
 * Same entity taxonomy, same placeholder convention as file mode.
 *
 * Failure modes:
 *  - returns null when no LLM key is configured
 *  - throws on network/parse errors (caller catches and falls back to
 *    sending the original text — silent fail is the wrong default for
 *    an explicit opt-in compliance feature, the caller surfaces a
 *    warning banner)
 */
import {
  extractMessageContent,
  openRouterChatCompletion,
  parseJsonObject,
  strictJsonSchema,
} from "../_shared/openrouter.ts";

export interface PseudonymizationEntity {
  original: string;
  replacement: string;
  category: "person" | "company" | "address" | "phone" | "email" | "bank" | "date" | "other";
}

export interface PseudonymizationResult {
  pseudonymizedText: string;
  entities: PseudonymizationEntity[];
  entityCount: number;
}

const SYSTEM_PROMPT = `Du bist ein Pseudonymisierungs-Experte für deutschsprachige Rechtstexte.

Aufgabe: Ersetze im folgenden User-Eingabetext alle personenbezogenen Daten durch Platzhalter und gib die ersetzten Entitäten zurück. Behalte den Rest des Textes WORTGENAU bei (gleiche Wortwahl, gleiche Satzstruktur, gleiche Reihenfolge — du bist ein Filter, kein Editor).

Ersetzungs-Schema:
- Natürliche Personen → [Person A], [Person B], …
- Unternehmen / juristische Personen → [Unternehmen A], [Unternehmen B], …
- Adressen (Straße, Ort, PLZ) → [Adresse A], …
- Telefonnummern → [Telefon A], …
- E-Mail-Adressen → [E-Mail A], …
- Bankdaten (IBAN, BIC, Kontonummer) → [IBAN A], …
- Geburtsdaten / Personenstandsdaten → [Geburtsdatum A], …
- Sonstiges identifizierendes (Mandantennummer, Aktenzeichen einer Privatsache) → [Sonstiges A], …

WICHTIG:
- Rechtliche Entitäten (Aktenzeichen wie "OGH 6 Ob 140/18h", Paragraphen wie "§ 33 FinStrG", Gesetze wie "ABGB") NICHT ersetzen — die sind keine Mandantendaten.
- Allgemeine Berufs-/Funktionsbezeichnungen ohne Namen (z.B. "der Geschäftsführer") NICHT ersetzen.
- Gleicher Original-Wert ⇒ gleicher Platzhalter (konsistent über den ganzen Text).`;

const PSEUDONYMIZATION_SCHEMA = strictJsonSchema("pseudonymization_result", {
  type: "object",
  properties: {
    pseudonymized_text: { type: "string" },
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          replacement: { type: "string" },
          category: {
            type: "string",
            enum: ["person", "company", "address", "phone", "email", "bank", "date", "other"],
          },
        },
        required: ["original", "replacement", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["pseudonymized_text", "entities"],
  additionalProperties: false,
});

export async function pseudonymizeText(text: string): Promise<PseudonymizationResult | null> {
  if (!text) return null;

  const aiResponse = await openRouterChatCompletion({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    responseFormat: PSEUDONYMIZATION_SCHEMA,
    maxTokens: 5000,
    reasoningEffort: "high",
    requireParameters: true,
    signal: AbortSignal.timeout(8000),
  });

  if (!aiResponse.ok) {
    throw new Error(`AI gateway returned ${aiResponse.status}`);
  }

  const data = await aiResponse.json();
  const result = parseJsonObject(extractMessageContent(data)) as {
    pseudonymized_text: string;
    entities: PseudonymizationEntity[];
  };

  return {
    pseudonymizedText: result.pseudonymized_text || text,
    entities: result.entities || [],
    entityCount: (result.entities || []).length,
  };
}
