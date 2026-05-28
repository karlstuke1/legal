/**
 * Citation scrubber — last line of defense against hallucinated citations.
 *
 * The LLM is instructed to only cite from the allowlist, but it sometimes
 * ignores those instructions and emits OGH-Geschäftszahlen or RS-numbers
 * from training data that don't exist in the retrieved sources. The
 * citation engine already flags these as `fabricatedSuspects` — this
 * module deterministically rewrites the response text to remove them.
 *
 * Why this is safe to apply automatically: a citation is "fabricated"
 * only when its exact normalized form does NOT appear anywhere in the
 * sources we actually retrieved. The user can never benefit from a
 * citation they can't click through to verify, so removing it is always
 * better than leaving a plausible-looking but broken link in the answer.
 *
 * What we leave alone: general normative references (§/Art with a known
 * law abbreviation) — citation-engine.ts already excludes those from
 * `fabricatedSuspects` because they're not hallucination risks the way
 * case-numbers are.
 */
import type { ExtractedCitation } from "./citation-engine";
import type { SourceMapEntry } from "./render-source-tokens";

export interface ScrubResult {
  text: string;
  removed: ExtractedCitation[];
  /** Citations that were RE-WRITTEN to [Quelle N] tokens because they
   *  matched a real source — they're NOT in `removed`. */
  rewritten: ExtractedCitation[];
}

export type ScrubMode = "delete" | "marker";

export interface ScrubOptions {
  /**
   * What to do with fabricated citations that DON'T match any source.
   *  - "delete" (default): remove the citation + surrounding whitespace,
   *    no visible marker. Cleaner UX, used by the Harvey-style pipeline.
   *  - "marker": replace with "(unverifiziert)". Legacy behavior, kept
   *    for backward-compat tests.
   */
  mode?: ScrubMode;
  /**
   * Numbered source list (server-provided via SSE source_map event).
   * If a "fabricated" suspect's normalized form matches an entry's
   * doc_ref / title / URL, we REWRITE the suspect to a `[Quelle N]`
   * token instead of dropping it — preserves a legitimate citation
   * that the model just emitted in the wrong format.
   */
  sourceMap?: SourceMapEntry[];
}

const REPLACEMENT_LABEL = "(unverifiziert)";

// Escape a string for use in a RegExp constructor.
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove each fabricated citation from the text.
 *
 * Two-pass strategy because markdown links carry a target URL that must
 * not be touched independently of the visible text:
 *
 * Pass 1 — Markdown links `[text](url)`:
 *   Replace the ENTIRE link with "(unverifiziert)" if either the visible
 *   text OR the URL contains any suspect. Critical: never replace
 *   inside a URL while leaving the URL otherwise intact — that produces
 *   either a misleading link (correct-looking URL with scrubbed text,
 *   so the lawyer still clicks through to the bogus doc) or a broken
 *   URL with "(unverifiziert)" mid-querystring.
 *
 * Pass 2 — Plain text outside links:
 *   Replace each suspect's raw form with "(unverifiziert)".
 *
 * Examples:
 *   "[OGH 4 Ob 170/08i](https://.../JJT_..._0040OB00170_08I...)"
 *     suspect "4 Ob 170/08i" → "(unverifiziert)"
 *   "vgl. RS0034544 oben"
 *     suspect "RS0034544" → "vgl. (unverifiziert) oben"
 *   "[Verfahrenshilfe](https://ris.bka.gv.at/x) — vgl. 4 Ob 170/08i"
 *     suspect "4 Ob 170/08i" → link untouched, suspect at end replaced
 */
/**
 * Try to map a suspect's normalized form to a numbered source entry.
 * Returns the source's `[Quelle N]` token if a match is found, otherwise
 * null. Matching is lenient: we check whether the suspect text appears
 * in the source's doc_ref, title or URL (case-insensitive). This is the
 * "match-first" half of the new strategy — we want to rewrite legitimate
 * citations that the model just emitted in the wrong format, NOT delete
 * them.
 */
function tryMatchToSource(
  raw: string,
  sourceMap: SourceMapEntry[] | undefined,
): string | null {
  if (!sourceMap || sourceMap.length === 0) return null;
  const needle = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (needle.length < 3) return null;
  for (const s of sourceMap) {
    const haystack = [
      s.title || "",
      (s as any).doc_ref || "",
      s.url || "",
    ].join(" ").toLowerCase();
    if (haystack.includes(needle)) {
      return `[Quelle ${s.index}]`;
    }
  }
  return null;
}

