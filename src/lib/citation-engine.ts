/**
 * Citation Engine — Anti-Hallucination Layers 3-6
 * 
 * Layer 3: Citation Extraction (regex parser)
 * Layer 4: Citation Verification (against source context)
 * Layer 5: Source Highlighting (match response passages to sources)
 * Layer 6: Confidence Score (0-100%)
 */

// ============================================================
// Layer 3: Citation Extraction
// ============================================================

export interface ExtractedCitation {
  type: "paragraph" | "rs_number" | "case_ref" | "ecli" | "bge" | "article" | "celex" | "njw";
  raw: string;
  normalized: string;
  jurisdiction: "AT" | "DE" | "CH" | "EU" | "unknown";
  verified: boolean;
  verificationSource?: string;
}

/**
 * Extract all legal citations from AI response text using regex patterns.
 */
export function extractCitations(text: string): ExtractedCitation[] {
  const citations: ExtractedCitation[] = [];
  const seen = new Set<string>();

  const addCitation = (c: Omit<ExtractedCitation, "verified">) => {
    if (seen.has(c.normalized)) return;
    seen.add(c.normalized);
    citations.push({ ...c, verified: false });
  };

  // §-Paragraphen: § 146 StGB, § 1295 Abs. 1 ABGB, §§ 864a ABGB
  const paragraphRegex = /§§?\s*(\d+[a-z]?)(?:\s+Abs\.?\s*\d+)?(?:\s+S(?:atz)?\.?\s*\d+)?(?:\s+lit\.?\s*[a-z])?(?:\s+([\wÄÖÜäöüß-]+))?/gi;
  for (const match of text.matchAll(paragraphRegex)) {
    const full = match[0].trim();
    const law = match[2] || "";
    const isAT = /(?:öStGB|ABGB|UGB|MRG|ASVG|ArbVG|VStG|B-VG|AVG|VwGVG|BAO|AngG|AVRAG|KSchG|EStG-AT|UStG-AT|KStG-AT)/i.test(law);
    const isCH = /(?:OR|ZGB|StGB-CH|SchKG|DBG|StHG|MWSTG|BV|VwVG|ArG)/i.test(law);
    const jurisdiction = isAT ? "AT" : isCH ? "CH" : /(?:BGB|HGB|InsO|StPO|GG|ZPO|BetrVG|TVG|SGB|BImSchG|GewO|BauGB|VwVfG|VwGO|GVG|AO|UStG(?!-AT)|EStG(?!-AT)|KStG(?!-AT))/i.test(law) ? "DE" : "AT";
    addCitation({ type: "paragraph", raw: full, normalized: full.replace(/\s+/g, " "), jurisdiction });
  }

  // Art. (EU/CH): Art. 6 Abs. 1 DSGVO, Art. 41 OR
  const articleRegex = /Art\.?\s*(\d+)(?:\s*Abs\.?\s*\d+)?(?:\s*(?:lit\.?\s*[a-z])?)?\s+([\wÄÖÜäöüß-]+)/gi;
  for (const match of text.matchAll(articleRegex)) {
    const full = match[0].trim();
    const law = match[2] || "";
    const isEU = /(?:DSGVO|AEUV|EUV|GRCh|EMRK)/i.test(law);
    const isCH = /(?:OR|ZGB|BV|SchKG)/i.test(law);
    addCitation({ type: "article", raw: full, normalized: full.replace(/\s+/g, " "), jurisdiction: isEU ? "EU" : isCH ? "CH" : "unknown" });
  }

  // RIS-Justiz RS-Nummern: RS0094010, RS0094536
  const rsRegex = /RS(\d{5,})/gi;
  for (const match of text.matchAll(rsRegex)) {
    addCitation({ type: "rs_number", raw: match[0], normalized: `RS${match[1]}`, jurisdiction: "AT" });
  }

  // OGH/VwGH/VfGH Geschäftszahlen: 11 Os 2/22m, 4 Ob 123/23k, 1 Ob 45/24d
  const oghRegex = /\b(\d{1,2}\s+(?:Os|Ob|Ra|Bkd|Bl|BSK|Bsa|Bs|Fsc|Ga|Gv|NC|Nc|Ns|Oc|Ok|R|Rs|Ss|StS)\s+\d+\/\d{2,4}[a-z]?)\b/gi;
  for (const match of text.matchAll(oghRegex)) {
    addCitation({ type: "case_ref", raw: match[0], normalized: match[1].replace(/\s+/g, " "), jurisdiction: "AT" });
  }

  // BGH-Aktenzeichen: III ZR 123/23, XII ZB 456/22
  const bghRegex = /\b([IVX]+\s+(?:ZR|ZB|ZA|AR|ARs|StR|StRs|GSSt|GSZ)\s+\d+\/\d{2,4})\b/gi;
  for (const match of text.matchAll(bghRegex)) {
    addCitation({ type: "case_ref", raw: match[0], normalized: match[1].replace(/\s+/g, " "), jurisdiction: "DE" });
  }

  // ECLI: ECLI:EU:C:2012:23, ECLI:AT:OGH0002:2022:...
  const ecliRegex = /ECLI:[A-Z]{2}:[A-Z0-9]+:\d{4}:\d+/gi;
  for (const match of text.matchAll(ecliRegex)) {
    const jurisdiction = match[0].startsWith("ECLI:EU") ? "EU" : match[0].startsWith("ECLI:AT") ? "AT" : match[0].startsWith("ECLI:DE") ? "DE" : "unknown";
    addCitation({ type: "ecli", raw: match[0], normalized: match[0], jurisdiction });
  }

  // BGE (Swiss): BGE 148 III 109
  const bgeRegex = /BGE\s+(\d+)\s+([IVX]+)\s+(\d+)/gi;
  for (const match of text.matchAll(bgeRegex)) {
    addCitation({ type: "bge", raw: match[0], normalized: match[0].replace(/\s+/g, " "), jurisdiction: "CH" });
  }

  // BGer (Swiss): 4A_123/2024
  const bgerRegex = /\b(\d[A-Z]_\d+\/\d{4})\b/g;
  for (const match of text.matchAll(bgerRegex)) {
    addCitation({ type: "case_ref", raw: match[0], normalized: match[1], jurisdiction: "CH" });
  }

  // CELEX numbers: 32016R0679, 62018CJ0311
  const celexRegex = /\b([0-9]{5}[A-Z]{1,2}[0-9]{4})\b/g;
  for (const match of text.matchAll(celexRegex)) {
    addCitation({ type: "celex", raw: match[0], normalized: match[1], jurisdiction: "EU" });
  }

  // NJW/MDR/ZfRV citations: NJW 2024, 1234
  const njwRegex = /\b(NJW|MDR|ZfRV|JBl|ÖJZ|RdW|ecolex|wbl|SZ|EvBl)\s+\d{4}(?:,?\s*\d+)?/gi;
  for (const match of text.matchAll(njwRegex)) {
    const pub = match[1].toUpperCase();
    const isAT = /^(JBl|ÖJZ|RdW|ecolex|wbl|SZ|EvBl)$/i.test(pub);
    addCitation({ type: "njw", raw: match[0], normalized: match[0].replace(/\s+/g, " "), jurisdiction: isAT ? "AT" : "DE" });
  }

  // EuGH case numbers: C-311/18, C-123/19
  const eughRegex = /\bC-\d+\/\d{2,4}\b/g;
  for (const match of text.matchAll(eughRegex)) {
    addCitation({ type: "case_ref", raw: match[0], normalized: match[0], jurisdiction: "EU" });
  }

  return citations;
}

