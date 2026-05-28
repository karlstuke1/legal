export type SourceEvidenceStatus = "verified_document" | "search_utility" | "fallback";

export interface EvidenceSourceLike {
  provider?: string;
  source_provider?: string;
  title?: string;
  doc_ref?: string;
  url?: string;
  source_url?: string;
  evidence_status?: SourceEvidenceStatus | string;
}

const VALID_STATUSES = new Set<SourceEvidenceStatus>([
  "verified_document",
  "search_utility",
  "fallback",
]);

function normalizeProvider(source: EvidenceSourceLike): string {
  return String(source.provider || source.source_provider || "").toUpperCase();
}

function normalizeUrl(source: EvidenceSourceLike): string {
  return String(source.url || source.source_url || "");
}

export function isRisProvider(source: EvidenceSourceLike): boolean {
  return normalizeProvider(source).startsWith("RIS");
}

export function isRisSearchUrl(url: string): boolean {
  if (!url || !/ris\.bka\.gv\.at/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return /\/(?:Ergebnis|Suchen)\.wxe$/i.test(parsed.pathname);
  } catch {
    return /\/(?:Ergebnis|Suchen)\.wxe\?/i.test(url);
  }
}

export function isRisDirectDocumentUrl(url: string): boolean {
  if (!url || !/ris\.bka\.gv\.at/i.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (/\/(?:Dokument|NormDokument|GeltendeFassung)\.wxe$/i.test(parsed.pathname)) return true;
    return /\/Dokumente\//i.test(parsed.pathname);
  } catch {
    return /\/(?:Dokument|NormDokument|GeltendeFassung)\.wxe\?/i.test(url) || /\/Dokumente\//i.test(url);
  }
}

export function classifySourceEvidence(source: EvidenceSourceLike): SourceEvidenceStatus {
  const explicit = source.evidence_status;
  if (VALID_STATUSES.has(explicit as SourceEvidenceStatus)) {
    return explicit as SourceEvidenceStatus;
  }

  const title = String(source.title || "");
  const docRef = String(source.doc_ref || "");
  const url = normalizeUrl(source);

  if (/^FALLBACK(?:-|$)/i.test(docRef) || /\bfallback\b/i.test(title)) {
    return "fallback";
  }

  if (isRisProvider(source)) {
    if (isRisSearchUrl(url) || /^RIS\s+(?:Bundesrecht|Judikatur|Suche)/i.test(title)) {
      return "search_utility";
    }
    if (isRisDirectDocumentUrl(url)) return "verified_document";
    return "fallback";
  }

  return "verified_document";
}

export function withEvidenceStatus<T extends EvidenceSourceLike>(
  source: T,
  status?: SourceEvidenceStatus,
): T & { evidence_status: SourceEvidenceStatus } {
  return {
    ...source,
    evidence_status: status || classifySourceEvidence(source),
  };
}

export function annotateEvidenceStatus<T extends EvidenceSourceLike>(
  sources: T[],
): Array<T & { evidence_status: SourceEvidenceStatus }> {
  return sources.map((source) => withEvidenceStatus(source));
}

export function isEvidentiarySource(source: EvidenceSourceLike): boolean {
  return classifySourceEvidence(source) === "verified_document";
}