export function scrubFabricatedCitations(
  text: string,
  suspects: ExtractedCitation[],
  opts: ScrubOptions = {},
): ScrubResult {
  if (!text || !suspects.length) return { text, removed: [], rewritten: [] };

  const mode: ScrubMode = opts.mode ?? "delete";
  const sourceMap = opts.sourceMap;

  const byRaw = new Map<string, ExtractedCitation>();
  for (const c of suspects) {
    if (!byRaw.has(c.raw)) byRaw.set(c.raw, c);
  }
  const sorted = Array.from(byRaw.values()).sort(
    (a, b) => b.raw.length - a.raw.length,
  );
  const validSuspects = sorted.filter(c => c.raw && c.raw.length >= 3);
  if (!validSuspects.length) return { text, removed: [], rewritten: [] };

  const removedRaws = new Set<string>();
  const rewrittenRaws = new Set<string>();

  const resolveReplacement = (raw: string): string => {
    // Try match against sourceMap first — keep legitimate cites alive.
    const token = tryMatchToSource(raw, sourceMap);
    if (token) {
      rewrittenRaws.add(raw);
      return token;
    }
    removedRaws.add(raw);
    return mode === "marker" ? REPLACEMENT_LABEL : "";
  };

  // Pass 1: rewrite markdown links as units. If the link target (URL) or
  // visible text contains a suspect's raw form, replace the WHOLE link.
  const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
  let scrubbed = text.replace(MD_LINK_RE, (full, linkText: string, linkUrl: string) => {
    for (const c of validSuspects) {
      if (linkText.includes(c.raw) || linkUrl.includes(c.raw)) {
        return resolveReplacement(c.raw);
      }
    }
    return full;
  });

  // Pass 2: plain-text replacement on what's left.
  for (const c of validSuspects) {
    const re = new RegExp(escapeRe(c.raw), "g");
    scrubbed = scrubbed.replace(re, () => resolveReplacement(c.raw));
  }

  // Cleanup in "delete" mode: collapse the whitespace and stray
  // grammatical residue we created by removing tokens (e.g. left-over
  // "Quelle: OGH " when only the GZ got deleted).
  if (mode === "delete") {
    const COURT_PREFIX = "(?:OGH|VwGH|VfGH|BGH|BVerfG|EuGH|BVwG|VG|LG|OLG|BAG|BSG|BFH)";
    scrubbed = scrubbed
      // "Quelle: OGH" / "Quelle: OGH | " / "Quelle: OGH | OGH | " — any
      // mix of court-prefix + pipe + whitespace residue with nothing
      // meaningful trailing. Production LLM emitted multi-cite lines
      // like "Quelle: [link1] | [link2]"; when both get scrubbed only
      // the divider residue remains.
      .replace(
        new RegExp(`\\bQuelle:(?:\\s*${COURT_PREFIX}?\\s*\\|?)+\\s*([.,;:!?]|$)`, "gm"),
        "$1",
      )
      // Bare "Quelle:" followed only by punctuation/end-of-line → drop
      .replace(/\bQuelle:\s*([.,;:!?]|$)/gm, "$1")
      .replace(/\bQuelle:\s*$/gm, "")
      // Dangling court prefix without "Quelle:" — same patterns
      .replace(
        new RegExp(`\\b${COURT_PREFIX}\\s+([|.,;:!?]|$)`, "gm"),
        "$1",
      )
      // Orphan pipe at end of a "source" line (e.g. "Quelle: ... | ")
      .replace(/\|\s*([.,;:!?]?\s*)$/gm, "$1")
      // Empty parens "( )" or "()"
      .replace(/\s+\(\s*\)/g, "")
      // Empty list items "- " at end of line
      .replace(/^[-*]\s+$/gm, "")
      // Double-spaces + leading-space punctuation
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      // Collapse runs of more than 2 blank lines
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const removed = validSuspects.filter(c => removedRaws.has(c.raw));
  const rewritten = validSuspects.filter(c => rewrittenRaws.has(c.raw));
  return { text: scrubbed, removed, rewritten };
}

/**
 * Prepend a short German-language warning banner to the assistant message so
 * the user immediately sees that something was filtered out.
 *
 * Note: we deliberately do NOT list the removed Aktenzeichen / RS-Nummern
 * in the banner text. The markdown citation-rewriter (preprocessContent)
 * would otherwise turn them into clickable RIS-search links pointing at
 * 0-Treffer pages — defeating the whole point of the scrub. The lawyer
 * locates the affected positions via the "(unverifiziert)" markers in
 * the body.
 */
export function buildScrubNotice(removed: ExtractedCitation[]): string {
  if (!removed.length) return "";
  const n = removed.length;
  const label = n === 1 ? "Zitat" : "Zitate";
  return `> ⚠️ **${n} unverifiziertes ${label} entfernt** — die KI hat ${
    n === 1 ? "ein Aktenzeichen zitiert, das" : "Aktenzeichen zitiert, die"
  } nicht in den abgerufenen Quellen vorkamen (wahrscheinlich aus Trainingsdaten). Die betroffenen Stellen sind im Text mit *(unverifiziert)* markiert. Bitte gegen RIS prüfen.\n\n`;
}

/**
 * Convenience wrapper: scrub + (optionally) prepend banner.
 *
 * In the default "delete" mode (used by the Harvey-style pipeline) no
 * banner is emitted — fabricated cites are silently removed and any
 * legitimate cites the model emitted in the wrong format are rewritten
 * to `[Quelle N]` tokens for the downstream renderer. The result is a
 * clean answer with no warning banners and no "(unverifiziert)" stubs.
 *
 * In "marker" mode (legacy / backward-compat) the old behavior is
 * preserved: fabricated cites are replaced with "(unverifiziert)" and
 * a warning banner is prepended.
 */
export function applyCitationScrub(
  text: string,
  suspects: ExtractedCitation[],
  opts: ScrubOptions = {},
): { text: string; removedCount: number; rewrittenCount: number } {
  const { text: scrubbed, removed, rewritten } = scrubFabricatedCitations(text, suspects, opts);
  if (!removed.length && !rewritten.length) {
    return { text, removedCount: 0, rewrittenCount: 0 };
  }
  const mode = opts.mode ?? "delete";
  const finalText = mode === "marker" && removed.length > 0
    ? buildScrubNotice(removed) + scrubbed
    : scrubbed;
  return {
    text: finalText,
    removedCount: removed.length,
    rewrittenCount: rewritten.length,
  };
}
