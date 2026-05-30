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

export function isFindokProvider(source: EvidenceSourceLike): boolean {
  return normalizeProvider(source).includes("FINDOK");
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

const FINDOK_SESSION_TOKEN_PATTERNS: RegExp[] = [
  /[?&]execution=e\d+s\d+/i,
  /[?&]_eventId=[^&]+/i,
  /[?&]jsessionid=[^&]+/i,
  /;jsessionid=[^?&]+/i,
  /[?&]request-id=[^&]+/i,
  /[?&]sid=[A-Z0-9]{20,}/i,
];

const FINDOK_STABLE_ID_RE = /[?&](?:gz|id|dokumentId)=([^&#]+)/i;

function hasFindokSessionToken(url: string): boolean {
  return FINDOK_SESSION_TOKEN_PATTERNS.some((re) => re.test(url));
}

function isFindokHost(hostname: string): boolean {
  return /(^|\.)findok\.bmf\.gv\.at$/i.test(hostname);
}

function safeDecodeUrl(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function isGoogleFindokSearchUrl(url: string): boolean {
  const decoded = safeDecodeUrl(url);
  if (!/site:findok\.bmf\.gv\.at/i.test(decoded)) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isGoogle = host === "google.com" || host.endsWith(".google.com") || host.startsWith("www.google.");
    return isGoogle && parsed.pathname === "/search";
  } catch {
    return /google\.[^/]+\/search/i.test(url);
  }
}

export function isFindokSearchUrl(url: string): boolean {
  if (!url) return false;
  if (isGoogleFindokSearchUrl(url)) return true;
  if (!/findok\.bmf\.gv\.at/i.test(url)) return false;

  try {
    const parsed = new URL(url);
    if (!isFindokHost(parsed.hostname)) return false;
    if (hasFindokSessionToken(url)) return true;

    const path = parsed.pathname.toLowerCase();
    const hasStableId = FINDOK_STABLE_ID_RE.test(parsed.search);
    if (hasStableId) return false;

    return /(?:suche|search|ergebnis|result|liste|findok)$/i.test(path);
  } catch {
    return hasFindokSessionToken(url) || !FINDOK_STABLE_ID_RE.test(url);
  }
}

export function isFindokDirectDocumentUrl(url: string): boolean {
  if (!url || !/findok\.bmf\.gv\.at/i.test(url) || isGoogleFindokSearchUrl(url)) return false;

  try {
    const parsed = new URL(url);
    if (!isFindokHost(parsed.hostname)) return false;
    if (hasFindokSessionToken(url)) return false;
    if (FINDOK_STABLE_ID_RE.test(parsed.search)) return true;
    return /\.pdf$/i.test(parsed.pathname);
  } catch {
    return !hasFindokSessionToken(url) && FINDOK_STABLE_ID_RE.test(url);
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

  if (isFindokProvider(source)) {
    if (isFindokSearchUrl(url) || /^Findok-Suche/i.test(title) || /^FINDOK$/i.test(docRef)) {
      return "search_utility";
    }
    if (isFindokDirectDocumentUrl(url)) return "verified_document";
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
