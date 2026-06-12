/**
 * Source token renderer — the final guardrail of the Harvey-style citation
 * architecture.
 *
 * The chat function sends sources to the LLM as a numbered list and
 * instructs the model to reference them ONLY via `[Quelle N]` tokens.
 * The server emits the index→URL map as an SSE `source_map` event so the
 * frontend and backend share the exact same numbering (no score-filter
 * drift). This module takes the LLM's response text plus that map and
 * converts the tokens to inline citation links: the visible label is the
 * real, verified citation from the source map (RS number, Aktenzeichen,
 * § norm, …), never something the model wrote itself.
 *
 *   `… tritt nach drei Jahren ein [Quelle 2].`
 *     → `… tritt nach drei Jahren ein ([RS0034949](url)).`
 *
 * Disobedience patterns we deliberately handle (from prod observation +
 * Plan-Agent review):
 *
 *   1. Multi-source brackets: `[Quelle 3, Quelle 5]` or `[Quellen 3 und 5]`
 *      → one paren group: `([label-3](url-3); [label-5](url-5))`
 *   2. Parenthetical case-ref after token: `[Quelle 3] (OGH 6 Ob 140/18h)`
 *      → the parenthetical is a hallucination risk; we strip it
 *   3. Out-of-bounds index: `[Quelle 12]` when only 8 sources exist → delete
 *   4. Token inside quoted blocks: scan everywhere, no carve-outs for `"..."`
 *   5. Bare integer mentions like `[7]` standalone — we DO NOT match these
 *      (too ambiguous, could be a footnote number from the LLM itself)
 *   6. Bare source mentions: `Quelle 2` / `Quellen 2 und 4` → label links
 *      without wrapper parens (they are prose references, not citations)
 *   7. Token already inside parens: `([Quelle 2])` / `(vgl. [Quelle 2])`
 *      → no second paren wrapper
 *
 * Pure function, no side effects. Easy to unit-test.
 */

import { formatSourceCitationLabel } from "./ris-url-utils";

export interface SourceMapEntry {
  index: number;      // 1-based
  url: string;
  title?: string;
  provider?: string;
  doc_ref?: string;
  evidence_status?: "verified_document" | "search_utility" | "fallback";
}

export interface RenderResult {
  text: string;
  /** Token instances that resolved to a real URL */
  replaced: number;
  /** Token instances dropped because the index was out of bounds */
  unmapped: number;
  /** Parenthetical case-refs stripped after a token */
  parentheticalsStripped: number;
}

export interface RenderOptions {
  /**
   * Rewrite bare `Quelle 2` prose mentions too (default true). Disabled
   * during streaming, where a trailing bare mention may still be growing.
   */
  bareMentions?: boolean;
}

// Token pattern: `[Quelle 3]`, `[Quellen 3, 5]`, `[Quelle 3 und 5]`,
// `[Quellen 3, 5 und 7]`, also disobedience forms like
// `[Quelle 3, Quelle 5]` (model repeats the keyword). We match the
// outer brackets with at least one "Quelle"/"Quellen" keyword inside
// and let parseIndices extract every integer from the captured group.
const TOKEN_RE = /\[Quellen?\s+([^\]]+?)\]/g;
const BARE_TOKEN_RE = /(^|[\s(])Quellen?\s+(\d+(?:\s*(?:,|und)\s*\d+)*)\b/gi;

// After replacement, any parenthetical that contains a case-citation shape
// (OGH/VwGH/VfGH Geschäftszahl, or a bare GZ pattern, or RS-number, or
// ECLI) and immediately follows a rendered citation. Strip the whole
// parenthetical — it's likely a hallucination dragged along by the model
// to "decorate" the token. Two shape notes:
//   - the leading group tolerates one extra `)` so it also matches right
//     after our own `([label](url))` wrapper, and
//   - the callback must SKIP parentheticals that contain a markdown link
//     (`](`) — those are our own rendered citations, whose labels
//     legitimately contain case-ref shapes.
const CASE_REF_IN_PARENS_RE = /(\]\([^)]+\)\)?)\s*(\((?:[^)]*?)(?:\d{1,2}\s+(?:Os|Ob|Ra|Bs|Bkd|Ns|R|Rs|Ss|Ok|Nc)\s+\d+\/\d{2,4}[a-z]?|RS\d{5,}|ECLI:[A-Z]{2}:[A-Z0-9]+:\d{4}:\d+)[^)]*\))/g;

