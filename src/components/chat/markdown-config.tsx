import React from "react";
import type { Components } from "react-markdown";
import type { RetrievalResult } from "@/lib/retrieval";
import {
  normalizeRisUrl,
  buildRisSearchUrl,
  buildFallbackCitationUrl,
  findSourceUrl,
  LAW_ALIASES,
  LAW_GESETZESNUMMER,
} from "@/lib/ris-url-utils";

interface SourceGroup {
  provider: string;
  results: RetrievalResult[];
}

function isEvidentiaryResult(result: RetrievalResult): boolean {
  if (result.evidence_status === "fallback" || result.evidence_status === "search_utility") return false;
  if ((result.provider || "").toUpperCase().startsWith("RIS")) {
    return result.evidence_status === "verified_document";
  }
  return true;
}

/* Premium markdown components — Apple / Harvey aesthetic */
export const mdComponents: Components = {
  table: ({ children, ...props }) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-border/50 shadow-sm bg-card/30">
      <table className="w-full text-[13.5px]" {...props}>{children}</table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-muted/30 text-left border-b border-border/50" {...props}>{children}</thead>
  ),
  th: ({ children, ...props }) => (
    <th className="px-4 py-2.5 font-semibold text-foreground/70 text-[11px] uppercase tracking-wider whitespace-nowrap" {...props}>{children}</th>
  ),
  tr: ({ children, ...props }) => (
    <tr className="border-b border-border/20 last:border-0 transition-colors hover:bg-muted/15" {...props}>{children}</tr>
  ),
  td: ({ children, ...props }) => (
    <td className="px-4 py-3 text-foreground/85 leading-relaxed" {...props}>{children}</td>
  ),
  // Typography hierarchy intentionally tight (Harvey/Manus style): minimal
  // size deltas, no decorative borders or pills, let spacing do the work.
  h1: ({ children, ...props }) => (
    <h1 className="text-[17px] font-semibold tracking-tight text-foreground mt-7 mb-2 first:mt-0" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-[15px] font-semibold tracking-tight text-foreground mt-6 mb-2 first:mt-0" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-[14px] font-medium tracking-tight text-foreground/90 mt-5 mb-1.5" {...props}>{children}</h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="text-[13px] font-medium text-foreground/80 mt-4 mb-1" {...props}>{children}</h4>
  ),
  p: ({ children, ...props }) => (
    <p className="chat-paragraph text-[14.5px] leading-[1.85] text-foreground/80 mb-4 last:mb-0" {...props}>{children}</p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="pl-5 mb-5 space-y-1.5 text-[14.5px] leading-[1.8] text-foreground/80" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-5 mb-5 space-y-1.5 text-[14.5px] leading-[1.8] text-foreground/80 marker:text-foreground/30 marker:font-semibold" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-[14.5px] leading-[1.8] pl-1 relative before:content-['•'] before:absolute before:-left-4 before:text-foreground/30 before:font-bold [ol>&]:before:content-none" {...props}>{children}</li>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-medium text-foreground/90" {...props}>{children}</strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic text-foreground/65 not-italic font-normal" style={{ fontStyle: 'italic' }} {...props}>{children}</em>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="border-l-[3px] border-foreground/10 pl-4 py-2.5 my-5 bg-muted/20 rounded-r-xl text-foreground/65 italic text-[14px]" {...props}>{children}</blockquote>
  ),
  code: ({ children, className, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="bg-muted/50 border border-border/30 px-1.5 py-0.5 rounded-md text-[12.5px] font-mono text-foreground/85" {...props}>{children}</code>
      );
    }
    return (
      <code className={`font-mono text-[12.5px] ${className}`} {...props}>{children}</code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre className="bg-muted/30 border border-border/30 rounded-xl p-4 overflow-x-auto my-5 text-[12.5px]" {...props}>{children}</pre>
  ),
  a: ({ children, href, ...props }) => {
    // Normalize any RIS URL before rendering
    const safeHref = href ? normalizeRisUrl(href) : href;
    const childText = typeof children === "string" ? children : Array.isArray(children) ? children.map(c => typeof c === "string" ? c : "").join("") : "";
    const isRawUrl = childText.startsWith("http") && childText.length > 60;
    let displayContent: React.ReactNode = children;
    if (isRawUrl && safeHref) {
      try {
        const u = new URL(safeHref);
        const host = u.hostname.replace(/^www\./, "");
        const meaningful = u.searchParams.get("Dokumentnummer") || u.searchParams.get("Gesetzesnummer") || u.pathname.split("/").filter(Boolean).pop() || "";
        displayContent = meaningful ? `${host} — ${meaningful.slice(0, 40)}` : host;
      } catch {
        displayContent = childText.slice(0, 50) + "…";
      }
    }
    return (
      <a href={safeHref} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-[3px] decoration-foreground/30 hover:decoration-foreground/60 transition-colors duration-200 break-all" {...props}>{displayContent}</a>
    );
  },
  hr: () => <hr className="my-7 border-border/30" />,
};