// ============================================================
// Layer 4: Citation Verification
// ============================================================

export interface VerificationResult {
  citations: ExtractedCitation[];
  verifiedCount: number;
  unverifiedCount: number;
  fabricatedSuspects: ExtractedCitation[];
}

/**
 * Verify extracted citations against the provided source context.
 * Checks if citations actually appear in retrieved sources.
 *
 * For "hard" citation types (case_ref, rs_number, ecli, bge, celex, njw)
 * we ONLY accept verification when the citation appears in a structured
 * identifier of an actually-retrieved document (title or URL) — passed
 * via `structuredRefs`. Snippet bodies often quote related case-law as
 * cross-references (e.g. a Rechtssatz body that says "vgl RS0034544"),
 * and accepting those substrings as "verified" lets hallucinations slip
 * through: the LLM picks up the cross-ref and presents it as a primary
 * source, the verifier sees the substring in the snippet, marks it
 * verified, and the scrubber doesn't fire. This is exactly the bug
 * report from 2026-05-18 with "1 Ob 150/05v" / "RS0034544".
 *
 * For "soft" types (paragraph, article) we keep the full-text check —
 * paragraph references are normative and well-defined; matching them
 * against the whole source blob is the right call.
 */
export function verifyCitations(
  citations: ExtractedCitation[],
  sourceContext: string,
  retrievalSnippets: string[],
  structuredRefs?: string[],
): VerificationResult {
  const allSourceText = [sourceContext, ...retrievalSnippets].join(" ").toLowerCase();

  // The narrow text we verify hard citation types against. Falls back to the
  // full blob if no structured refs were supplied (so older callers keep
  // their existing behavior).
  const structuredText = (structuredRefs && structuredRefs.length > 0)
    ? structuredRefs.join(" ").toLowerCase()
    : allSourceText;
  
  const verified: ExtractedCitation[] = [];
  const fabricatedSuspects: ExtractedCitation[] = [];

  for (const citation of citations) {
    const norm = citation.normalized.toLowerCase();
    
    // Check if citation appears in source context
    let isVerified = false;

    switch (citation.type) {
      case "paragraph":
      case "article": {
        // Extract law abbreviation and specific paragraph/article number
        const lawPart = citation.raw.match(/(?:§§?\s*\d+[a-z]?\s*(?:Abs\.?\s*\d+)?\s*(?:S\.?\s*\d+)?\s*(?:lit\.?\s*[a-z])?\s*)([\wÄÖÜäöüß-]+)/i)?.[1]
          || citation.raw.match(/Art\.?\s*\d+(?:\s*Abs\.?\s*\d+)?\s*(?:lit\.?\s*[a-z])?\s*([\wÄÖÜäöüß-]+)/i)?.[1]
          || "";
        const lawLower = lawPart.toLowerCase();
        const knownLaws = new Set([
          "stgb", "bgb", "zpo", "hgb", "aktg", "gmbhg", "ustg", "estg", "ao", "bao",
          "abgb", "ugb", "mrg", "asvg", "arbvg", "avrag", "ang", "angg", "urlg", "azg", "kschg",
          "uwg", "phg", "glbg", "mschg", "io", "eo", "exeo", "vwgvg", "finstrg", "gebg",
          "dsgvo", "dsg", "urhg", "weg", "wgg", "vbg", "bdg", "betrvg", "tvag", "bverg",
          "or", "zgb", "schkg", "dbg", "sthg", "mwstg", "bv", "vwvg", "arg",
          "aeuv", "euv", "grch", "emrk", "tfeu", "teu",
          "stvg", "owig", "stpo", "gwb", "tkg", "tmg", "bdsg", "gg",
          "b-vg", "avg", "vstg", "eheg", "kstg", "grestg", "markschg", "patg", "vereinsg",
        ]);

        if (lawLower.length === 0) {
          isVerified = false;
        } else if (!knownLaws.has(lawLower) && !allSourceText.includes(lawLower)) {
          // Unknown law abbreviation — potential hallucination
          isVerified = false;
        } else {
          // Known law: only auto-verify when the specific §/article actually appears
          // in the retrieved source text. Otherwise the paragraph number itself may
          // be hallucinated even if the law abbreviation is real (e.g. "§ 9999 ABGB").
          const normLower = norm;
          if (allSourceText.includes(normLower)) {
            isVerified = true;
            citation.verificationSource = "retrieval_match";
          } else {
            isVerified = false;
            citation.verificationSource = "known_law_unverified";
          }
        }
        break;
      }

      case "rs_number": {
        // RS numbers MUST appear in the structured identifier set (titles/URLs
        // of actually-retrieved documents). A bare substring match against
        // snippet bodies isn't enough — Rechtssatz bodies routinely quote
        // older Rechtssätze as cross-references, and we don't want the LLM
        // smuggling those in as primary cites.
        const rsNum = citation.normalized; // e.g. "RS0094010"
        const rsDigits = rsNum.replace(/^RS0*/i, ""); // e.g. "94010"
        const rsWithZeros = rsDigits.padStart(7, "0"); // e.g. "0094010"

        isVerified = structuredText.includes(rsNum.toLowerCase())
          || structuredText.includes(`rs${rsWithZeros}`)
          || structuredText.includes(`rs${rsDigits}`)
          || structuredText.includes(rsWithZeros);
        if (isVerified) citation.verificationSource = "retrieval_match";
        break;
      }

      case "case_ref": {
        // Case references must appear in a structured identifier (title or
        // URL of a retrieved document). See note above re: cross-references
        // inside snippet bodies.
        const ref = norm.replace(/\s*\/\s*/g, "/");
        isVerified = structuredText.includes(ref) || structuredText.includes(norm);
        if (isVerified) citation.verificationSource = "retrieval_match";
        break;
      }

      case "ecli": {
        isVerified = structuredText.includes(norm);
        if (isVerified) citation.verificationSource = "retrieval_match";
        break;
      }

      case "bge": {
        isVerified = structuredText.includes(norm);
        if (isVerified) citation.verificationSource = "retrieval_match";
        break;
      }

      case "celex": {
        isVerified = structuredText.includes(norm);
        if (isVerified) citation.verificationSource = "retrieval_match";
        break;
      }

      case "njw": {
        // Journal refs — verify against structured identifiers only.
        isVerified = structuredText.includes(norm);
        if (isVerified) citation.verificationSource = "retrieval_match";
        break;
      }
    }

    citation.verified = isVerified;
    verified.push(citation);
    
    // Only flag unverified case refs, RS numbers, ECLI as fabrication suspects
    // Known law paragraphs/articles are not hallucination risks
    if (!isVerified && citation.type !== "paragraph" && citation.type !== "article") {
      fabricatedSuspects.push(citation);
    }
  }

  return {
    citations: verified,
    verifiedCount: verified.filter(c => c.verified).length,
    unverifiedCount: verified.filter(c => !c.verified).length,
    fabricatedSuspects,
  };
}

