/**
 * RIS URL normalization utilities — extracted from markdown-config.tsx
 * Handles canonicalization of Austrian legal database (RIS) URLs.
 */

// ============================================================
// Constants
// ============================================================

/** Parameters that are session/list-specific and should be stripped */
const SESSION_PARAMS = new Set([
  "ResultFunctionToken", "Position", "Gericht", "Fachgebiet",
  "Rechtssatznummer", "Rechtssatz", "Fundstelle", "Spruch",
  "Rechtsgebiet", "AenderungenSeit", "JustizEntscheidungsart",
  "SucheNachRechtssatz", "SucheNachText", "GZ", "VonDatum",
  "BisDatum", "Norm", "ImRisSeitVonDatum", "ImRisSeitBisDatum",
  "ImRisSeit", "ResultPageSize", "ShowEmptySearchResultMessage",
]);

/** Map law abbreviations to their RIS Gesetzesnummer for paragraph-level links */
export const LAW_GESETZESNUMMER: Record<string, string> = {
  // --- Core civil/criminal/commercial ---
  stgb: "10002296",
  abgb: "10001622",
  ugb: "10001702",
  mrg: "10002531",
  dsg: "10001597",
  dsgvo: "10001597",
  kschg: "10002462",
  asvg: "10008147",
  estg: "10004570",
  ustg: "10004873",
  arbvg: "10008329",
  zpo: "10001699",
  io: "10001736",
  tkg: "20007784",
  angg: "10008069",
  ang: "10008069",
  urlg: "10008376",
  azg: "10008238",
  mschg: "10008464",
  gmbhg: "10001720",
  aktg: "10002070",
  urhg: "10001848",
  eo: "10001700",
  exeo: "10001700",
  phg: "10002864",
  avrag: "10008872",
  glbg: "20003395",
  eheg: "10001871",
  bao: "10003940",
  vwgvg: "20008376",
  weg: "20001921",
  wev: "20001921",
  wgg: "10011509",
  finstrg: "10003898",
  gebg: "10003882",
  grestg: "10004531",
  kstg: "10004569",
  vbg: "10008115",
  bdg: "10008470",
  vereinsg: "20001917",
  uwg: "10002665",
  markschg: "10002180",
  patg: "10002009",
  // --- Additional important Austrian laws ---
  vgg: "20009590",          // Verbrauchergewährleistungsgesetz
  ecg: "20001703",          // E-Commerce-Gesetz
  fagg: "20008783",         // Fern- und Auswärtsgeschäfte-Gesetz
  "b-vg": "10000138",      // Bundes-Verfassungsgesetz
  bvg: "10000138",
  avg: "10005768",          // Allgemeines Verwaltungsverfahrensgesetz
  vstg: "10005770",         // Verwaltungsstrafgesetz
  vstvg: "10005770",
  stpo: "10002326",         // Strafprozessordnung
  jgg: "10002825",          // Jugendgerichtsgesetz
  smg: "10011040",          // Suchtmittelgesetz
  geo: "10001953",          // Geschäftsordnung für Gerichte
  fbg: "10001988",          // Firmenbuchgesetz
  spg: "10005792",          // Sicherheitspolizeigesetz
  strag: "20004136",        // Strafregistergesetz
  gwg: "20001674",          // Gewerbeordnung (GewO)
  gewo: "20001674",
  gwog: "20001674",
  ogh: "10001699",          // (für Verfahren - ZPO)
  notarg: "10001677",       // Notariatsordnung
  agg: "10001283",          // Außerstreitgesetz (neu)
  aussstrg: "20003001",     // Außerstreitgesetz 2005
  erg: "10001622",          // Erbrecht → ABGB (Teil)
  gutgg: "10002088",        // GSVG (Gewerbl. Sozialversicherungsgesetz)
  gsvg: "10002088",
  bsvg: "10008691",         // Bauern-Sozialversicherungsgesetz
  agg2: "10001283",         // Arbeit-und-Gesundheit-Gesetz → map to correct
  aschg: "10009121",        // ArbeitnehmerInnenschutzgesetz
  mrhg: "10002531",         // Alias for MRG
  richtlwg: "10001945",     // Richterdienstgesetz (RStDG)
  rstdg: "10001945",
  bverg: "20003521",        // Bundesvergabegesetz
  bvergg: "20003521",
  dsb: "10001597",          // Datenschutzbehörde → DSG
  gspg: "10005594",         // Glücksspielgesetz
  meldegesetz: "10005799",  // Meldegesetz
  meldeg: "10005799",
  namg: "20004394",         // Namensänderungsgesetz
  passgesetz: "10005800",   // Passgesetz
  asylg: "20004240",        // Asylgesetz
  fmgeg: "20004242",        // Fremdenpolizeigesetz
  fpg: "20004242",
  niederlbg: "20004241",    // Niederlassungs- und Aufenthaltsgesetz
  nag: "20004241",
  sgb: "10001597",          // fallback alias
  versg: "10000127",        // Versammlungsgesetz
  medg: "10000719",         // Mediengesetz
  ärztegesetz: "20002160",  // Ärztegesetz
  ärzteg: "20002160",
  apothekengesetz: "10001413", // Apothekengesetz
  apothg: "10001413",
  kflg: "10012952",         // Kranken- und Kuranstaltengesetz
  epg: "20003005",          // Eingetragene Partnerschaft-Gesetz
  erbbaurechtsgesetz: "10001622",
  schug: "10009600",        // Schulunterrichtsgesetz
  usg: "20003020",          // Umweltschutzgesetz → Umweltverträglichkeitsprüfungsgesetz
  uvpg: "20003020",
  eiag: "10003940",         // ErbStRefG → BAO related
  wasserrechtsgesetz: "10010290", // Wasserrechtsgesetz
  wrg: "10010290",
  forstgesetz: "10010371",  // Forstgesetz
  forstg: "10010371",
};

