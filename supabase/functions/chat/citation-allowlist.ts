/**
 * Citation allowlist extraction
 *
 * Scans retrieved-source text (formatted tool output or pre-baked
 * sourceContext) for the citation tokens we permit the model to quote:
 * explicit "Ref: ..." markers, RS numbers, OGH/VwGH-style GZ, ECLI ids,
 * and paragraph/article references with a law abbreviation.
 *
 * LEGACY: kept for regression tests and possible migration tooling. The
 * live chat prompt no longer injects concrete citation allowlists; it uses
 * numbered `[Quelle N]` sources from `numbered-sources.ts` so the LLM never
 * sees RS/GZ/ECLI/CELEX tokens it could copy into the answer.
 *
 * Pure TypeScript with no runtime dependencies, so it imports cleanly into
 * both the Deno edge function and Node-based vitest tests.
 */

const REF_MARKER_RE = /(?:^|\s)Ref:\s*([^|\n]+?)(?=\s*\||\n|$)/gm;
const RS_NUMBER_RE = /\bRS\d{5,}\b/gi;
const GZ_RE = /\b\d{1,2}\s+(?:Os|Ob|Ra|Bkd|Bs|Ns|R|Rs|Ss|Ok|Nc)\s+\d+\/\d{2,4}[a-z]?\b/g;
const ECLI_RE = /ECLI:[A-Z]{2}:[A-Z0-9]+:\d{4}:\d+/gi;
const PARAGRAPH_RE = /§§?\s*\d+[a-z]?(?:\s+Abs\.?\s*\d+)?\s+[A-ZÄÖÜ][\wÄÖÜäöüß-]+/g;
const ARTICLE_RE = /Art\.?\s*\d+(?:\s+Abs\.?\s*\d+)?\s+[A-ZÄÖÜ][\wÄÖÜäöüß-]+/g;

const ALLOWLIST_CAP = 60;

// Tokens we sometimes use as `Ref: <provider>` fallback markers in formatted
// tool output when no real citation is known. Accepting them as allowlist
// entries would let the LLM believe it can cite "RIS" or "FINDOK" as a
// source — weakening the entire guard. Filter them out at extraction time.
const REF_BLOCKLIST = new Set([
  "ris", "findok", "parlament", "curia", "eur-lex", "eurlex",
  "rechtsinformationssystem", "ogh", "vwgh", "vfgh", "bgh", "bverfg",
  "quelle", "source", "unbekannt", "n/a", "na", "tbd", "todo",
]);

export function extractCitationAllowlist(text: string | undefined | null): string[] {
  if (!text || typeof text !== "string") return [];
  const found = new Set<string>();
  const add = (s: string) => {
    const v = s.trim().replace(/\s+/g, " ");
    if (v.length <= 1 || v.length > 80) return;
    if (REF_BLOCKLIST.has(v.toLowerCase())) return;
    found.add(v);
  };

  for (const m of text.matchAll(REF_MARKER_RE)) {
    if (m[1]) add(m[1]);
  }
  for (const m of text.matchAll(RS_NUMBER_RE)) {
    add(m[0].toUpperCase());
  }
  for (const m of text.matchAll(GZ_RE)) {
    add(m[0]);
  }
  for (const m of text.matchAll(ECLI_RE)) {
    add(m[0]);
  }
  for (const m of text.matchAll(PARAGRAPH_RE)) {
    add(m[0]);
  }
  for (const m of text.matchAll(ARTICLE_RE)) {
    add(m[0]);
  }

  return Array.from(found).slice(0, ALLOWLIST_CAP);
}

export function buildAllowlistBlock(allowlist: string[]): string {
  if (!allowlist.length) {
    // No retrieval hits at all → still emit a hard prohibition block so
    // the model doesn't quietly fall back to training-data citations.
    // This is the case that triggered the "halluzinierte RS-Nummern"
    // user complaint (2026-04-30): retrieval missed a brand-new
    // RS-number from March 2026 because keyword extraction was too
    // narrow, allowlist was empty, and Claude filled the gap with
    // 4 fabricated RS-numbers from training data.
    return `\n\n### ZITAT-ALLOWLIST — KEINE QUELLEN ABRUFBAR
Die Tool-Suche hat KEINE konkreten Fundstellen geliefert. Das bedeutet
nicht, dass du auf Trainingswissen zurückgreifen darfst — im Gegenteil:

- **VERBOTEN:** Konkrete Aktenzeichen (z.B. "OGH 2 Ob 72/10k"),
  RS-Nummern, CELEX-Nummern, NJW-Fundstellen aus dem Trainingswissen.
- **VERBOTEN:** "vgl. OGH ..." mit erfundener Geschäftszahl.
- **ERLAUBT:** Allgemein bekannte Normen (z.B. § 1295 ABGB, Art. 6 DSGVO).
- **ERLAUBT:** "vgl. ständige Rechtsprechung" / "vgl. stRsp" als
  Quellenangabe ohne konkrete Nummer.
- **ERLAUBT:** Markiere unverifizierte Aussagen mit "⚠️ nicht verifiziert".

BESSER eine kurze Antwort ohne Aktenzeichen als eine lange Antwort mit
halluzinierten Nummern. Der User wird die Aktenzeichen prüfen — und
wenn sie falsch sind, ist das Vertrauen in das gesamte Tool dahin.`;
  }
  return `\n\n### ZITAT-ALLOWLIST — VERBINDLICH
Du darfst AUSSCHLIESSLICH die folgenden Fundstellen als Aktenzeichen-, RS-Nummer- oder Norm-Quelle nennen. Jede andere Aktenzeichen/RS-Nummer/Norm-Fundstelle — auch wenn sie dir aus dem Trainingswissen bekannt erscheint — ist VERBOTEN.

${allowlist.map((c) => `- ${c}`).join("\n")}

**Hinweis zur Aktualität:** Diese Liste ist die einzige Quelle der Wahrheit für konkrete Fundstellen in dieser Antwort. RS-Nummern und Geschäftszahlen aus deinem Trainingswissen können veraltet, falsch zugeordnet oder von neueren Entscheidungen überholt sein — gerade bei aktuellen Rechtsfragen aus 2025/2026. Selbst wenn du eine Entscheidung "kennst", erfinde keine Nummer dafür.

Wenn keine passende Fundstelle in dieser Liste ist: schreibe "vgl. ständige Rechtsprechung" oder lass die konkrete Quellenangabe weg. Das ist immer besser als ein erfundenes Zitat.`;
}