// ============================================================
// Layer 5: Source Highlighting
// ============================================================

export interface SourceHighlight {
  sourceProvider: string;
  sourceTitle: string;
  sourceUrl?: string;
  matchedPassage: string;
  responseContext: string;
  similarity: number;
}

/**
 * Find which source passages were used in the AI response.
 * Uses n-gram overlap for approximate matching.
 */
export function findSourceHighlights(
  responseText: string,
  sources: { provider: string; title: string; url?: string; snippet: string }[]
): SourceHighlight[] {
  const highlights: SourceHighlight[] = [];
  const responseWords = new Set(responseText.toLowerCase().split(/\s+/).filter(w => w.length > 4));

  for (const source of sources) {
    if (!source.snippet || source.snippet.length < 50) continue;

    // Split source into sentences
    const sentences = source.snippet.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    for (const sentence of sentences) {
      const sentenceWords = sentence.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      if (sentenceWords.length < 4) continue;

      // Calculate word overlap
      const overlap = sentenceWords.filter(w => responseWords.has(w)).length;
      const similarity = overlap / sentenceWords.length;

      if (similarity > 0.5) {
        // Find approximate context via indexOf (avoids ReDoS from dynamic regex)
        const firstWord = sentenceWords[0] || "";
        const idx = firstWord ? responseText.toLowerCase().indexOf(firstWord) : -1;
        const contextStart = Math.max(0, idx - 100);
        const contextEnd = Math.min(responseText.length, idx + firstWord.length + 100);
        const responseContext = idx >= 0 ? responseText.slice(contextStart, contextEnd).trim() : "";

        highlights.push({
          sourceProvider: source.provider,
          sourceTitle: source.title,
          sourceUrl: source.url,
          matchedPassage: sentence.trim(),
          responseContext,
          similarity,
        });
      }
    }
  }

  // Sort by similarity descending, limit to top 10
  return highlights.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
}

