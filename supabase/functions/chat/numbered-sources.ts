/**
 * Numbered source helpers — shared by chat function (Deno) and tests (Node).
 *
 * The Harvey-style citation architecture forbids the LLM from writing any
 * concrete Aktenzeichen / RS / GZ / ECLI / URL in the answer text. The
 * model is given a numbered source list and instructed to use `[Quelle N]`
 * tokens for any reference. This module owns the canonical numbering so
 * both the prompt block and the SSE `source_map` event use exactly the
 * same indices.
 *
 * Pure TypeScript with no Deno/Node-specific imports — safe to import
 * from both supabase edge functions and Vitest tests.
 */
import { isEvidentiarySource, type SourceEvidenceStatus } from "../_shared/source-evidence.ts";

export interface NumberedSource {
  index: number;       // 1-based, unique within a single chat turn
  provider: string;
  title: string;
  url: string;
  /** RIS-Justiz reference, RS-number, ECLI, etc. — surfaced to the
   *  scrubber as a fallback match target, NEVER shown to the LLM. */
  doc_ref?: string;
  evidence_status?: SourceEvidenceStatus;
  /** Truncated snippet text. Optional. */
  snippet?: string;
}

export interface SourceMapEntry {
  index: number;
  provider: string;
  title: string;
  url: string;
  /** Kept out of the LLM prompt but sent to the scrubber for exact matching. */
  doc_ref?: string;
  evidence_status?: SourceEvidenceStatus;
}

export interface SourceItem {
  provider?: string;
  title?: string;
  url?: string;
  source_url?: string;
  doc_ref?: string;
  date?: string;
  doc_date?: string;
  pinpoint?: string;
  snippet?: string;
  content?: string;
  score?: number;
  relevance?: number;
  evidence_status?: SourceEvidenceStatus;
}

const SNIPPET_BUDGET = 600;

/**
 * Strip citation identifiers (RS-numbers, OGH/VwGH-style Geschäftszahlen,
 * ECLI) from a string. The LLM otherwise copies them verbatim out of the
 * INHALT block or the title and bypasses the [Quelle N] discipline.
 * We're aggressive here: snippet bodies and titles routinely reference
 * older cases, and those cross-refs are exactly what the model picks up
 * to "decorate" its answer. Replacing them with a generic marker keeps
 * the surrounding text intact (legal reasoning, statute refs, dates)
 * without leaking citation tokens the model can repeat.
 */
export function stripCitationTokens(text: string): string {
  if (!text) return text;
  return text
    .replace(/\bRS\d{5,}\b/gi, "[…]")
    .replace(/\b\d{1,2}\s+(?:Os|Ob|Ra|Bs|Bkd|Ns|R|Rs|Ss|Ok|Nc)\s+\d+\/\d{2,4}[a-z]?\b/g, "[…]")
    .replace(/\bECLI:[A-Z]{2}:[A-Z0-9]+:\d{4}:\d+/g, "[…]")
    .replace(/\b\d{5}[A-Z]{1,2}\d{4}\b/g, "[…]"); // CELEX
}

