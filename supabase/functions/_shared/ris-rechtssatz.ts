export interface RisRechtssatzSource {
  doc_ref: string;
  title: string;
  date: string;
  url: string;
  score: number;
  highlights: string[];
  provider: string;
  pinpoint?: string;
  snippet?: string;
  evidence_status: "verified_document";
}

const LAW_INFO: Record<string, { title: string; gesetzesnummer: string; artikel?: string }> = {
  abgb: { title: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  stgb: { title: "Strafgesetzbuch", gesetzesnummer: "10002296" },
  zpo: { title: "Zivilprozessordnung", gesetzesnummer: "10001699" },
  ang: { title: "Angestelltengesetz", gesetzesnummer: "10008069", artikel: "1" },
  angg: { title: "Angestelltengesetz", gesetzesnummer: "10008069", artikel: "1" },
};

const STOPWORDS = new Set([
  "welche", "welcher", "welches", "was", "wie", "wer", "wo", "wann", "warum",
  "für", "ist", "sind", "werden", "kann", "können", "muss", "müssen", "soll", "sollen",
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "einem", "einen", "eines",
  "und", "oder", "aber", "von", "zu", "bei", "mit", "nach", "über", "unter",
  "sich", "auf", "aus", "an", "in", "um", "als", "auch", "noch", "nicht",
  "wenn", "ob", "dass", "weil", "da", "so", "es", "man", "hat", "haben",
  "wird", "wurde", "gibt", "mein", "meine", "meinem", "meinen",
  "ich", "er", "sie", "wir", "ihr", "gelten", "gilt", "bekommt",
  "artikel", "art", "paragraf", "paragraph", "sinne", "zulässig", "zulaessig",
  "unzulässig", "unzulaessig", "erlaubt", "verboten", "frage", "fragen",
]);

function safeStr(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("item" in obj) return safeStr(obj.item);
    if ("_" in obj) return safeStr(obj._);
  }
  return "";
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss");
}

function toRoman(value: number): string {
  const numerals: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let remaining = value;
  let out = "";
  for (const [num, roman] of numerals) {
    while (remaining >= num) {
      out += roman;
      remaining -= num;
    }
  }
  return out;
}

function singularizeGermanLegalToken(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 6) return normalized;
  return normalized
    .replace(/(klagen)$/i, "klage")
    .replace(/(ansprüchen)$/i, "anspruch")
    .replace(/(anspruechen)$/i, "anspruch")
    .replace(/(ungen)$/i, "ung")
    .replace(/(keiten)$/i, "keit")
    .replace(/(?:en|ern|er|es|e|n|s)$/i, "");
}

function normalizeLegalQueryForRis(query: string): string {
  return (query || "")
    // Austrian RIS stores EGZPO Article 42 as "Art XLII". Users naturally
    // type "Artikel 42 EGZPO", which otherwise becomes a mandatory search
    // term that misses the exact Rechtssatz.
    .replace(/\b(?:Artikel|Art\.?)\s*(\d{1,3})\s+EGZPO\b/gi, (_m, n) => `Art ${toRoman(Number(n))} EGZPO`)
    .replace(/\bEGZPO\s+(?:Artikel|Art\.?)\s*(\d{1,3})\b/gi, (_m, n) => `EGZPO Art ${toRoman(Number(n))}`)
    .replace(/\bSchadensersatz/gi, "Schadenersatz")
    .replace(/\bSchadenersatzklagen\b/gi, "Schadenersatzklage");
}