// ============================================================
// Layer 6: Confidence Score
// ============================================================

export interface ConfidenceAnalysis {
  score: number; // 0-100
  level: "high" | "medium" | "low";
  label: string;
  factors: ConfidenceFactor[];
}

export interface ConfidenceFactor {
  name: string;
  score: number; // 0-100 contribution
  weight: number;
  detail: string;
}

/**
 * Calculate a confidence score (0-100%) for an AI response based on:
 * - Number of verified citations
 * - Source coverage (how many source passages were used)
 * - Citation diversity
 * - Presence of unverified case refs (hallucination risk)
 */
export function calculateConfidence(
  verification: VerificationResult,
  highlights: SourceHighlight[],
  sourceCount: number,
  responseLength: number
): ConfidenceAnalysis {
  const factors: ConfidenceFactor[] = [];

  // Optimization #5: Minimum score of 20 when no sources (LLM baseline knowledge)
  const baseScore = sourceCount === 0 ? 20 : 0;

  // Factor 1: Source availability (0-25)
  const sourceScore = sourceCount === 0 ? 5 : Math.min(25, sourceCount * 5);
  factors.push({
    name: "Quellenabdeckung",
    score: sourceScore,
    weight: 25,
    detail: sourceCount === 0 ? "Antwort basiert auf Fachwissen" : `${sourceCount} Quellen abgerufen`,
  });

  // Factor 2: Verified citations (0-30)
  const totalCitations = verification.citations.length;
  const verifiedRatio = totalCitations > 0 ? verification.verifiedCount / totalCitations : 0;
  const citationScore = sourceCount === 0 && totalCitations > 0
    ? Math.round(verifiedRatio * 15) + 10 // Known law refs still count
    : Math.round(verifiedRatio * 30);
  factors.push({
    name: "Verifizierte Zitate",
    score: citationScore,
    weight: 30,
    detail: `${verification.verifiedCount}/${totalCitations} verifiziert`,
  });

  // Factor 3: Citation density (0-20)
  const wordsInResponse = responseLength / 5;
  const citationsPerKWord = totalCitations / Math.max(1, wordsInResponse / 1000);
  const densityScore = Math.min(20, Math.round(citationsPerKWord * 4));
  factors.push({
    name: "Zitationsdichte",
    score: densityScore,
    weight: 20,
    detail: `${citationsPerKWord.toFixed(1)} Zitate/1000 Wörter`,
  });

  // Factor 4: Source highlighting (0-15)
  const groundedScore = Math.min(15, highlights.length * 3);
  factors.push({
    name: "Quellenverankerung",
    score: groundedScore,
    weight: 15,
    detail: `${highlights.length} Passagen abgeglichen`,
  });

  // Factor 5: Hallucination risk (0-10)
  const fabricationPenalty = Math.min(10, verification.fabricatedSuspects.length * 3);
  const fabricationScore = 10 - fabricationPenalty;
  factors.push({
    name: "Halluzinations-Risiko",
    score: fabricationScore,
    weight: 10,
    detail: verification.fabricatedSuspects.length > 0
      ? `${verification.fabricatedSuspects.length} nicht verifizierte Referenzen`
      : "Keine verdächtigen Zitate",
  });

  const totalScore = Math.max(baseScore, factors.reduce((sum, f) => sum + f.score, 0));
  const clampedScore = Math.max(0, Math.min(100, totalScore));

  let level: "high" | "medium" | "low";
  let label: string;
  if (clampedScore >= 70) {
    level = "high";
    label = "Hohe Quellenabdeckung";
  } else if (clampedScore >= 40) {
    level = "medium";
    label = "Mittlere Quellenabdeckung";
  } else {
    level = "low";
    // Optimization #5: Better messaging when no sources
    label = sourceCount === 0 ? "Keine externen Quellen verifiziert" : "Geringe Quellenabdeckung";
  }

  return { score: clampedScore, level, label, factors };
}