/**
 * Laws that require an Artikel parameter in their RIS URL.
 * e.g. AngG uses Art. 1 § 20 → Artikel=1&Paragraf=20
 */
export const LAW_ARTIKEL: Record<string, string> = {
  angg: "1",
  ang: "1",
  finstrg: "1",
};

/**
 * Small paragraph allowlist for direct RIS NormDokument fallback links.
 *
 * We deliberately do not use LAW_GESETZESNUMMER wholesale here: that broad
 * map previously contained at least one bad value and caused users to land
 * on unrelated laws. These entries are high-traffic norms whose RIS target
 * pages are stable and already exercised by regression tests/live QA.
 */
const TRUSTED_DIRECT_NORM_PARAGRAPHS: Record<string, Set<string>> = {
  abgb: new Set(["864a", "879", "870", "1295", "1304", "1325", "1331", "1431", "1489", "1497"]),
  stgb: new Set(["5", "75", "76", "146", "147", "148"]),
  mrg: new Set(["16"]),
  kschg: new Set(["1", "6", "28"]),
  zpo: new Set(["384"]),
};

export const LAW_ALIASES: Record<string, string[]> = {
  stgb: ["strafgesetzbuch"],
  abgb: ["allgemeines bürgerliches gesetzbuch"],
  ugb: ["unternehmensgesetzbuch"],
  mrg: ["mietrechtsgesetz"],
  dsg: ["datenschutzgesetz"],
  dsgvo: ["datenschutz-grundverordnung", "datenschutz grundverordnung"],
  tkg: ["telekommunikationsgesetz", "tkg 2021"],
  io: ["insolvenzordnung"],
  zpo: ["zivilprozessordnung"],
  avg: ["allgemeines verwaltungsverfahrensgesetz"],
  jgg: ["jugendgerichtsgesetz"],
  smg: ["suchtmittelgesetz"],
  egzpo: ["einführungsgesetz zur zivilprozessordnung"],
  kschg: ["konsumentenschutzgesetz"],
  asvg: ["allgemeines sozialversicherungsgesetz"],
  estg: ["einkommensteuergesetz"],
  ustg: ["umsatzsteuergesetz"],
  arbvg: ["arbeitsverfassungsgesetz"],
  angg: ["angestelltengesetz", "ang"],
  ang: ["angestelltengesetz", "angg"],
  phg: ["produkthaftungsgesetz"],
  urlg: ["urlaubsgesetz"],
  azg: ["arbeitszeitgesetz"],
  mschg: ["mutterschutzgesetz"],
  glbg: ["gleichbehandlungsgesetz"],
  avrag: ["arbeitsvertragsrechts-anpassungsgesetz"],
  eo: ["exekutionsordnung"],
  exeo: ["exekutionsordnung"],
  gmbhg: ["gmbh-gesetz"],
  aktg: ["aktiengesetz"],
  urhg: ["urheberrechtsgesetz"],
  uwg: ["gesetz gegen den unlauteren wettbewerb"],
  eheg: ["ehegesetz"],
  bao: ["bundesabgabenordnung"],
  weg: ["wohnungseigentumsgesetz"],
  finstrg: ["finanzstrafgesetz"],
  gebg: ["gebührengesetz"],
  vbg: ["vertragsbedienstetengesetz"],
  bdg: ["beamten-dienstrechtsgesetz"],
  vgg: ["verbrauchergewährleistungsgesetz"],
  ecg: ["e-commerce-gesetz"],
  fagg: ["fern- und auswärtsgeschäfte-gesetz", "fernabsatzgesetz"],
  "b-vg": ["bundes-verfassungsgesetz"],
  bvg: ["bundes-verfassungsgesetz"],
  vstg: ["verwaltungsstrafgesetz"],
  stpo: ["strafprozessordnung"],
  fbg: ["firmenbuchgesetz"],
  spg: ["sicherheitspolizeigesetz"],
  aschg: ["arbeitnehmerschutzgesetz", "arbeitnehmerinnenschutzgesetz"],
  gsvg: ["gewerbliches sozialversicherungsgesetz"],
  bsvg: ["bauern-sozialversicherungsgesetz"],
  bvergg: ["bundesvergabegesetz"],
  gspg: ["glücksspielgesetz"],
  asylg: ["asylgesetz"],
  fpg: ["fremdenpolizeigesetz"],
  nag: ["niederlassungs- und aufenthaltsgesetz"],
  medg: ["mediengesetz"],
  wrg: ["wasserrechtsgesetz"],
  forstg: ["forstgesetz"],
  epg: ["eingetragene partnerschaft-gesetz"],
  ärztegesetz: ["ärzteg"],
};

