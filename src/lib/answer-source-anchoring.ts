import type { SourceMapEntry } from "@/lib/render-source-tokens";

const HARD_IDENTIFIER_RE = /\b(?:RS\d{5,}|ECLI:[A-Z]{2}:[A-Z0-9]+:\d{4}:\S+|\d{1,2}\s+(?:Os|Ob|Ra|Bs|Bkd|Ns|R|Rs|Ss|Ok|Nc)\s+\d+\/\d{2,4}[a-z]?)\b/i;

function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[„“"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordSet(value: string): Set<string> {
  return new Set(
    normalizeForComparison(value)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 5),
  );
}

function overlapScore(sentence: string, answerText: string): number {
  const sentenceTokens = keywordSet(sentence);
  const answerTokens = keywordSet(answerText);
  let score = 0;
  for (const token of sentenceTokens) {
    if (answerTokens.has(token)) score += 1;
  }
  return score;
}

function extractResponsiveRechtssatz(source: SourceMapEntry): string | null {
  const match = (source.title || "").match(/\b(?:Rechts|Leit)satz:\s*(.+)$/i);
  if (!match) return null;

  const sentence = match[1].replace(/\s+/g, " ").trim();
  if (sentence.length < 40 || HARD_IDENTIFIER_RE.test(sentence)) return null;
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export function ensureResponsiveRechtssatzIntro(text: string, sourceMap: SourceMapEntry[]): string {
  if (!text || !sourceMap?.length) return text;

  const candidates = sourceMap
    .map((source) => ({ source, sentence: extractResponsiveRechtssatz(source) }))
    .filter((candidate): candidate is { source: SourceMapEntry; sentence: string } => (
      Boolean(candidate.sentence) && candidate.source.index > 0 && Boolean(candidate.source.url)
    ))
    .map((candidate) => ({
      ...candidate,
      score: overlapScore(candidate.sentence, text),
    }))
    .sort((a, b) => b.score - a.score || a.source.index - b.source.index);
  const best = candidates[0];
  if (!best || best.score < 4) return text;

  const normalizedText = normalizeForComparison(text);
  const normalizedSentence = normalizeForComparison(best.sentence);
  const comparisonPrefix = normalizedSentence.slice(0, Math.min(80, normalizedSentence.length));
  if (comparisonPrefix.length > 30 && normalizedText.includes(comparisonPrefix)) return text;

  return `${best.sentence} [Quelle ${best.source.index}]\n\n${text.trimStart()}`;
}

export function ensureAtLeastOneSourceToken(text: string, sourceMap: SourceMapEntry[]): string {
  if (!text || !sourceMap?.length || /\[Quellen?\s+\d/i.test(text)) return text;
  const firstSource = sourceMap.find((source) => source.index > 0 && source.url);
  if (!firstSource) return text;
  const token = ` [Quelle ${firstSource.index}]`;

  // Attach the source to the first substantive sentence, skipping short
  // headings. This is a deterministic fallback for model disobedience:
  // the preferred path remains explicit [Quelle N] tokens from the model.
  return text.replace(
    /(^|\n\n)(?!#{1,6}\s|[-*]\s|\d+\.\s)([^#\n][^\n]{40,}?[.!?])(\s|$)/,
    (_match, prefix: string, sentence: string, suffix: string) => `${prefix}${sentence}${token}${suffix}`,
  );
}