function parseIndices(group: string): number[] {
  // Pull every positive integer out of the captured group, in order.
  // Accepts: "3" | "3, 5" | "3 und 5" | "3, 5 und 7" | "3,5,7" |
  // "3, Quelle 5" | "Quelle 3 und Quelle 5" (disobedience forms).
  const seen = new Set<number>();
  const out: number[] = [];
  for (const m of group.matchAll(/\d+/g)) {
    const n = parseInt(m[0], 10);
    if (Number.isFinite(n) && n > 0 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/**
 * Is the [start, end) range already enclosed in parentheses? Window-limited
 * scan against the ORIGINAL text (replace callbacks see pre-replacement
 * offsets): an unmatched `(` shortly before AND an unmatched `)` shortly
 * after count as enclosing.
 */
const PAREN_SCAN_WINDOW = 120;

function isInsideParens(text: string, start: number, end: number): boolean {
  let closes = 0;
  let openBefore = false;
  for (let i = start - 1; i >= 0 && i >= start - PAREN_SCAN_WINDOW; i--) {
    const ch = text[i];
    if (ch === ")") closes++;
    else if (ch === "(") {
      if (closes > 0) closes--;
      else { openBefore = true; break; }
    }
  }
  if (!openBefore) return false;

  let opens = 0;
  for (let i = end; i < text.length && i <= end + PAREN_SCAN_WINDOW; i++) {
    const ch = text[i];
    if (ch === "(") opens++;
    else if (ch === ")") {
      if (opens > 0) opens--;
      else return true;
    }
  }
  return false;
}

export function renderSourceTokens(
  text: string,
  sourceMap: SourceMapEntry[],
  opts: RenderOptions = {},
): RenderResult {
  if (!text) return { text: "", replaced: 0, unmapped: 0, parentheticalsStripped: 0 };
  const bareMentions = opts.bareMentions !== false;

  const byIndex = new Map<number, SourceMapEntry>();
  for (const e of sourceMap || []) {
    if (e && typeof e.index === "number" && e.url) byIndex.set(e.index, e);
  }

  let replaced = 0;
  let unmapped = 0;

  // Render the indices of one token as `[label](url)` pieces joined by "; ".
  const renderIndices = (indicesGroup: string) => {
    const indices = parseIndices(indicesGroup);
    if (!indices.length) return "";
    const pieces: string[] = [];
    for (const i of indices) {
      const entry = byIndex.get(i);
      if (!entry) {
        unmapped += 1;
        continue;
      }
      // We escape parens in the URL so the markdown link survives both the
      // wrapper parens and the parenthetical stripper below.
      const safeUrl = entry.url.replace(/\)/g, "%29");
      pieces.push(`[${formatSourceCitationLabel(entry)}](${safeUrl})`);
      replaced += 1;
    }
    if (!pieces.length) return ""; // all out-of-bounds → drop entire token
    return pieces.join("; ");
  };

  let rendered = text.replace(
    TOKEN_RE,
    (full: string, indicesGroup: string, offset: number) => {
      const body = renderIndices(indicesGroup);
      if (!body) return "";
      // Citation style: wrap in parens — unless the model already put the
      // token inside parens ("([Quelle 2])", "(vgl. [Quelle 2])").
      return isInsideParens(text, offset, offset + full.length) ? body : `(${body})`;
    },
  );

  if (bareMentions) {
    rendered = rendered.replace(BARE_TOKEN_RE, (_full, prefix: string, indicesGroup: string) => {
      const renderedIndices = renderIndices(indicesGroup);
      return renderedIndices ? `${prefix}${renderedIndices}` : prefix;
    });
  }

  // After token replacement, strip parentheticals that contain a case-ref
  // shape and immediately follow a rendered citation — but never our own
  // rendered citations (they contain a markdown link).
  let parentheticalsStripped = 0;
  rendered = rendered.replace(
    CASE_REF_IN_PARENS_RE,
    (full: string, linkClose: string, parenChunk: string) => {
      if (/\]\(/.test(parenChunk)) return full;
      parentheticalsStripped += 1;
      return linkClose;
    },
  );

  // Clean up: collapse double-spaces left behind by deletions, and remove
  // empty parentheses like " ()" if the parenthetical stripper left them.
  rendered = rendered
    .replace(/\s+\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1");

  return { text: rendered, replaced, unmapped, parentheticalsStripped };
}

/**
 * Streaming-safe variant: renders completed `[Quelle N]` tokens in a
 * partial response while holding back a trailing, still-growing token
 * fragment ("… nach drei Jahren ein [Quel"). Bare mentions stay untouched
 * (a trailing "Quelle 2" might still become "Quelle 23"). The held-back
 * fragment is dropped from the visible text — the next delta completes it.
 */
export function renderStreamingSourceTokens(
  text: string,
  sourceMap: SourceMapEntry[],
): string {
  if (!text) return "";
  const lastOpen = text.lastIndexOf("[");
  const visible = lastOpen > text.lastIndexOf("]") ? text.slice(0, lastOpen) : text;
  return renderSourceTokens(visible, sourceMap, { bareMentions: false }).text;
}