// ============================================================
// Core URL builders
// ============================================================

export function buildRisSearchUrl(query: string, scope: "Justiz" | "Bundesnormen" = "Justiz"): string {
  return `https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=${scope}&Suchworte=${encodeURIComponent(query.trim())}`;
}

export function buildRisDokumentUrl(abfrage: string, dokumentnummer: string): string {
  return `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=${abfrage}&Dokumentnummer=${dokumentnummer}`;
}

export function buildRisNormDokumentUrl(
  gesetzesnummer: string,
  paragraph: string,
  artikel = "",
): string {
  return `https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=${encodeURIComponent(gesetzesnummer)}&Artikel=${encodeURIComponent(artikel)}&Paragraf=${encodeURIComponent(paragraph)}&Anlage=&Uebergangsrecht=`;
}

// ============================================================
// URL normalization — the main pipeline
// ============================================================

/**
 * Normalize any RIS URL to a canonical form:
 * - Valid Dokument.wxe links with JJR_/JJT_ → keep as direct doc links, strip session params
 * - Suchen.wxe/Ergebnis.wxe → reduce to minimal Abfrage+Suchworte
 * - XML doc URLs → convert to .wxe
 * - Fix wrong endpoints and parameter names
 */
export function normalizeRisUrl(url: string): string {
  if (!url || !url.includes("ris.bka.gv.at")) return url;

  let fixed = url;

  // 1. Convert XML document URLs to .wxe format
  const xmlMatch = fixed.match(/ris\.bka\.gv\.at\/Dokumente\/(\w+)\/([^/]+)\/[^/]+\.xml$/i);
  if (xmlMatch) {
    fixed = buildRisDokumentUrl(xmlMatch[1], xmlMatch[2]);
  }

  // 2. Fix wrong endpoint: JustizEntscheidung.wxe → Dokument.wxe
  fixed = fixed.replace(/JustizEntscheidung\.wxe/gi, "Dokument.wxe");

  // 3. Fix wrong parameter names
  fixed = fixed.replace(/([?&])Paragraph=/gi, "$1Paragraf=");
  fixed = fixed.replace(/([?&])Uebergang=/gi, "$1Uebergangsrecht=");

  // 4. Handle Dokument.wxe links — keep valid ones, just strip session params
  if (/\/Dokument\.wxe\?/i.test(fixed)) {
    return stripSessionParams(fixed);
  }

  // 5. Handle NormDokument.wxe links — keep as-is, strip session params
  if (/\/NormDokument\.wxe\?/i.test(fixed)) {
    return stripSessionParams(fixed);
  }

  // 6. Handle GeltendeFassung.wxe — keep as-is
  if (/\/GeltendeFassung\.wxe\?/i.test(fixed)) {
    return stripSessionParams(fixed);
  }

  // 7. Handle Suchen.wxe / Ergebnis.wxe → reduce to minimal search
  if (/\/(Suchen|Ergebnis)\.wxe\?/i.test(fixed)) {
    return canonicalizeSearchUrl(fixed);
  }

  return fixed;
}

