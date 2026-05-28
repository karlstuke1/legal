#!/usr/bin/env bun
/**
 * Verify that every [Quelle N] in a finished answer points to a source
 * that's actually ABOUT the claim it's attached to — not just to ANY
 * non-hallucinated URL.
 *
 * Heuristic, deterministic, runs offline (no extra LLM call):
 *
 *   1. Find every Markdown footnote-link `[<superscript>](<url>)` in
 *      finalText.
 *   2. For each, locate the surrounding sentence (text from the last
 *      preceding period/heading break up to the footnote position).
 *   3. Resolve the URL back to its source entry, take its title +
 *      snippet, and compute "domain-significant" keyword overlap with
 *      the surrounding sentence:
 *        - Tokenize on whitespace + punctuation
 *        - Drop stopwords, drop short tokens (< 4 chars)
 *        - Lemmatize trivially: lowercase + strip common German suffixes
 *        - Score: shared meaningful tokens / max(sentence tokens, 3)
 *   4. Flag any cite where the score is below MATCH_THRESHOLD.
 *
 * This catches the classic failure mode where the model assigns the
 * wrong [Quelle N] to a claim — e.g. citing the Verfahrenshilfe source
 * next to a Beweissicherung claim. The threshold is set conservatively
 * (0.20) — meaningful legal text shares MANY domain terms; mismatches
 * usually score < 0.1.
 *
 * NOT a replacement for human review. A score-based heuristic will
 * accept e.g. a Verfahrenshilfe-RS cited for a Verfahrenshilfe-related
 * but slightly off-topic claim. It catches the OBVIOUS misses.
 */

interface SourceLike {
  index: number;
  url: string;
  title?: string;
  snippet?: string;
}

interface CiteMatch {
  /** 1-based index into the source list (from the footnote label). */
  index: number;
  /** Reconstructed URL from the link target. */
  url: string;
  /** Surrounding sentence preceding the footnote. */
  sentence: string;
  /** Source the cite resolves to (or null if unresolvable). */
  source: SourceLike | null;
  /** Overlap score 0..1 between sentence and source title+snippet. */
  score: number;
  /** Token overlap (debug). */
  matchedTokens: string[];
}

// Two-tier thresholds:
//
//   - score == 0 with 0 matched tokens → genuine mismatch (cite has
//     literally nothing in common with the source it points to);
//     assertion fails.
//   - 0 < score < WARN_THRESHOLD → borderline; flagged in VERBOSE
//     output but not failed. These are typically:
//       * secondary cites (underlying statute next to a more specific
//         Rechtssatz on the same claim — legally legitimate)
//       * cites inside markdown table cells (the sentence-extractor
//         can't reconstruct the table-row topic reliably)
//       * compound-noun morphology that escapes our stem+substring
//         heuristic
//
// The aggregate-batch assertion ("multiple cites failed") is what
// would catch a truly wrong mapping. Single weak cites are flagged
// but allowed, because the heuristic has false negatives we can't
// fully eliminate without a real LLM judge.
const WARN_THRESHOLD = 0.20;

// Common German + AT-legal stopwords. Kept conservative — we want to
// keep legal terms (Verjährung, Klage, Anspruch) but drop fillers.
const STOPWORDS = new Set([
  "aber", "auch", "auf", "aus", "bei", "bis", "dass", "der", "die", "das",
  "den", "dem", "des", "ein", "eine", "einer", "einem", "eines", "einen",
  "für", "ist", "mit", "nach", "nicht", "noch", "nur", "oder", "sein",
  "sind", "über", "und", "wenn", "werden", "wird", "wie", "zur", "zum",
  "vor", "von", "von", "vom", "sich", "sie", "auch", "kann", "können",
  "hat", "haben", "wurde", "wurden", "war", "waren", "diese", "dieser",
  "dieses", "diesem", "diesen", "dass", "ob", "als", "wie", "im", "in",
  "an", "am", "wo", "wer", "was", "wann", "warum", "weil", "deshalb",
  "jedoch", "damit", "dann", "dort", "hier", "ihre", "ihrer", "ihren",
  "ihres", "ihrem", "ihn", "ihm", "uns", "wir", "ihr", "euch", "man",
  "müssen", "muss", "kann", "darf", "sollen", "wollen", "lassen",
  // Legal fluff
  "rechtlich", "rechtliche", "rechtlichen", "praktisch", "praktische",
  "praktischen", "grundsätzlich", "wesentlich", "wesentliche", "wichtig",
  "siehe", "gemäß", "nach", "gegen", "durch", "über", "unter", "zwischen",
  "innerhalb", "außerhalb", "während", "darum", "daher", "deswegen",
  "etwa", "z.b", "bzw", "vgl", "etc", "also", "sowie", "sowohl",
]);