/**
 * Build a footnote map: index → source info, for numbered references.
 */
export function buildFootnoteMap(sourceResults: SourceGroup[]): Map<number, { provider: string; title: string; doc_ref: string; url: string }> {
  const map = new Map<number, { provider: string; title: string; doc_ref: string; url: string }>();
  let idx = 1;
  for (const sr of sourceResults) {
    for (const r of sr.results) {
      if (r.score > 0.5 && r.url && isEvidentiaryResult(r)) {
        map.set(idx, { provider: sr.provider, title: r.title, doc_ref: r.doc_ref, url: r.url });
        idx++;
        if (idx > 12) return map;
      }
    }
  }
  return map;
}

/**
 * Pre-process AI response text:
 * 1. Convert [vgl. PROVIDER: Title ...] or [Quelle: PROVIDER – Title] into clickable markdown links
 * 2. Fix ### headings without space after # (e.g. "###Heading" → "### Heading")
 * 3. Convert inline Quelle: *...* citations into clickable links
 * 4. Convert standalone court or norm citations into clickable links
 * 5. Normalize ALL RIS URLs to canonical form
 */
export function preprocessContent(text: string, sourceResults: SourceGroup[], appendFootnotes = false): string {
  let processed = text;

  // Fix headings: ensure space after # markers
  processed = processed.replace(/^(#{1,6})([^\s#])/gm, "$1 $2");

  // UNIVERSAL RIS URL FIX: Normalize ALL RIS URLs in the raw AI text
  processed = processed.replace(
    /https?:\/\/www\.ris\.bka\.gv\.at\/[^\s)>\]]+/gi,
    (url) => normalizeRisUrl(url)
  );

  const allSources = sourceResults.flatMap(sr =>
    sr.results.filter(r => r.url && isEvidentiaryResult(r)).map(r => ({
      provider: sr.provider,
      title: r.title,
      doc_ref: r.doc_ref,
      url: r.url,
    }))
  );

  // Replace patterns like [vgl. FINDOK: Title...] or [Quelle: RIS – Title]
  processed = processed.replace(
    /\[(?:vgl\.\s*)?(?:Quelle:\s*)?(\w+)[\s:–-]+([^\]]{5,})\]/gi,
    (match, provider, titleFragment) => {
      const providerUpper = provider.toUpperCase();
      const knownProviders = ["RIS", "FINDOK", "PARLAMENT"];
      if (!knownProviders.includes(providerUpper)) return match;

      const titleLower = titleFragment.toLowerCase().replace(/\.\.\.$/, "").trim();
      const source = allSources.find(s => {
        if (s.provider.toUpperCase() !== providerUpper) return false;
        const srcTitle = (s.title || "").toLowerCase();
        const srcRef = (s.doc_ref || "").toLowerCase();
        return srcTitle.includes(titleLower.slice(0, 20)) ||
               titleLower.includes(srcTitle.slice(0, 20)) ||
               srcRef.includes(titleLower.slice(0, 15)) ||
               titleLower.includes(srcRef);
      }) || allSources.find(s => s.provider.toUpperCase() === providerUpper);

      if (source?.url) {
        const displayText = titleFragment.replace(/\[PDF\]\s*/gi, "").trim();
        const footnoteMap = buildFootnoteMap(sourceResults);
        let footnoteRef = "";
        for (const [idx, s] of footnoteMap) {
          if (s.url === source.url) {
            footnoteRef = ` [${idx}]`;
            break;
          }
        }
        return `[${providerUpper}: ${displayText}](${source.url})${footnoteRef}`;
      }
      return match;
    }
  );

  // Convert inline citations: "Quelle: *OGH 6 Ob 140/18h*" or "Quelle: *§ 75 StGB* | *OGH ...*"
  processed = processed.replace(
    /Quelle:\s*(\*[^*]+\*(?:\s*[|,·]\s*\*[^*]+\*)*)/g,
    (fullMatch, citationsStr: string) => {
      const citations = citationsStr.match(/\*([^*]+)\*/g);
      if (!citations || citations.length === 0) return fullMatch;

      const parts = citations.map(c => {
        const citText = c.replace(/^\*|\*$/g, "").trim();
        const url = findSourceUrl(citText, allSources);
        if (url) {
          return `[${citText}](${url})`;
        }
        return `*${citText}*`;
      });

      return `Quelle: ${parts.join(" | ")}`;
    }
  );

  // Convert standalone italic court or norm citations that have matching URLs
  processed = processed.replace(
    /(?<!\[)(?<!\()(\*(?:(?:OGH|VwGH|VfGH|BVwG|BFG|EuGH|RS|RIS-Justiz)[^*]{3,50}|§{1,2}[^*]{2,40})\*)(?!\]|\))/g,
    (match, italicCitation) => {
      const citText = italicCitation.replace(/^\*|\*$/g, "").trim();
      const url = findSourceUrl(citText, allSources);
      if (url) {
        return `[${citText}](${url})`;
      }
      return match;
    }
  );

  // ============================================================
  // DEFENSIVE: unwrap markdown links that the model wrapped in backticks
  // — `[Label](https://…)` renders as inline code, not as a clickable
  // link. Claude does this when the system-prompt examples show
  // citations in backticks (which we used to do); even after fixing the
  // prompt, older chats persist and the model occasionally still does
  // it. Detect the exact pattern and unwrap to a plain markdown link.
  // ============================================================
  processed = processed.replace(
    /`(\[[^\]]+?\]\(https?:\/\/[^)\s`]+\))`/g,
    "$1",
  );

  // ============================================================
  // DEFENSIVE: scrub LLM-emitted markdown links to RIS direct-document
  // URLs (NormDokument.wxe / Dokument.wxe). The model's tendency to
  // hallucinate Gesetzesnummern means we CAN'T trust any direct-doc URL
  // that wasn't built by us — Gemini in particular has shipped wrong
  // links repeatedly (e.g. "§ 33 FinStrG" → Doppelbesteuerungs-Abkommen
  // Luxemburg § 33 because the model guessed the wrong Gesetzesnummer).
  //
  // Strategy: strip the URL from any [<text>](<RIS direct-doc URL>),
  // leaving just <text>. Then the citation-rewriters below re-link the
  // plain text either via findSourceUrl (using retrieval-trusted URLs
  // from `allSources` that are STILL in scope here) or via the safe
  // search-URL fallback. Retrieved-correct URLs survive because the
  // matching source is still in allSources; hallucinated ones get
  // replaced with a RIS search of the citation text — guaranteed to
  // never point at the wrong document.
  // ============================================================
  processed = processed.replace(
    /\[([^\]]+?)\]\(https?:\/\/(?:www\.)?ris\.bka\.gv\.at\/(?:Norm)?Dokument\.wxe\?[^)]+\)/g,
    "$1",
  );

  // Inline citations must stay clickable. The balance we strike:
  //   1) If a source in retrieval matches the citation EXACTLY (by AZ, or
  //      by RS/paragraph when no AZ is present), link to that source's URL.
  //      This is the best case — direct document link.
  //   2) If no exact match, fall back to a RIS search URL for the specific
  //      Aktenzeichen / RS number / §. A real AZ resolves to the correct
  //      document on RIS; a hallucinated AZ shows an empty result page
  //      (still visibly "not found", but the user keeps a clickable link
  //      instead of dead plain text).
  // findSourceUrl is strict (PR #9) — it never cross-attributes one case's
  // URL to another case's label, so fallback to a *search* URL here is safe.

  // Paragraph/article citation shape — built once so the three regexes below
  // stay in sync. Captures common AT lawyer citation forms:
  //   "§ 1295 ABGB"
  //   "§§ 146, 147 StGB" (handled separately by COMMA_LIST_RE below)
  //   "§ 1295 Abs 1 ABGB"
  //   "§ 6 Abs 1 Z 27 lit b UStG"
  //   "§ 1295 Abs 1 Satz 2 ABGB"      ← Satz modifier
  //   "§§ 1295 ff ABGB" / "§ 75 f StGB" ← ff/f. ("folgende") suffix
  //   "§ 1295 ABGB analog"             ← "analog" stays as trailing prose
  // The ff/f. modifier and Satz subdivision are listed AFTER the law-name
  // word would have been consumed in the legacy regex — that's why
  // "§§ 1295 ff ABGB" used to capture only "§§ 1295 ff" and drop the
  // "ABGB", which broke the search-fallback URL into a 43-result list of
  // unrelated laws.
  const PARAGRAPH_RE = "§{1,2}\\s*\\d+[a-z]?" +
    "(?:\\s+Abs\\.?\\s*\\d+[a-z]?)?" +
    "(?:\\s+Z\\.?\\s*\\d+[a-z]?)?" +
    "(?:\\s+lit\\.?\\s*[a-z])?" +
    "(?:\\s+Satz\\s*\\d+)?" +
    "(?:\\s+f{1,2}\\.?)?" +
    "\\s+\\w+";
  const CASE_REF_RE = "(?:OGH|VwGH|VfGH|BVwG|BFG|EuGH)\\s+\\d+\\s*(?:Os|Ob|Ns|Bs|Ra|Ro|Bkr|Bl)\\s*\\d+\\/\\d+\\w*";
  const RS_RE = "RS\\s*\\d{7,}";
  const CITATION_ALT = `(?:${CASE_REF_RE}|${RS_RE}|${PARAGRAPH_RE})`;

  // Comma-separated paragraph list: "§§ 146, 147 StGB" or
  // "§§ 1295, 1325, 1331 ABGB". The list ends with the law abbreviation
  // (single word) which applies to ALL listed paragraphs.
  // Captures three groups: the §§-prefix, the comma-separated number list,
  // and the trailing law abbreviation.
  const COMMA_LIST_RE = /(?<!\[)(?<![\w\/=])(§{1,2})\s*(\d+[a-z]?(?:\s*,\s*\d+[a-z]?)+)\s+(\w+)(?!\])/g;

  // iVm / und / sowie / "in Verbindung mit" chains:
  //   "§ 146 iVm § 147 StGB"
  //   "§ 1295 Abs 1 iVm § 1325 ABGB"
  //   "§ 146 und § 147 StGB"
  // Two-or-more paragraphs joined by a connector, with the law abbreviation
  // at the very end applying to all paragraphs in the chain.
  const PARAGRAPH_INNER = "§{1,2}\\s*\\d+[a-z]?" +
    "(?:\\s+Abs\\.?\\s*\\d+[a-z]?)?" +
    "(?:\\s+Z\\.?\\s*\\d+[a-z]?)?" +
    "(?:\\s+lit\\.?\\s*[a-z])?" +
    "(?:\\s+Satz\\s*\\d+)?";
  const CONNECTORS_RE = "(?:iVm|i\\.V\\.m\\.|i\\.\\s*V\\.\\s*m\\.|in\\s+Verbindung\\s+mit|sowie|und)";
  const CHAIN_RE = new RegExp(
    `(?<!\\[)(?<![\\w\\/=])((?:${PARAGRAPH_INNER}\\s+${CONNECTORS_RE}\\s+)+${PARAGRAPH_INNER})\\s+(\\w+)(?!\\])`,
    "g",
  );

  // Convert plain-text Quelle: lines WITHOUT asterisks (e.g. "Quelle: OGH 6 Ob 140/18h | § 75 StGB")
  processed = processed.replace(
    new RegExp(`Quelle:\\s*(${CITATION_ALT}(?:\\s*[|,·]\\s*${CITATION_ALT})*)`, "gi"),
    (fullMatch, citationsStr: string) => {
      const parts = citationsStr.split(/\s*[|,·]\s*/).map(c => {
        const citText = c.trim();
        if (!citText) return citText;
        const url = findSourceUrl(citText, allSources);
        if (url) return `[${citText}](${url})`;
        const fallbackUrl = buildFallbackCitationUrl(citText);
        if (fallbackUrl) return `[${citText}](${fallbackUrl})`;
        return citText;
      });
      return `Quelle: ${parts.join(" | ")}`;
    }
  );

  // The lookbehind/lookahead guards on every standalone-citation rewriter
  // below need to skip TWO situations precisely:
  //  1) the citation is already inside a Markdown link "[…](…)" — guarded
  //     by `(?<!\[)` (don't re-link link text) and `(?<![\/=])` (don't
  //     match inside an existing URL's path or query)
  //  2) the citation is inside a code span — already unwrapped above.
  // Crucially we must NOT block citations that appear in regular prose
  // parens like "(Verordnung 32016R0679)" — that's how lawyers write.

  // Convert standalone plain-text RS numbers (e.g. "RS0132916") into links.
  processed = processed.replace(
    /(?<!\[)(?<![\w\/=])\b(RS\s*\d{7,})\b(?!\])/gi,
    (match, rsText) => {
      const url = findSourceUrl(rsText, allSources);
      if (url) return `[${rsText}](${url})`;
      return match;
    }
  );

  // iVm-style chains FIRST (before comma-list and before standalone) — most
  // specific pattern wins. "§ 146 iVm § 147 StGB" → split into two
  // independent links sharing the law abbreviation, with the connector
  // ("iVm") preserved as plain text between them. Without this, the first
  // § got "§ 146 iVm" as label (consuming "iVm" as the law-name slot)
  // and routed users to a useless "iVm" RIS search.
  processed = processed.replace(
    CHAIN_RE,
    (match, chainBody: string, lawAbbr: string) => {
      // Split the chainBody on the connector keywords. The split-pattern
      // mirrors CONNECTORS_RE (without anchors) so we can recover the
      // connector text to preserve it between the rendered links.
      const splitter = /\s+(iVm|i\.V\.m\.|i\.\s*V\.\s*m\.|in\s+Verbindung\s+mit|sowie|und)\s+/g;
      const parts: string[] = [];
      const connectors: string[] = [];
      let lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = splitter.exec(chainBody)) !== null) {
        parts.push(chainBody.slice(lastIndex, m.index));
        connectors.push(m[1]);
        lastIndex = splitter.lastIndex;
      }
      parts.push(chainBody.slice(lastIndex));

      // Build a link for each paragraph + the trailing law abbreviation.
      const linked = parts.map((p) => {
        const cite = `${p.trim()} ${lawAbbr}`;
        const url = findSourceUrl(cite, allSources)
          ?? buildFallbackCitationUrl(cite);
        return url ? `[${cite}](${url})` : cite;
      });

      // Reassemble: link0 connector0 link1 connector1 link2 …
      let out = linked[0];
      for (let i = 0; i < connectors.length; i++) {
        out += ` ${connectors[i]} ${linked[i + 1]}`;
      }
      return out;
    },
  );

  // Comma-list paragraphs: "§§ 146, 147 StGB" → "[§ 146 StGB] und
  // [§ 147 StGB]". Each paragraph linked individually with the shared
  // law abbreviation; rendered with commas preserved between links.
  processed = processed.replace(
    COMMA_LIST_RE,
    (match, prefix: string, numbers: string, lawAbbr: string) => {
      // Reject if the law abbreviation looks like a number-continuation
      // (defensive: "§§ 146, 147 oder" — "oder" isn't a real law abbr).
      if (/^(?:oder|sowie|und|bzw|sowie|weiterhin|samt|nebst)$/i.test(lawAbbr)) {
        return match;
      }
      const nums = numbers.split(/\s*,\s*/).map((n) => n.trim()).filter(Boolean);
      const links = nums.map((n) => {
        // Use a single § (not §§) for each individual link's label —
        // grammatically the §§-plural applies to the whole list.
        const cite = `§ ${n} ${lawAbbr}`;
        const url = findSourceUrl(cite, allSources)
          ?? buildFallbackCitationUrl(cite);
        return url ? `[${cite}](${url})` : cite;
      });
      return links.join(", ");
    },
  );

  // Convert standalone plain-text paragraph citations (e.g. "§ 29 FinStrG",
  // "§ 1295 Abs 1 ABGB", "§ 6 Abs 1 Z 27 UStG", "§ 1 Abs 1 lit a KSchG",
  // "§§ 1295 ff ABGB" with ff/Satz modifiers).
  // Lawyers cite norms in prose, numbered lists, sentences — not only in
  // "Quelle:" lines. Without this rewriter, those citations stayed as
  // plain text and the user had to manually search.
  processed = processed.replace(
    new RegExp(
      `(?<!\\[)(?<![\\w\\/=])(${PARAGRAPH_RE})(?!\\])`,
      "g",
    ),
    (match, citation) => {
      const url = findSourceUrl(citation, allSources);
      if (url) return `[${citation}](${url})`;
      const fallbackUrl = buildFallbackCitationUrl(citation);
      if (fallbackUrl) return `[${citation}](${fallbackUrl})`;
      return match;
    }
  );

  // Convert standalone plain-text OGH citations (e.g. "OGH 15 Os 11/20d") into links.
  processed = processed.replace(
    /(?<!\[)(?<![\w\/=])\b((?:OGH|VwGH|VfGH|BVwG|BFG)\s+\d+\s*(?:Os|Ob|Ns|Bs|Ra|Ro|Bkr|Bl)\s*\d+\/\d+\w*)\b(?!\])/gi,
    (match, citation) => {
      const url = findSourceUrl(citation, allSources);
      if (url) return `[${citation}](${url})`;
      return match;
    }
  );

  // EU citations — auto-link CELEX numbers and ECJ case references.
  // The AI is told to cite EU sources (DSGVO, AI Act, …) when an Austrian
  // question crosses into EU law. Until now those refs stayed plain text
  // even when retrieval had a matching EUR-Lex / Curia source — the
  // existing rewriters only handled RIS-style citations.
  //
  // CELEX shape: 5-digit year + sector letter + 4-digit number (e.g. 32016R0679).
  // We give precedence to a retrieved source URL via findSourceUrl; if
  // none matched, link directly to the canonical EUR-Lex CELEX URL — that
  // endpoint is stable and 100% deterministic from the CELEX number.
  processed = processed.replace(
    /(?<!\[)(?<![\w\/=])\b(\d{5}[A-Z]{1,2}\d{4})\b(?!\])/g,
    (match, celex) => {
      const url = findSourceUrl(celex, allSources);
      return url ? `[${celex}](${url})` : match;
    }
  );

  // ECJ / EuG case references (C-311/18, T-200/24). Curia exposes a stable
  // case-search endpoint keyed on `num=`, so the fallback is reliable.
  processed = processed.replace(
    /(?<!\[)(?<![\w\/=])\b([CT]-\d{1,4}\/\d{2})\b(?!\])/g,
    (match, caseRef) => {
      const url = findSourceUrl(caseRef, allSources);
      return url ? `[${caseRef}](${url})` : match;
    }
  );

  // Austrian BGBl. references — extremely common in legal practice
  // ("BGBl. I Nr. 60/2014", "BGBl. II 99/2023"). RIS exposes a stable
  // direct URL by year + part + number that resolves to the
  // Kundmachung document. Pattern accepts:
  //   - "BGBl." with optional period
  //   - Roman numeral I / II / III for the BGBl part (mandatory in
  //     post-2004 citations, omitted in older ones — we accept both)
  //   - Optional "Nr." prefix on the number
  //   - <number>/<year> with 4-digit year
  processed = processed.replace(
    /(?<!\[)(?<![\w\/=])\b(BGBl\.?\s*(I{1,3})?\s*(?:Nr\.?\s*)?(\d{1,4})\/(\d{4}))\b(?!\])/gi,
    (full, label: string, part: string | undefined, num: string, year: string) => {
      // Map I/II/III → 1/2/3 for the URL slug (RIS convention).
      const partNum = part === "III" ? "3" : part === "II" ? "2" : part === "I" ? "1" : "";
      // "BGBLA_2014_I_60" is the modern RIS Bgbl-Auth slug.
      const slug = partNum
        ? `BGBLA_${year}_${part}_${num}`
        : `BGBL_${year}_${num}`;
      const url = findSourceUrl(label, allSources)
        ?? `https://www.ris.bka.gv.at/Dokumente/BgblAuth/${slug}/${slug}.html`;
      return `[${label}](${url})`;
    }
  );

  // ECLI identifiers. RIS handles AT, EUR-Lex handles EU.
  // "ECLI:AT:OGH0002:2018:0060OB00140.18H.0412.000" → RIS dispatcher
  // "ECLI:EU:C:2014:317" → EUR-Lex.
  processed = processed.replace(
    /(?<!\[)(?<![\w\/=])(ECLI:[A-Z]{2}:[A-Z0-9]+:\d{4}:[A-Z0-9.]+)(?!\])/g,
    (match, ecli: string) => {
      const matched = findSourceUrl(ecli, allSources);
      return matched ? `[${ecli}](${matched})` : match;
    }
  );

  // VfGH-Slg references — the standard citation form for Austrian
  // constitutional-court decisions ("VfSlg 12345/1990", "VfSlg. 14888").
  // No deterministic direct-document URL is constructible without the
  // case date, so we fall back to a RIS Vfgh-scoped search keyed on the
  // Slg number — that page reliably surfaces the decision as the top hit.
  processed = processed.replace(
    /(?<!\[)(?<![\w\/=])\b(VfSlg\.?\s*(\d{3,5})(?:\/(\d{4}))?)\b(?!\])/g,
    (full, label: string, slgNum: string, year: string | undefined) => {
      const matched = findSourceUrl(label, allSources);
      if (matched) return `[${label}](${matched})`;
      const searchTerm = year ? `VfSlg ${slgNum}/${year}` : `VfSlg ${slgNum}`;
      const url = `https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=Vfgh&Suchworte=${encodeURIComponent(searchTerm)}`;
      return `[${label}](${url})`;
    }
  );

  // Fix broken markdown links
  processed = processed.replace(
    /\]\((https?:\/\/[^\s)]+)\)\s*\n?\(https?:\/\/[^\s)]+\)/g,
    "]($1)"
  );

  // Convert bare RIS URLs
  processed = processed.replace(
    /(\bRIS-Justiz\s+RS\d+)\(?(https:\/\/www\.ris\.bka\.gv\.at\/[^\s)]+)\)?/g,
    "[$1]($2)"
  );
  processed = processed.replace(
    /(?<!\]\()(?<!\()(https:\/\/www\.ris\.bka\.gv\.at\/Dokumente\/Justiz\/[^\s)]+)/g,
    (url) => {
      const rsMatch = url.match(/JJR_\d+_OGH\d+_(\d+OS\d+)_/i) || url.match(/JJT_\d+_OGH\d+_(\d+OS\d+)_/i);
      const label = rsMatch ? `RIS ${rsMatch[1].replace(/(\d+)(OS)(\d+)/i, "$1 $2 $3")}` : "RIS-Justiz";
      return `[${label}](${url})`;
    }
  );

  return processed;
}