// ============================================================
// Layer 7: Source Freshness Validation
// ============================================================

export interface FreshnessWarning {
  citation: string;
  sourceDate: string;
  ageYears: number;
  warning: string;
}

/**
 * Check if cited sources are potentially outdated.
 * Flags sources older than thresholds based on type.
 */
export function checkSourceFreshness(
  sources: { provider: string; title: string; url?: string; snippet: string; date?: string }[]
): FreshnessWarning[] {
  const warnings: FreshnessWarning[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();

  for (const source of sources) {
    if (!source.date) continue;

    // Parse date — handle various formats
    let sourceDate: Date | null = null;
    const dateStr = source.date.trim();
    
    // Try ISO format first
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      sourceDate = parsed;
    } else {
      // Try extracting year
      const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        sourceDate = new Date(parseInt(yearMatch[0]), 0, 1);
      }
    }
    if (!sourceDate) continue;

    const ageMs = now.getTime() - sourceDate.getTime();
    const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);

    // Thresholds by content type
    const isLegislation = /\b(Gesetz|Novelle|BGBl|Verordnung)\b/i.test(source.title);
    const isCaselaw = /\b(OGH|BGH|EuGH|BGer|BVerfG|VfGH|VwGH|BFG)\b/i.test(source.title) ||
                      /\b(Urteil|Beschluss|Erkenntnis|Entscheidung)\b/i.test(source.title);
    
    // Legislation: warn if > 3 years (may have been amended)
    // Case law: warn if > 8 years (may be superseded)
    // Other: warn if > 5 years
    const threshold = isLegislation ? 3 : isCaselaw ? 8 : 5;

    if (ageYears > threshold) {
      const type = isLegislation ? "Gesetzesquelle" : isCaselaw ? "Rechtsprechung" : "Quelle";
      warnings.push({
        citation: source.title,
        sourceDate: dateStr,
        ageYears: Math.round(ageYears * 10) / 10,
        warning: `${type} aus ${sourceDate.getFullYear()} (${Math.round(ageYears)} Jahre alt) — möglicherweise durch Novellen/neuere Rspr. überholt.`,
      });
    }
  }

  return warnings.slice(0, 5); // Max 5 warnings
}

