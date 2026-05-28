export interface RetrievalSourceLike {
  title?: string;
  snippet?: string;
  doc_ref?: string;
  pinpoint?: string;
  highlights?: string[];
}

interface ReformulatedLike {
  norms?: string[];
  ris_keywords?: string[];
  ris_aspect_searches?: string[];
  case_law_searches?: string[];
  generic_keywords?: string[];
}

function sourceText(source: RetrievalSourceLike): string {
  return [
    source.title,
    source.snippet,
    source.doc_ref,
    source.pinpoint,
    ...(source.highlights || []),
  ].filter(Boolean).join(" ");
}

export function isAustrianPrivacyLawQuery(query: string, reformulated?: ReformulatedLike | null): boolean {
  const combined = [
    query,
    ...(reformulated?.norms || []),
    ...(reformulated?.ris_keywords || []),
    ...(reformulated?.ris_aspect_searches || []),
    ...(reformulated?.case_law_searches || []),
    ...(reformulated?.generic_keywords || []),
  ].join(" ");

  return /\b(?:DSGVO|GDPR|Datenschutz|Datenschutzgesetz|Datenschutzbehörde|Datenpanne)\b/i.test(combined)
    || /\bDSG\b/.test(combined)
    || /\bArt\.?\s*(?:15|82)\s*DSGVO\b/i.test(combined);
}

export function isDisciplinaryStatuteFalsePositive(source: RetrievalSourceLike): boolean {
  const text = sourceText(source);
  const hasDStSignal = /\bDSt\b/.test(text) || /\bDisziplinarstatut\b/i.test(text);
  if (!hasDStSignal) return false;

  return !isPrivacyLawRelevantSource(source);
}

export function isPrivacyLawRelevantSource(source: RetrievalSourceLike): boolean {
  const text = sourceText(source);
  return /\b(?:DSGVO|GDPR|Datenschutz|Datenschutzgesetz|Datenschutzbehörde|Datenpanne)\b/i.test(text)
    || /\bDSG\b/.test(text)
    || /\bArt\.?\s*(?:15|82)\s*DSGVO\b/i.test(text)
    || /\bVerordnung\s*\(EU\)\s*2016\/679\b/i.test(text);
}

export function filterAustrianPrivacyLawSources<T extends RetrievalSourceLike>(
  query: string,
  reformulated: ReformulatedLike | null | undefined,
  sources: T[],
): T[] {
  if (!isAustrianPrivacyLawQuery(query, reformulated)) return sources;
  return sources.filter((source) => isPrivacyLawRelevantSource(source) && !isDisciplinaryStatuteFalsePositive(source));
}