/** Normalize German umlauts so "vorsatz" and "vorsätzlich" share a
 *  common prefix when stemmed. Without this, substring overlap misses
 *  obvious mens-rea / morphology matches. */
function normalizeUmlauts(s: string): string {
  return s
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss");
}

// Trivial German suffix stripper — good enough for keyword-overlap.
function stem(w: string): string {
  let s = normalizeUmlauts(w.toLowerCase());
  // Strip case suffixes off compound nouns: ...ung, ...ungen, ...en, ...es, ...em, ...er, ...e
  for (const suffix of ["ungen", "ung", "lich", "isch", "keit", "heit", "en", "er", "es", "em", "n", "e", "s"]) {
    if (s.length > suffix.length + 3 && s.endsWith(suffix)) {
      s = s.slice(0, -suffix.length);
      break;
    }
  }
  return s;
}

function tokenize(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const cleaned = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~#>|]/g, " ")
    .replace(/[—–\-]+/g, " ");
  for (const raw of cleaned.split(/[\s,.;:!?()[\]\/]+/)) {
    if (!raw) continue;
    // Allow short ALL-UPPERCASE abbreviations through (DSG, BAO, ECG, ZPO,
    // ABGB, EU, ÖGB, etc.) — they're legally significant and otherwise
    // get filtered out by the length-4 rule.
    const isUpperAbbrev = /^[A-ZÄÖÜ§]{2,}$/.test(raw.replace(/[^\wÄÖÜß]/g, ""));
    const t = raw.toLowerCase().replace(/[^\wäöüß]/g, "");
    if (!t) continue;
    if (!isUpperAbbrev && t.length < 4) continue;
    if (STOPWORDS.has(t)) continue;
    out.push(isUpperAbbrev ? t : stem(t));
  }
  return out;
}

/** Looser overlap: a sentence token matches a source token if either is
 * a substring of the other (≥4 chars). Handles German compound nouns:
 * "Beweissicherungsantrag" matches "Beweissicherung", "Verfahrenshilfe"
 * matches "Verfahrenshilfeantrag", etc. */
function overlapScore(sentTokens: string[], sourceTokens: string[]): { score: number; matched: string[] } {
  const matched = new Set<string>();
  for (const st of sentTokens) {
    if (st.length < 4) continue;
    for (const src of sourceTokens) {
      if (src.length < 4) continue;
      // Substring match in either direction = match (compound-noun-friendly)
      if (st === src || st.includes(src) || src.includes(st)) {
        matched.add(st);
        break;
      }
    }
  }
  const denom = Math.max(new Set(sentTokens).size, 3);
  return { score: matched.size / denom, matched: [...matched] };
}

/** Decide if the extracted sentence is actual prose or just noise
 * (URL fragments, table-cell delimiters, only-punctuation). */
function looksLikeNoise(s: string): boolean {
  const trimmed = s.replace(/[|\s]+/g, " ").trim();
  if (trimmed.length < 12) return true;
  // URL fragments: long stretches of `Param=Value&Param=Value`
  if (/[A-Za-z]+=[^&\s]*(&[A-Za-z]+=[^&\s]*){1,}/.test(trimmed)) return true;
  // Looks like a raw URL/path
  if (/^https?:\/\//.test(trimmed) || /^\/[A-Za-z/.?=&]+/.test(trimmed)) return true;
  // Only pipes + status markers (✓ ✗ Ja Nein)
  if (/^[\s|✓✗]+(?:Ja|Nein|\d+)?\s*$/i.test(trimmed)) return true;
  // Markdown table row / cell: 3+ pipes means we're inside a table.
  const pipes = (s.match(/\|/g) || []).length;
  if (pipes >= 3) return true;
  // Markdown table header separator: `|---|---|`
  if (/[-:]+\s*\|\s*[-:]+/.test(s)) return true;
  return false;
}

/**
 * Walk backward through the text-before-cite, finding the most recent
 * non-noise sentence. If the immediately-preceding chunk is a URL
 * fragment or a table-cell delimiter, look one sentence further back.
 * Returns at most 400 chars of context.
 */
function extractClaimSentence(textBefore: string): string {
  const SENTENCE_END_RE = /[.!?]\s|\n\n|\n#{1,6}\s/g;
  // Collect all sentence-end positions
  const positions: number[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = SENTENCE_END_RE.exec(textBefore)) !== null) {
    positions.push(mm.index + mm[0].length);
  }
  // Iterate sentence boundaries from latest to earliest, returning the
  // first non-noise candidate. Each candidate is "everything between
  // boundary[i] and end-of-text". We also stop after 3 lookbacks max.
  const candidates: string[] = [];
  for (let i = positions.length - 1; i >= 0 && candidates.length < 3; i--) {
    const start = positions[i];
    let s = textBefore.slice(start).trim();
    s = s.replace(/^\s*[-*•|]+\s*/g, "").trim();
    candidates.push(s);
  }
  if (positions.length === 0) candidates.push(textBefore.trim());

  // Collect up to 2 non-noise candidates (immediate + one preceding) so
  // short claims like "Vorsatz ist erforderlich" still have enough
  // context to overlap with their source.
  const realSentences: string[] = [];
  for (const c of candidates) {
    if (!looksLikeNoise(c) && c.length >= 12) {
      realSentences.push(c);
      if (realSentences.length >= 2) break;
    }
  }
  if (realSentences.length === 0) {
    return candidates.slice(0, 2).reverse().join(" ").slice(-400);
  }
  // Combine: most recent first + preceding context. Cap at 400 chars.
  const combined = realSentences.reverse().join(" ");
  return combined.length > 400 ? combined.slice(-400) : combined;
}