export function extractRisRechtssatzKeywords(query: string): string[] {
  const seen = new Set<string>();
  return normalizeLegalQueryForRis(query)
    .replace(/[?!.,;:()[\]{}"“”„]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOPWORDS.has(word.toLowerCase()))
    .filter((word) => {
      const key = normalizeText(word);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    const key = normalizeText(normalized);
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function buildRisRechtssatzSearchQueries(query: string): string[] {
  const normalizedQuery = normalizeLegalQueryForRis(query);
  const keywords = extractRisRechtssatzKeywords(normalizedQuery);
  const candidates: string[] = [];

  const normalizedKeywordQuery = keywords
    .map((word) => singularizeGermanLegalToken(word))
    .slice(0, 8)
    .join(" ");
  if (normalizedKeywordQuery) candidates.push(normalizedKeywordQuery);

  const explicitRs = normalizedQuery.match(/\bRS0*\d{5,}\b/i)?.[0];
  if (explicitRs) candidates.unshift(explicitRs.toUpperCase());

  const hasEgzpoArtXlii = /\b(?:Art\s*XLII|ArtXLII)\s+EGZPO\b/i.test(normalizedQuery)
    || /\bEGZPO\s+(?:Art\s*XLII|ArtXLII)\b/i.test(normalizedQuery);
  const mentionsDamages = /\bSchadenersatz/i.test(normalizedQuery);
  const mentionsPreparation = /\bvorbereit/i.test(normalizedQuery);
  if (hasEgzpoArtXlii && mentionsDamages) {
    if (mentionsPreparation) candidates.push("Art XLII EGZPO Vorbereitung Schadenersatzklage");
    candidates.push("Art XLII EGZPO Schadenersatzklage");
  }

  return uniqueStrings(candidates);
}

export function looksLikeExactRisRechtssatzQuery(query: string): boolean {
  const keywords = extractRisRechtssatzKeywords(query);
  if (keywords.length < 5) return false;

  const normalized = normalizeText(query);
  return /\b(?:gericht|rechtsprech|rechtssatz|ogh|verjahr|anspruch|geltendmach|klage|beweis|verfahren|verfahrenshilfe)/.test(normalized);
}

function stripRisXmlText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#167;|&sect;/gi, "§")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRisXmlAbsatz(xml: string, ct: string): string {
  const re = new RegExp(`<absatz[^>]+ct=["']${ct}["'][^>]*>([\\s\\S]*?)<\\/absatz>`, "i");
  const match = xml.match(re);
  return match ? stripRisXmlText(match[1]) : "";
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeRisDocumentUrl(url: string, dokumentnummer: string): string {
  if (url && /\/Dokument\.wxe\?/i.test(url)) return url;

  const xmlMatch = url.match(/ris\.bka\.gv\.at\/Dokumente\/(\w+)\/([^/]+)\/[^/]+\.(?:xml|html)$/i);
  if (xmlMatch) {
    return `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=${xmlMatch[1]}&Dokumentnummer=${xmlMatch[2]}`;
  }

  if (dokumentnummer) {
    return `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=${encodeURIComponent(dokumentnummer)}`;
  }

  return "";
}

function formatRISDate(raw: string): string {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}.${iso[2]}.${iso[1]}` : raw;
}

function buildNormDokumentUrl(law: { gesetzesnummer: string; artikel?: string }, paragraph: string): string {
  const artikel = law.artikel || "";
  return `https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=${law.gesetzesnummer}&Artikel=${artikel}&Paragraf=${encodeURIComponent(paragraph)}&Anlage=&Uebergangsrecht=`;
}

function verifyRisNormHtml(html: string, lawTitle: string, lawAbbr: string, paragraph: string): boolean {
  const normalized = stripRisXmlText(html).toLowerCase();
  if (!normalized || /keine dokumente gefunden|kein dokument gefunden|fehler bei der suche/i.test(normalized)) return false;
  if (!normalized.includes(lawTitle.toLowerCase()) && !normalized.includes(lawAbbr.toLowerCase())) return false;
  const paraRe = new RegExp(`(?:§|paragraph|paragraf)\\s*${paragraph.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return paraRe.test(normalized);
}

function extractNormCitations(text: string): Array<{ lawAbbr: string; paragraph: string }> {
  const out: Array<{ lawAbbr: string; paragraph: string }> = [];
  const seen = new Set<string>();
  const patterns = [
    /§{1,2}\s*(\d+[a-z]?)\s+([A-Za-zÄÖÜäöüß-]{2,})/g,
    /\b([A-Za-zÄÖÜäöüß-]{2,})\s*§{1,2}\s*(\d+[a-z]?)/g,
  ];

  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const paragraph = /^\d/i.test(match[1]) ? match[1] : match[2];
      const lawAbbr = (/^\d/i.test(match[1]) ? match[2] : match[1]).toLowerCase();
      if (!LAW_INFO[lawAbbr]) continue;
      const key = `${lawAbbr}:${paragraph}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ lawAbbr, paragraph });
    }
  }
  return out;
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json,application/xml,text/xml,text/html;q=0.9",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        "User-Agent": "LegalAI/1.0 (Research Tool)",
      },
    });
    if (!resp.ok) return "";
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

function overlapCount(queryKeywords: string[], text: string): number {
  const haystack = normalizeText(text);
  return queryKeywords.filter((keyword) => {
    const normalized = normalizeText(keyword);
    const variants = uniqueStrings([
      normalized,
      singularizeGermanLegalToken(normalized),
      normalized.replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u"),
    ]);
    return variants.some((variant) => variant.length > 2 && haystack.includes(variant));
  }).length;
}

export async function resolveVerifiedRisNormSource(citation: string): Promise<RisRechtssatzSource | null> {
  const norm = extractNormCitations(citation)[0];
  if (!norm) return null;

  const law = LAW_INFO[norm.lawAbbr];
  if (!law) return null;

  const url = buildNormDokumentUrl(law, norm.paragraph);
  const html = await fetchTextWithTimeout(url, 4000);
  if (!verifyRisNormHtml(html, law.title, norm.lawAbbr, norm.paragraph)) return null;

  return {
    doc_ref: `§ ${norm.paragraph} ${norm.lawAbbr.toUpperCase()}`,
    title: `§ ${norm.paragraph} ${law.title}`,
    date: "",
    url,
    score: 0.98,
    highlights: [law.title, `§ ${norm.paragraph}`, norm.lawAbbr.toUpperCase()],
    provider: "RIS",
    pinpoint: `§ ${norm.paragraph}`,
    snippet: `Verifizierte RIS-Norm: § ${norm.paragraph} ${law.title}`,
    evidence_status: "verified_document",
  };
}

export async function resolveExactRisRechtssatzSource(query: string): Promise<RisRechtssatzSource | null> {
  if (!looksLikeExactRisRechtssatzQuery(query)) return null;

  const keywords = extractRisRechtssatzKeywords(query).slice(0, 10);
  const searchQueries = buildRisRechtssatzSearchQueries(query);
  if (searchQueries.length === 0) return null;

  for (const suchworte of searchQueries) {
    const url = `https://data.bka.gv.at/ris/api/v2.6/Judikatur?Suchworte=${encodeURIComponent(suchworte)}&Dokumenttyp=Rechtssatz&Pagesize=3`;
    let data: any;
    try {
      const text = await fetchTextWithTimeout(url, 4000);
      if (!text) continue;
      data = JSON.parse(text);
    } catch {
      continue;
    }

    const hits = data?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference || [];
    const hitArray = Array.isArray(hits) ? hits : hits ? [hits] : [];
    if (hitArray.length !== 1) continue;

    const source = await sourceFromRisRechtssatzHit(hitArray[0], keywords);
    if (source) return source;
  }

  return null;
}

async function sourceFromRisRechtssatzHit(hit: any, keywords: string[]): Promise<RisRechtssatzSource | null> {
  const metadaten = hit?.Data?.Metadaten || {};
  const meta = metadaten?.Judikatur || metadaten?.JudikaturRs || metadaten?.JudikaturJustiz || metadaten || {};
  const justiz = meta?.Justiz || {};
  const allgemein = metadaten?.Allgemein || {};
  const technisch = metadaten?.Technisch || {};
  const docList = hit?.Data?.Dokumentliste?.ContentReference;
  const docInfo = Array.isArray(docList) ? docList[0] : docList || {};
  const contentUrls = asArray(docInfo?.Urls?.ContentUrl);
  const xmlContentUrl = contentUrls.find((u: any) => safeStr(u?.DataType).toLowerCase() === "xml");
  const firstContentUrl = contentUrls[0];

  const dokumentnummer = safeStr(meta?.Dokumentnummer) || safeStr(hit?.Data?.Dokumentnummer) || safeStr(technisch?.ID);
  const rsNummer = safeStr(meta?.Rechtssatznummer)
    || safeStr(justiz?.Rechtssatznummern)
    || safeStr(meta?.EuropeanCaseLawIdentifier).match(/RS\d{5,}/i)?.[0]
    || "";
  const rsMatch = rsNummer.match(/RS0*(\d{5,})/i);
  if (!rsMatch || !dokumentnummer) return null;

  const xmlUrl = safeStr(xmlContentUrl?.Url);
  let rechtssatz = safeStr(meta?.RechtssatzText || meta?.Spruch || meta?.Kurztext);
  if (!rechtssatz && xmlUrl) {
    rechtssatz = extractRisXmlAbsatz(await fetchTextWithTimeout(xmlUrl, 3000), "rechtssatz");
  }

  const docRef = `RIS-Justiz RS${rsMatch[1].padStart(7, "0")}`;
  const normen = safeStr(meta?.Normen);
  const evidenceText = [rechtssatz, normen, docRef, rsNummer].filter(Boolean).join(" ");
  if (overlapCount(keywords, evidenceText) < Math.min(4, keywords.length)) return null;

  const directUrl = normalizeRisDocumentUrl(safeStr(allgemein?.DokumentUrl) || safeStr(firstContentUrl?.Url), dokumentnummer);
  if (!directUrl || /\/(?:Ergebnis|Suchen)\.wxe/i.test(directUrl)) return null;

  const titleText = rechtssatz || normen || docRef;
  const title = titleText.length > 150 ? `${titleText.slice(0, 150)}...` : titleText;

  return {
    doc_ref: docRef,
    title: `Rechtssatz: ${title}`,
    date: formatRISDate(safeStr(meta?.Entscheidungsdatum)),
    url: directUrl,
    score: 0.99,
    highlights: [rechtssatz, normen, docRef].filter(Boolean),
    provider: "RIS",
    pinpoint: docRef,
    snippet: [rechtssatz, normen].filter(Boolean).join(" | "),
    evidence_status: "verified_document",
  };
}

export function isResponsiveRisRechtssatzSource(
  query: string,
  source: { title?: string; snippet?: string; doc_ref?: string; pinpoint?: string; highlights?: string[]; provider?: string },
): boolean {
  const text = [
    source.title || "",
    source.snippet || "",
    source.doc_ref || "",
    source.pinpoint || "",
    ...(source.highlights || []),
  ].join(" ");
  const isRechtssatz = /\bRS\d{5,}\b/i.test(text) || /\b(?:Rechts|Leit)satz\b/i.test(text);
  if (!isRechtssatz) return true;

  const keywords = extractRisRechtssatzKeywords(query).slice(0, 10);
  if (keywords.length < 3) return true;

  const required = Math.min(4, Math.max(3, Math.ceil(keywords.length * 0.45)));
  return overlapCount(keywords, text) >= required;
}

export async function resolveExactRisRechtssatzSources(query: string): Promise<RisRechtssatzSource[]> {
  const source = await resolveExactRisRechtssatzSource(query);
  if (!source) return [];

  const normCitations = extractNormCitations(source.snippet || "");
  const normSources = await Promise.all(
    normCitations.map((norm) => resolveVerifiedRisNormSource(`§ ${norm.paragraph} ${norm.lawAbbr}`)),
  );

  return [
    source,
    ...normSources.filter((norm): norm is RisRechtssatzSource => !!norm),
  ];
}