/**
 * Strip session-specific and empty parameters from a RIS URL.
 */
function stripSessionParams(url: string): string {
  try {
    const parsed = new URL(url);
    const keysToDelete: string[] = [];
    for (const [key, value] of parsed.searchParams.entries()) {
      if (SESSION_PARAMS.has(key)) {
        keysToDelete.push(key);
      }
      // Also strip params with "Undefined" value or completely empty
      if (value === "Undefined" || value === "") {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Reduce a Suchen.wxe or Ergebnis.wxe URL to a clean, minimal search URL.
 * Keeps only Abfrage + Suchworte, normalizes the business number in Suchworte.
 */
function canonicalizeSearchUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const suchworte = parsed.searchParams.get("Suchworte")?.trim();
    const abfrage = parsed.searchParams.get("Abfrage") || "Justiz";

    if (!suchworte) {
      // No search terms — return a clean base
      return `https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=${abfrage}`;
    }

    // Normalize OGH business numbers in the search query
    const normalizedQuery = normalizeBusinessNumber(suchworte);
    const scope = abfrage === "Bundesnormen" ? "Bundesnormen" : "Justiz";
    return buildRisSearchUrl(normalizedQuery, scope);
  } catch {
    return url;
  }
}

/**
 * Normalize a malformed OGH business number (Geschäftszahl).
 * E.g. "150 OS0 11/20d" → "15 Os 11/20d", "130 OS0 25/19x" → "13 Os 25/19x"
 */
function normalizeBusinessNumber(query: string): string {
  const compact = query.replace(/\+/g, " ").replace(/\s+/g, " ").trim();

  // Pattern: senate(2-4 digits) + department(2-3 letters) + "0" + caseNr/yearSuffix
  // e.g. "150 OS0 11/20d" or "150OS0 11/20d"
  const match = compact.match(/\b(\d{2,4})\s*([A-Za-z]{2,3})0\s*(\d+)\/(\d{2})([A-Za-z])\b/i);
  if (match) {
    const formatted = formatBusinessNumber(match[1], match[2], match[3], match[4], match[5]);
    if (formatted) return formatted;
  }

  return compact;
}

/**
 * Format individual parts of a Judikatur business number.
 * Senate "150" → 15, Department "OS" → "Os", etc.
 */
function formatBusinessNumber(
  senateBlock: string,
  departmentRaw: string,
  caseBlock: string,
  year: string,
  suffixRaw: string
): string | null {
  const trimmed = senateBlock.trim();
  // If it ends with 0 and is longer than expected, strip trailing 0
  const normalizedSenate = trimmed.endsWith("0") && trimmed.length >= 3
    ? trimmed.slice(0, -1)
    : trimmed;

  const senateNr = parseInt(normalizedSenate, 10);
  const caseNr = parseInt(caseBlock, 10);
  if (!Number.isFinite(senateNr) || !Number.isFinite(caseNr)) return null;

  const department = departmentRaw.charAt(0).toUpperCase() + departmentRaw.slice(1).toLowerCase();
  const suffix = suffixRaw.toLowerCase();
  return `${senateNr} ${department} ${caseNr}/${year}${suffix}`;
}

// ============================================================
// Paragraph URL builder (with Artikel support)
// ============================================================

// buildParagraphUrl was deleted — see comments in findSourceUrl /
// buildFallbackCitationUrl. Direct NormDokument URLs were the source of
// the "wrong document" class of bug because LAW_GESETZESNUMMER had at
// least one incorrect entry. We now route fallback citations through RIS
// search unless the exact paragraph is in the small audited allowlist below.

// ============================================================
// Dynamic law abbreviation regex — built from LAW_GESETZESNUMMER keys
// ============================================================

/** All known law abbreviations sorted by length (longest first to match greedily) */
const ALL_LAW_ABBREVS = Object.keys(LAW_GESETZESNUMMER)
  .sort((a, b) => b.length - a.length)
  .join("|");

/** Regex to match any known law abbreviation as a word boundary */
const LAW_ABBREV_RE = new RegExp(`\\b(${ALL_LAW_ABBREVS})\\b`, "i");

function parseSingleParagraphCitation(citationText: string): { paragraph: string; lawKey: string } | null {
  const rawText = citationText.trim();
  if (!rawText) return null;
  if (/§§/.test(rawText) || /\bf{1,2}\.?\b/i.test(rawText)) return null;

  const paragraph = rawText.match(/§\s*(\d+[a-z]?)/i)?.[1];
  const lawKey = rawText.match(LAW_ABBREV_RE)?.[1]?.toLowerCase();
  if (!paragraph || !lawKey) return null;
  return { paragraph, lawKey };
}

function getGesetzesnummerFromRisUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/ris\.bka\.gv\.at$/i.test(parsed.hostname) && !/\.ris\.bka\.gv\.at$/i.test(parsed.hostname)) {
      return null;
    }
    if (!/\/(?:NormDokument|GeltendeFassung)\.wxe$/i.test(parsed.pathname)) return null;
    return parsed.searchParams.get("Gesetzesnummer");
  } catch {
    return url.match(/[?&]Gesetzesnummer=([^&#]+)/i)?.[1] ?? null;
  }
}

function buildSourceDerivedParagraphUrl(sourceUrl: string, paragraph: string): string | null {
  const gesetzesnummer = getGesetzesnummerFromRisUrl(sourceUrl);
  if (!gesetzesnummer) return null;
  return buildRisNormDokumentUrl(decodeURIComponent(gesetzesnummer), paragraph);
}

function isTrustedDirectNormParagraph(lawKey: string | undefined, paragraph: string | undefined): boolean {
  if (!lawKey || !paragraph) return false;
  return TRUSTED_DIRECT_NORM_PARAGRAPHS[lawKey]?.has(paragraph.toLowerCase()) ?? false;
}

export function buildTrustedRisNormUrl(citationText: string): string | null {
  const parsed = parseSingleParagraphCitation(citationText);
  if (!parsed) return null;
  if (!isTrustedDirectNormParagraph(parsed.lawKey, parsed.paragraph)) return null;

  const gesetzesnummer = LAW_GESETZESNUMMER[parsed.lawKey];
  if (!gesetzesnummer) return null;
  const artikel = LAW_ARTIKEL[parsed.lawKey] || "";
  return buildRisNormDokumentUrl(gesetzesnummer, parsed.paragraph, artikel);
}

// ============================================================
// Citation → URL resolution
// ============================================================

interface SourceInfo {
  provider: string;
  title: string;
  doc_ref: string;
  url: string;
}

/**
 * Try to find a matching source URL for a citation text.
 * Falls back to a direct RIS paragraph URL for known laws, but does NOT
 * generate generic search links (those lead to unrelated results).
 *
 * STRICT MATCHING: when the citation text contains a specific Aktenzeichen
 * (e.g. "12 Os 28/17f"), we only return a URL if a source's doc_ref/title/url
 * also contains that exact AZ. Falling through to RS/paragraph matches would
 * silently point "OGH 12 Os 28/17f" at a different case that merely shares
 * an RS number — the user sees one label, lands on another document. Safer
 * to return null and render the citation as plain text.
 */
export function findSourceUrl(citationText: string, allSources: SourceInfo[]): string | null {
  const text = citationText.trim().toLowerCase();
  if (!text) return null;

  const aktenzeichen = text.match(/\b\d+\s*(?:os|ob|ns|bs|ra|ro|bkr|bl)\s*\d+\/\d+\w*\b/i)?.[0]?.replace(/\s+/g, "").toLowerCase();
  const rsNummer = text.match(/\brs\s*(\d{7,})\b/i)?.[1];
  const celex = text.match(/\b\d{5}[a-z]{1,2}\d{4}\b/i)?.[0]?.toLowerCase();
  const ecjCase = text.match(/\b[ct]-\d{1,4}\/\d{2}\b/i)?.[0]?.toLowerCase();
  const paragraph = text.match(/§{1,2}\s*(\d+[a-z]?)/i)?.[1];
  const gesetz = text.match(LAW_ABBREV_RE)?.[1]?.toLowerCase();
  const lawAliases = gesetz ? [gesetz, ...(LAW_ALIASES[gesetz] ?? [])] : [];

  // CELEX number → match against any source whose doc_ref/title/url contains it.
  // Same strict-match semantics as Aktenzeichen: when the citation names a
  // specific CELEX, we trust ONLY a source that mentions that CELEX.
  if (celex) {
    for (const s of allSources) {
      const haystack = `${s.doc_ref || ""} ${s.title || ""} ${s.url || ""}`.toLowerCase();
      if (haystack.includes(celex)) return s.url;
    }
    return null;
  }

  // ECJ / EuG case reference (e.g. c-311/18) — same strict-match treatment.
  if (ecjCase) {
    const compact = ecjCase.replace(/\s+/g, "");
    for (const s of allSources) {
      const haystack = `${s.doc_ref || ""} ${s.title || ""} ${s.url || ""}`.toLowerCase().replace(/\s+/g, "");
      if (haystack.includes(compact)) return s.url;
    }
    return null;
  }

  // Citation has a concrete Aktenzeichen — require an exact AZ match.
  if (aktenzeichen) {
    for (const s of allSources) {
      const normalizedTitle = (s.title || "").toLowerCase().replace(/\s+/g, "");
      const normalizedRef = (s.doc_ref || "").toLowerCase().replace(/\s+/g, "");
      const normalizedUrl = (s.url || "").toLowerCase().replace(/\s+/g, "");
      if (normalizedRef.includes(aktenzeichen) || normalizedTitle.includes(aktenzeichen) || normalizedUrl.includes(aktenzeichen)) {
        return s.url;
      }
    }
    // AZ present but no source matched that exact AZ — do NOT fall through
    // to RS / paragraph matches, since those would mis-attribute the link.
    return null;
  }

  for (const s of allSources) {
    const srcTitle = (s.title || "").toLowerCase();
    const srcRef = (s.doc_ref || "").toLowerCase();
    const srcUrl = (s.url || "").toLowerCase();

    if (rsNummer && (srcRef.includes(rsNummer) || srcTitle.includes(rsNummer) || srcUrl.includes(rsNummer))) {
      return s.url;
    }

    if (paragraph && lawAliases.length > 0) {
      const hasLawAlias = lawAliases.some(alias => srcTitle.includes(alias) || srcRef.includes(alias));
      if (hasLawAlias) {
        const hasMatchingParagraph = srcUrl.includes(`paragraf=${paragraph}`)
          || srcTitle.includes(`§ ${paragraph}`)
          || srcRef.includes(`§ ${paragraph}`);

        if (hasMatchingParagraph) {
          return s.url;
        }

        const sourceDerivedUrl = isTrustedDirectNormParagraph(gesetz, paragraph)
          ? buildSourceDerivedParagraphUrl(s.url, paragraph)
          : null;
        if (sourceDerivedUrl) {
          return sourceDerivedUrl;
        }
        // No more LAW_GESETZESNUMMER fallback here — the static map proved
        // unreliable (e.g. angg → 10008069 actually pointed at the
        // Soziale-Sicherheit-Konvention, not AngG, so users landed on the
        // wrong document). Return null so preprocessContent can fall back
        // to a RIS search using the full citation text via
        // buildFallbackCitationUrl, which is robust even with a bad number.
      }
    }

    if (text.length > 10 && (srcTitle.includes(text.slice(0, 20)) || srcRef.includes(text.slice(0, 15)))) {
      return s.url;
    }
  }

  return null;
}

/**
 * Build a fallback citation URL for citations not found in sources.
 * Returns null if no meaningful fallback can be constructed.
 */
export function buildFallbackCitationUrl(citationText: string): string | null {
  const rawText = citationText.trim();
  if (!rawText) return null;

  const rsNummer = rawText.match(/\bRS\s*(\d{7,})\b/i)?.[1];
  if (rsNummer) {
    return buildRisSearchUrl(`RS${rsNummer}`, "Justiz");
  }

  const aktenzeichen = rawText.match(/\b\d+\s*(?:Os|Ob|Ns|Bs|Ra|Ro|Bkr|Bl)\s*\d+\/\d+\w*\b/i)?.[0];
  if (aktenzeichen) {
    return buildRisSearchUrl(aktenzeichen.replace(/\s+/g, " "), "Justiz");
  }

  // Paragraph references → exact direct links only for the tiny audited
  // allowlist above; everything else uses a RIS search with the full
  // citation text. We deliberately do NOT consult LAW_GESETZESNUMMER
  // wholesale: that map has at least one wrong entry (angg=10008069 →
  // Soziale-Sicherheit-Konvention) and likely more we have not caught, so
  // a broad direct-link fallback can silently land users on the wrong law.
  const looksLikeNorm = /§/.test(rawText) || LAW_ABBREV_RE.test(rawText);
  if (looksLikeNorm) {
    return buildTrustedRisNormUrl(rawText) ?? buildRisSearchUrl(rawText, "Bundesnormen");
  }

  return null;
}

// ============================================================
// Human-readable source labels
// ============================================================

/**
 * Pretty display names for the most common Austrian law abbreviations.
 * Keys match LAW_GESETZESNUMMER (lowercase). Anything not listed here
 * falls back to the key uppercased, which is still far better than
 * showing a raw Gesetzesnummer like "10002296".
 */
const LAW_DISPLAY_NAME: Record<string, string> = {
  stgb: "StGB", abgb: "ABGB", ugb: "UGB", mrg: "MRG", dsg: "DSG",
  dsgvo: "DSGVO", kschg: "KSchG", asvg: "ASVG", estg: "EStG", ustg: "UStG",
  arbvg: "ArbVG", zpo: "ZPO", io: "IO", tkg: "TKG", angg: "AngG",
  ang: "AngG", urlg: "UrlG", azg: "AZG", mschg: "MSchG", gmbhg: "GmbHG",
  aktg: "AktG", urhg: "UrhG", eo: "EO", phg: "PHG", avrag: "AVRAG",
  glbg: "GlBG", eheg: "EheG", bao: "BAO", vwgvg: "VwGVG", weg: "WEG",
  wgg: "WGG", finstrg: "FinStrG", gebg: "GebG", grestg: "GrEStG",
  kstg: "KStG", vbg: "VBG", bdg: "BDG", vereinsg: "VereinsG", uwg: "UWG",
  markschg: "MarkSchG", patg: "PatG", vgg: "VGG", ecg: "ECG", fagg: "FAGG",
  "b-vg": "B-VG", bvg: "B-VG", avg: "AVG", vstg: "VStG", stpo: "StPO",
  jgg: "JGG", smg: "SMG", fbg: "FBG", spg: "SPG", aschg: "ASchG",
  gsvg: "GSVG", bsvg: "BSVG", bvergg: "BVergG", gspg: "GSpG",
  asylg: "AsylG", fpg: "FPG", nag: "NAG", medg: "MedienG", wrg: "WRG",
  forstg: "ForstG", epg: "EPG", versg: "VersG", gewo: "GewO",
  notarg: "NotO",
};

/** Prefixes for senate codes that unambiguously belong to the OGH. */
const OGH_SENATE_CODES = new Set(["os", "ob", "ns", "bs", "bkr", "bl", "ok", "nc", "ga", "gv"]);
const VWGH_SENATE_CODES = new Set(["ra", "ro"]);

/** Reverse lookup: Gesetzesnummer → law abbreviation key (lowercase). */
let _lawAbbrevByNummer: Record<string, string> | null = null;
function getLawAbbrevByNummer(): Record<string, string> {
  if (_lawAbbrevByNummer) return _lawAbbrevByNummer;
  const map: Record<string, string> = {};
  for (const [abbrev, nr] of Object.entries(LAW_GESETZESNUMMER)) {
    // First key wins — LAW_GESETZESNUMMER has duplicate values (e.g. dsg/dsgvo).
    if (!map[nr]) map[nr] = abbrev;
  }
  _lawAbbrevByNummer = map;
  return map;
}

function prettyLawName(lowerKey: string): string {
  return LAW_DISPLAY_NAME[lowerKey] ?? lowerKey.toUpperCase();
}

/**
 * Format a raw doc_ref (and optional title) into a human-readable label for
 * the source chips in the chat UI. Handles three common ugly cases:
 *
 *   "10002296"         → "StGB"            (Gesetzesnummer → law abbrev)
 *   "12Os119/06a"      → "OGH 12 Os 119/06a" (compressed AZ → spaced + court)
 *   "7Ob23/71"         → "OGH 7 Ob 23/71"
 *
 * Everything else is returned unchanged (or the title if docRef is empty).
 */
export function formatSourceLabel(docRef: string | undefined | null, title?: string | null): string {
  const ref = (docRef || "").trim();
  const ttl = (title || "").trim();
  if (!ref) return ttl || "Quelle";

  // Pure Gesetzesnummer — reverse-lookup to a readable abbreviation.
  if (/^\d{7,10}$/.test(ref)) {
    const key = getLawAbbrevByNummer()[ref];
    if (key) return prettyLawName(key);
    return ttl || ref;
  }

  // Compressed Aktenzeichen like "12Os119/06a" or "7Ob607/90".
  // Senate codes are case-insensitive but listed with their canonical casing below.
  const SENATE_RE = /^(\d+)(Os|Ob|Ns|Bs|Ra|Ro|Bkr|Bl|Ok|Nc|Bkd|Ga|Gv|Fsc|StS|Rs|Ss)(\d+\/\d+\w*)$/i;
  const single = ref.match(SENATE_RE);
  if (single) {
    const [, num, senate, suffix] = single;
    const court = OGH_SENATE_CODES.has(senate.toLowerCase()) ? "OGH "
      : VWGH_SENATE_CODES.has(senate.toLowerCase()) ? "VwGH "
      : "";
    // Canonicalise senate-code casing: first letter upper, rest lower.
    const canonSenate = senate.charAt(0).toUpperCase() + senate.slice(1).toLowerCase();
    return `${court}${num} ${canonSenate} ${suffix}`;
  }

  // Pair with a secondary AZ in parens — e.g. "12Os56/77 (12Os79/77)".
  const PAIR_RE = /^(\d+)(Os|Ob|Ns|Bs|Ra|Ro|Bkr|Bl|Ok|Nc)(\d+\/\d+\w*)\s*\((\d+)(Os|Ob|Ns|Bs|Ra|Ro|Bkr|Bl|Ok|Nc)(\d+\/\d+\w*)\)$/i;
  const pair = ref.match(PAIR_RE);
  if (pair) {
    const [, n1, s1, t1, n2, s2, t2] = pair;
    const court = OGH_SENATE_CODES.has(s1.toLowerCase()) ? "OGH "
      : VWGH_SENATE_CODES.has(s1.toLowerCase()) ? "VwGH "
      : "";
    const canon = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return `${court}${n1} ${canon(s1)} ${t1} (${n2} ${canon(s2)} ${t2})`;
  }

  return ref;
}