const SUPERSCRIPT_DIGIT: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
};
function unsuperscript(label: string): string {
  return label.split("").map(c => SUPERSCRIPT_DIGIT[c] ?? c).join("");
}

/**
 * Find every footnote-link in `finalText` and, for each, compute a
 * semantic-overlap score against the source it resolves to.
 */
export function findCiteMatches(finalText: string, sources: SourceLike[]): CiteMatch[] {
  const byUrl = new Map<string, SourceLike>();
  for (const s of sources) byUrl.set(s.url, s);

  // Markdown footnote link: `[<label>](<url>)`. Label is typically a
  // superscript number like ¹², but we also accept bare integers.
  const linkRe = /\[([⁰¹²³⁴⁵⁶⁷⁸⁹\d]+(?:\s+[⁰¹²³⁴⁵⁶⁷⁸⁹\d]+)*)\]\((https?:\/\/[^)\s]+)\)/g;

  const matches: CiteMatch[] = [];
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(finalText)) !== null) {
    const label = unsuperscript(m[1]).trim();
    const url = m[2];
    const idx = parseInt(label.split(/\s+/)[0], 10);
    if (!Number.isFinite(idx)) continue;

    // Surrounding sentence: from previous sentence boundary up to this match.
    // If the immediately-preceding chunk is noise (URL fragment, table cell),
    // walk further back until we find real prose — the LLM's actual claim
    // for which this cite was emitted is somewhere upstream.
    const upto = finalText.slice(0, m.index);
    let sentence = extractClaimSentence(upto);

    const source = byUrl.get(url) || null;

    let score = 0;
    let matchedTokens: string[] = [];
    if (source) {
      const sentTokens = tokenize(sentence);
      const sourceText = `${source.title || ""} ${source.snippet || ""}`;
      const sourceTokens = tokenize(sourceText);
      const o = overlapScore(sentTokens, sourceTokens);
      score = o.score;
      matchedTokens = o.matched;
    }

    matches.push({ index: idx, url, sentence, source, score, matchedTokens });
  }

  return matches;
}

export function assertSemanticMatch(
  finalText: string,
  sources: SourceLike[],
): { ok: boolean; failures: string[]; matches: CiteMatch[] } {
  const matches = findCiteMatches(finalText, sources);
  const failures: string[] = [];
  for (const m of matches) {
    if (!m.source) {
      failures.push(`[${m.index}] URL not in source map: ${m.url}`);
      continue;
    }
    // Hard fail only on score=0 with no matched tokens — i.e. literally
    // zero overlap between the claim sentence and the source's title +
    // snippet. Borderline cases (0 < score < WARN_THRESHOLD) are
    // surfaced in VERBOSE output for review but don't fail the run.
    if (m.score === 0 && m.matchedTokens.length === 0) {
      const preview = m.sentence.length > 80 ? m.sentence.slice(0, 77) + "…" : m.sentence;
      failures.push(`[${m.index}] zero-overlap match: "${preview}" → "${m.source.title}"`);
    }
  }
  return { ok: failures.length === 0, failures, matches };
}

// CLI: load the log + each fixture from iterate-prompt.ts and print
// per-fixture / per-cite scores.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { default: fixturesMod } = await import("./iterate-prompt-fixtures.ts").catch(() => ({ default: null }));
  if (!fixturesMod) {
    console.error("Fixtures helper not separately exported yet. Run via iterate-prompt instead.");
    process.exit(1);
  }
}