// ============================================================
// Combined Analysis Pipeline
// ============================================================

export interface CitationAnalysis {
  citations: ExtractedCitation[];
  verification: VerificationResult;
  highlights: SourceHighlight[];
  confidence: ConfidenceAnalysis;
  freshnessWarnings: FreshnessWarning[];
  verificationResult?: { verified: boolean; issues: any[] };
}

/**
 * Run the full anti-hallucination pipeline on an AI response.
 */
export function analyzeCitations(
  responseText: string,
  sourceContext: string,
  sources: { provider: string; title: string; url?: string; doc_ref?: string; snippet: string; date?: string }[]
): CitationAnalysis {
  // Layer 3: Extract
  const citations = extractCitations(responseText);

  // Layer 4: Verify
  // Snippet bodies go into the soft-verification blob (for paragraph/article
  // matching). Hard citation types (case_ref, rs_number, ecli, bge, celex,
  // njw) are verified against structuredRefs only — the titles/URLs of
  // actually-retrieved documents — so cross-references quoted INSIDE one
  // document's body don't accidentally validate hallucinated cites.
  const snippets = sources.map(s => s.snippet || "");
  const structuredRefs = sources.flatMap(s => [s.title || "", s.url || "", s.doc_ref || ""]).filter(Boolean);
  const verification = verifyCitations(citations, sourceContext, snippets, structuredRefs);

  // Layer 5: Highlight
  const highlights = findSourceHighlights(responseText, sources);

  // Layer 6: Confidence
  const confidence = calculateConfidence(
    verification,
    highlights,
    sources.length,
    responseText.length
  );

  // Layer 7: Freshness
  const freshnessWarnings = checkSourceFreshness(sources);

  return { citations, verification, highlights, confidence, freshnessWarnings };
}