export function buildNumberedSourceBlock(sources: NumberedSource[]): string {
  if (!sources || sources.length === 0) return "";
  const lines: string[] = [];
  lines.push("## QUELLEN — du darfst NUR via [Quelle N] auf diese verweisen");
  lines.push("");
  for (const s of sources) {
    // Strip RS/GZ from title so the model can't copy them out.
    const cleanTitle = stripCitationTokens(s.title).replace(/\s+/g, " ").trim();
    lines.push(`[Quelle ${s.index}] [${s.provider}] ${cleanTitle || "Dokument"}`);
    if (s.snippet && s.snippet.length > 0) {
      // Strip RS/GZ from snippet body too — cross-references in
      // Rechtssatz bodies are the most common leak vector.
      const cleanSnippet = stripCitationTokens(s.snippet);
      const trimmed = cleanSnippet.length > SNIPPET_BUDGET
        ? cleanSnippet.slice(0, SNIPPET_BUDGET) + "…"
        : cleanSnippet;
      lines.push(`   INHALT: ${trimmed.replace(/\n+/g, " ").trim()}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Strict, short citation rule block. Replaces the old ~60-line
 * "Citation-Density-Pflicht" + "Quellenarbeit" sections.
 */
export function buildCitationRuleBlock(): string {
  return `## Quellenangaben — STRIKT NUMMERIERT

Du darfst KEINE Aktenzeichen (z.B. "6 Ob 140/18h"), RS-Nummern (z.B. "RS0094010"), ECLI-Identifier, CELEX-Nummern, URLs oder Markdown-Links im Antworttext schreiben.

Verwende AUSSCHLIESSLICH:
- [Quelle 1], [Quelle 2], … für Quellenverweise auf die nummerierte Liste oben
- § / Art für Normen (z.B. § 1497 ABGB, Art. 6 DSGVO) — diese sind keine Halluzinationsrisiken

VERBOTEN:
- "OGH 6 Ob 140/18h" (Aktenzeichen)
- "RS0034544" (Rechtssatznummer)
- "ECLI:AT:OGH..." oder "32016R0679"
- "[OGH X](https://ris...)" (Markdown-Link)
- Jede URL im Antworttext

ERLAUBT:
- "Die Verjährung tritt nach drei Jahren ein [Quelle 2]."
- "Vgl. § 1497 ABGB [Quelle 1]."
- "Mehrere Quellen stützen das [Quellen 2, 5]."
- "Vgl. ständige Rechtsprechung" wenn keine konkrete Quelle passt

Wenn eine Quelle in der nummerierten Liste als "Rechtssatz:" oder "Leitsatz:" erkennbar ist und die Nutzerfrage unmittelbar beantwortet, gib diese Kernaussage am Anfang der Antwort wörtlich oder nahezu wörtlich wieder und belege sie mit [Quelle N]. Schreibe dabei weiterhin KEINE RS-Nummer, Geschäftszahl, ECLI oder URL in den Antworttext.

Wenn KEINE passende Quelle in der Liste ist: schreibe "vgl. ständige Rechtsprechung" oder lass die Quellenangabe weg. Das ist immer besser als ein erfundenes Zitat.`;
}

/**
 * Reduce a NumberedSource to the lean SourceMapEntry shape that gets
 * emitted to the frontend via SSE source_map event. Drops snippet content
 * (large), but keeps doc_ref for the deterministic citation scrubber.
 */
export function toSourceMapEntry(s: NumberedSource): SourceMapEntry {
  return { index: s.index, provider: s.provider, title: s.title, url: s.url, doc_ref: s.doc_ref, evidence_status: s.evidence_status };
}

export function buildNumberedSourcesFromItems(items: SourceItem[] | undefined, startIndex = 1): NumberedSource[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const out: NumberedSource[] = [];
  let idx = startIndex;
  for (const item of items) {
    if (!item) continue;
    const url = item.url || item.source_url || "";
    if (!url) continue;
    if (!isEvidentiarySource(item)) continue;
    const snippet = item.snippet || item.content || "";
    out.push({
      index: idx++,
      provider: item.provider || "SOURCE",
      title: item.title || item.doc_ref || "Ohne Titel",
      url,
      doc_ref: item.doc_ref,
      evidence_status: "verified_document",
      snippet,
    });
  }
  return out;
}

/**
 * Parse the existing text-blob sourceContext that the frontend already
 * sends (legacy format like `[RIS] Title | Ref: 6 Ob X | URL: ...`)
 * and turn it into a numbered list. Used during the transition while
 * the frontend still sends the old format.
 *
 * Each top-level entry is separated by a blank line. We extract
 * provider, title, ref, url, and snippet (INHALT).
 */
export function parseLegacySourceContext(sourceContext: string, startIndex = 1): NumberedSource[] {
  if (!sourceContext || sourceContext.trim().length === 0) return [];
  const headerRe = /(?:^|\n)\s*(?:[-*]\s*)?\[([^\]]+)\]\s+(.+?)(?=\s*\||\n|$)/g;
  const matches = Array.from(sourceContext.matchAll(headerRe));
  if (matches.length === 0) return [];

  const sources: NumberedSource[] = [];
  let idx = startIndex;

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const nextMatch = matches[i + 1];
    const blockStart = match.index ?? 0;
    const blockEnd = nextMatch?.index ?? sourceContext.length;
    const block = sourceContext.slice(blockStart, blockEnd).trim();
    const provider = match[1].trim();
    const title = match[2].trim();

    const refMatch = block.match(/(?:^|\s)Ref:\s*([^|\n]+?)(?=\s*\||\n|$)/);
    const urlMatch = block.match(/(?:^|\s)URL:\s*(https?:\/\/[^\s|\n]+)/);
    const inhaltMatch = block.match(/INHALT[^:]*:\s*([\s\S]+?)$/i);
    const candidate = {
      provider,
      title,
      url: urlMatch ? urlMatch[1].trim() : "",
      doc_ref: refMatch ? refMatch[1].trim() : undefined,
    };
    if (!candidate.url || !isEvidentiarySource(candidate)) continue;

    sources.push({
      index: idx++,
      provider,
      title,
      url: candidate.url,
      doc_ref: candidate.doc_ref,
      evidence_status: "verified_document",
      snippet: inhaltMatch ? inhaltMatch[1].trim() : undefined,
    });
  }

  return sources;
}

/**
 * Take tool-found sources (from search_law / lookup_norm / etc.) and
 * convert them to NumberedSource entries, continuing the numbering from
 * `startIndex`. Tool sources come in raw shape with `provider`, `title`,
 * `url`, `doc_ref`, `snippet` fields.
 */
export function appendToolFoundSources(
  toolSources: Array<{ provider?: string; source_provider?: string; title?: string; url?: string; source_url?: string; doc_ref?: string; snippet?: string; content?: string; evidence_status?: SourceEvidenceStatus }>,
  startIndex: number,
): NumberedSource[] {
  if (!toolSources || toolSources.length === 0) return [];
  const out: NumberedSource[] = [];
  let idx = startIndex;
  for (const t of toolSources) {
    const url = t?.url || t?.source_url || "";
    if (!t || !url) continue;
    if (!isEvidentiarySource(t)) continue;
    out.push({
      index: idx++,
      provider: t.provider || t.source_provider || "TOOL",
      title: t.title || "Ohne Titel",
      url,
      doc_ref: t.doc_ref,
      evidence_status: "verified_document",
      snippet: t.snippet || t.content,
    });
  }
  return out;
}

/**
 * Dedupe a numbered source list by URL (preserve earliest index for each
 * URL). Used after merging initial + tool-found sources to avoid the
 * same RIS document appearing twice with different [Quelle N] tokens.
 */
export function dedupeNumberedSources(sources: NumberedSource[]): NumberedSource[] {
  const seenUrls = new Set<string>();
  const out: NumberedSource[] = [];
  for (const s of sources) {
    const key = (s.url || "").toLowerCase();
    if (key && seenUrls.has(key)) continue;
    if (key) seenUrls.add(key);
    out.push(s);
  }
  // Re-number 1..N to close any gaps the dedupe created.
  return out.map((s, i) => ({ ...s, index: i + 1 }));
}
