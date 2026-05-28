/**
 * Source token renderer — the final guardrail of the Harvey-style citation
 * architecture.
 *
 * The chat function sends sources to the LLM as a numbered list and
 * instructs the model to reference them ONLY via `[Quelle N]` tokens.
 * The server emits the index→URL map as an SSE `source_map` event so the
 * frontend and backend share the exact same numbering (no score-filter
 * drift). This module takes the LLM's response text plus that map and
 * converts the tokens to clickable footnote links.
 *
 * Disobedience patterns we deliberately handle (from prod observation +
 * Plan-Agent review):
 *
 *   1. Multi-source brackets: `[Quelle 3, Quelle 5]` or `[Quellen 3 und 5]`
 *      → `[³](url-3) [⁵](url-5)`
 *   2. Parenthetical case-ref after token: `[Quelle 3] (OGH 6 Ob 140/18h)`
 *      → the parenthetical is a hallucination risk; we strip it
 *   3. Out-of-bounds index: `[Quelle 12]` when only 8 sources exist → delete
 *   4. Token inside quoted blocks: scan everywhere, no carve-outs for `"..."`
 *   5. Bare integer mentions like `[7]` standalone — we DO NOT match these
 *      (too ambiguous, could be a footnote number from the LLM itself)
 *   6. Bare source mentions: `Quelle 2` / `Quellen 2 und 4` → footnote links
 *
 * Pure function, no side effects. Easy to unit-test.
 */

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

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};

function toSuperscript(n: number): string {
  return String(n).split("").map(c => SUPERSCRIPT[c] ?? c).join("");
}

// Token pattern: `[Quelle 3]`, `[Quellen 3, 5]`, `[Quelle 3 und 5]`,
// `[Quellen 3, 5 und 7]`, also disobedience forms like
// `[Quelle 3, Quelle 5]` (model repeats the keyword). We match the
// outer brackets with at least one "Quelle"/"Quellen" keyword inside
// and let parseIndices extract every integer from the captured group.
const TOKEN_RE = /\[Quellen?\s+([^\]]+?)\]/g;
const BARE_TOKEN_RE = /(^|[\s(])Quellen?\s+(\d+(?:\s*(?:,|und)\s*\d+)*)\b/gi;

// After replacement, any parenthetical immediately following a footnote
// link that contains a case-citation shape (OGH/VwGH/VfGH Geschäftszahl,
// or a bare GZ pattern, or RS-number, or ECLI). Strip the whole
// parenthetical — it's likely a hallucination dragged along by the model
// to "decorate" the token.
const CASE_REF_IN_PARENS_RE = /(\]\([^)]+\))\s*\((?:[^)]*?)(?:\d{1,2}\s+(?:Os|Ob|Ra|Bs|Bkd|Ns|R|Rs|Ss|Ok|Nc)\s+\d+\/\d{2,4}[a-z]?|RS\d{5,}|ECLI:[A-Z]{2}:[A-Z0-9]+:\d{4}:\d+)[^)]*\)/g;

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

export function renderSourceTokens(
  text: string,
  sourceMap: SourceMapEntry[],
): RenderResult {
  if (!text) return { text: "", replaced: 0, unmapped: 0, parentheticalsStripped: 0 };

  const byIndex = new Map<number, SourceMapEntry>();
  for (const e of sourceMap || []) {
    if (e && typeof e.index === "number" && e.url) byIndex.set(e.index, e);
  }

  let replaced = 0;
  let unmapped = 0;

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
      // Markdown footnote-style link with a superscript number as the label.
      // We escape parens in the URL just in case.
      const safeUrl = entry.url.replace(/\)/g, "%29");
      pieces.push(`[${toSuperscript(i)}](${safeUrl})`);
      replaced += 1;
    }
    if (!pieces.length) return ""; // all out-of-bounds → drop entire token
    return pieces.join(" ");
  };

  let rendered = text.replace(TOKEN_RE, (_full, indicesGroup: string) => renderIndices(indicesGroup));

  rendered = rendered.replace(BARE_TOKEN_RE, (_full, prefix: string, indicesGroup: string) => {
    const renderedIndices = renderIndices(indicesGroup);
    return renderedIndices ? `${prefix}${renderedIndices}` : prefix;
  });

  // After token replacement, strip parentheticals that contain a case-ref
  // shape and immediately follow a footnote link. Pattern matches the
  // closing `](url)` plus the offending `(...)` chunk that follows.
  let parentheticalsStripped = 0;
  rendered = rendered.replace(CASE_REF_IN_PARENS_RE, (_match, linkClose: string) => {
    parentheticalsStripped += 1;
    return linkClose;
  });

  // Clean up: collapse double-spaces left behind by deletions, and remove
  // empty parentheses like " ()" if the parenthetical stripper left them.
  rendered = rendered
    .replace(/\s+\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1");

  return { text: rendered, replaced, unmapped, parentheticalsStripped };
}
