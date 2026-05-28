/**
 * Comprehensive Legal Data Sources Configuration
 * Phase 1: Österreich + EU (MVP)
 * 
 * This file defines ALL available legal data sources, their APIs,
 * document volumes, and chunking strategies for the retrieval pipeline.
 */

// ============================================================
// 1a. RIS — Gesetze & Verordnungen (38 Apps, ~1.84M Dokumente)
// ============================================================

export interface RISApplikation {
  app: string;
  label: string;
  description: string;
  estimatedDocs: number;
  category: "bundesrecht" | "landesrecht" | "gemeinden" | "bezirke" | "sonstige" | "history" | "judikatur";
  active: boolean;
}

export const RIS_CONFIG = {
  baseUrl: "https://data.bka.gv.at/ris/api/v2.6",
  format: ["XML", "HTML", "RTF", "PDF"] as const,
  auth: "none" as const,
  license: "CC BY 3.0 AT",
  updateFrequency: "daily",
} as const;

export const RIS_BUNDESRECHT: RISApplikation[] = [
  { app: "BrKons", label: "Bundesrecht Konsolidiert", description: "Aktuelle Gesetze & Verordnungen", estimatedDocs: 437_000, category: "bundesrecht", active: true },
  { app: "BgblAuth", label: "BGBl Authentisch", description: "Bundesgesetzblatt I, II, III seit 2004", estimatedDocs: 18_500, category: "bundesrecht", active: true },
  { app: "BgblPdf", label: "BGBl PDF", description: "Bundesgesetzblatt PDF 1945–2003", estimatedDocs: 32_900, category: "bundesrecht", active: true },
  { app: "BgblAlt", label: "Historische Gesetzblätter", description: "1848–1940", estimatedDocs: 28_500, category: "bundesrecht", active: false },
  { app: "Begut", label: "Begutachtungsentwürfe", description: "Ministerialentwürfe", estimatedDocs: 4_460, category: "bundesrecht", active: true },
  { app: "RegV", label: "Regierungsvorlagen", description: "Regierungsvorlagen", estimatedDocs: 2_580, category: "bundesrecht", active: true },
  { app: "Erv", label: "Entwicklungen Rechtsbestand", description: "Entwicklungen des Rechtsbestandes", estimatedDocs: 138, category: "bundesrecht", active: false },
];

export const RIS_LANDESRECHT: RISApplikation[] = [
  { app: "LrKons", label: "Landesrecht Konsolidiert", description: "Alle 9 Bundesländer", estimatedDocs: 275_900, category: "landesrecht", active: true },
  { app: "LgblAuth", label: "Landesgesetzblatt Authentisch", description: "Digital", estimatedDocs: 11_560, category: "landesrecht", active: true },
  { app: "Lgbl", label: "Landesgesetzblatt", description: "Ältere/Scans", estimatedDocs: 21_400, category: "landesrecht", active: false },
  { app: "LgblNO", label: "LGBl Niederösterreich", description: "Landesgesetzblatt NÖ", estimatedDocs: 1_940, category: "landesrecht", active: false },
  { app: "Vbl", label: "Verordnungsblatt Tirol", description: "Tirol", estimatedDocs: 509, category: "landesrecht", active: false },
];

export const RIS_GEMEINDEN: RISApplikation[] = [
  { app: "Gr", label: "Gemeinderecht", description: "Verordnungen, Budgets, Stellenpläne", estimatedDocs: 17_450, category: "gemeinden", active: false },
  { app: "GrA", label: "Gemeinderecht Authentisch", description: "Flächenwidmung, Gebühren", estimatedDocs: 8_036, category: "gemeinden", active: false },
];

export const RIS_BEZIRKE: RISApplikation[] = [
  { app: "Bvb", label: "Bezirksverwaltungsbehörden", description: "Verordnungen", estimatedDocs: 2_165, category: "bezirke", active: false },
];

export const RIS_SONSTIGE: RISApplikation[] = [
  { app: "Erlaesse", label: "Erlässe", description: "Ministerielle Erlässe, Rundschreiben, Richtlinien", estimatedDocs: 1_610, category: "sonstige", active: true },
  { app: "PruefGewO", label: "Prüfungsgewerbeordnung", description: "Meisterprüfung etc.", estimatedDocs: 170, category: "sonstige", active: false },
  { app: "Avsv", label: "Amtl. Verlautbarungen SV", description: "ÖGK, Pharma", estimatedDocs: 4_676, category: "sonstige", active: false },
  { app: "Spg", label: "Strukturplan Gesundheit", description: "ÖSG, RSG", estimatedDocs: 69, category: "sonstige", active: false },
  { app: "Avn", label: "Amtl. Verbrauchernachrichten", description: "Verbraucher-/Veterinärnachrichten", estimatedDocs: 690, category: "sonstige", active: false },
  { app: "KmGer", label: "Kundmachungen Gerichte", description: "Geschäftsverteilung", estimatedDocs: 50, category: "sonstige", active: false },
  { app: "Upts", label: "Parteien-Transparenz-Senat", description: "Parteienfinanzierung", estimatedDocs: 34, category: "sonstige", active: false },
  { app: "Mrp", label: "Ministerratsprotokolle", description: "Kabinettssitzungen", estimatedDocs: 311, category: "sonstige", active: false },
];

// ============================================================
// 1b. RIS — Judikatur (15 Gerichte/Behörden, ~973K Entscheidungen)
// ============================================================

export interface JudikaturGericht {
  app: string;
  label: string;
  fullName: string;
  estimatedDocs: number;
  active: boolean;
  since?: string;
  until?: string;
}

export const RIS_JUDIKATUR_AKTIV: JudikaturGericht[] = [
  { app: "Justiz", label: "OGH", fullName: "Oberster Gerichtshof — Zivil + Strafrecht", estimatedDocs: 138_300, active: true },
  { app: "Vfgh", label: "VfGH", fullName: "Verfassungsgerichtshof", estimatedDocs: 23_930, active: true, since: "1980" },
  { app: "Vwgh", label: "VwGH", fullName: "Verwaltungsgerichtshof", estimatedDocs: 353_900, active: true, since: "1990" },
  { app: "Bvwg", label: "BVwG", fullName: "Bundesverwaltungsgericht", estimatedDocs: 279_700, active: true },
  { app: "Lvwg", label: "LVwG", fullName: "Landesverwaltungsgerichte (alle 9 Länder)", estimatedDocs: 74_180, active: true },
  { app: "Dsk", label: "DSB", fullName: "Datenschutzbehörde", estimatedDocs: 1_819, active: true },
  { app: "Dok", label: "BDK/BFG", fullName: "Bundesdisziplinarbehörde + BFG (Disziplinar)", estimatedDocs: 4_781, active: true },
  { app: "Pvak", label: "PVAK", fullName: "Personalvertretungsaufsichtsbehörde", estimatedDocs: 2_512, active: true },
  { app: "Gbk", label: "GBK", fullName: "Gleichbehandlungskommission", estimatedDocs: 987, active: true },
];

export const RIS_JUDIKATUR_HISTORISCH: JudikaturGericht[] = [
  { app: "Uvs", label: "UVS", fullName: "Unabhängige Verwaltungssenate", estimatedDocs: 25_938, active: false, until: "2014" },
  { app: "AsylGH", label: "AsylGH", fullName: "Asylgerichtshof", estimatedDocs: 53_113, active: false, since: "2008", until: "2013" },
  { app: "Ubas", label: "UBAS", fullName: "Bundesasylsenat", estimatedDocs: 4_052, active: false, until: "2008" },
  { app: "Umse", label: "UMSE", fullName: "Umweltsenat", estimatedDocs: 742, active: false },
  { app: "Bks", label: "BKS", fullName: "Bundeskommunikationssenat", estimatedDocs: 745, active: false },
  { app: "Verg", label: "VERG", fullName: "Vergabekontrollsenate / Bundesvergabeamt", estimatedDocs: 8_143, active: false },
];

export const RIS_JUDIKATUR_CHUNKING = [
  "Leitsatz",
  "Sachverhalt",
  "Rechtliche Beurteilung",
  "Begründung",
  "Spruch",
] as const;

// ============================================================
// 1c. FindOK — Steuerrecht & Finanzrecht
// ============================================================

export const FINDOK_CONFIG = {
  baseUrl: "https://findok.bmf.gv.at",
  apiNote: "Keine offizielle API. BFG via RIS OGD /Judikatur?Applikation=Dok zugänglich",
  priority: "BFG sofort via RIS (MVP), BMF-Richtlinien später (Phase 2)",
} as const;

export interface FindokRichtlinie {
  abbrev: string;
  fullName: string;
}

export const FINDOK_BMF_RICHTLINIEN: FindokRichtlinie[] = [
  { abbrev: "EStR 2000", fullName: "Einkommensteuerrichtlinien" },
  { abbrev: "LStR 2002", fullName: "Lohnsteuerrichtlinien" },
  { abbrev: "UStR 2000", fullName: "Umsatzsteuerrichtlinien" },
  { abbrev: "KStR 2001", fullName: "Körperschaftsteuerrichtlinien" },
  { abbrev: "VereinsR 2001", fullName: "Vereinsrichtlinien" },
  { abbrev: "UmgrStR 2002", fullName: "Umgründungssteuerrichtlinien" },
  { abbrev: "StiftR 2009", fullName: "Stiftungsrichtlinien" },
  { abbrev: "InvFR 2003", fullName: "Investmentfondsrichtlinien" },
  { abbrev: "NoVAR 2008", fullName: "Normverbrauchsabgabe-Richtlinien" },
  { abbrev: "KfzBStR 2021", fullName: "Kraftfahrzeugbesteuerungsrichtlinien" },
  { abbrev: "GebR 2025", fullName: "Gebührenrichtlinien" },
];

export const FINDOK_BMF_WEITERE = [
  "Erlässe — Ad-hoc-Klarstellungen zu Rechtsfragen",
  "Informationen — BMF-Informationsschreiben",
  "EAS — Express-Antwort-Service (Internationales Steuerrecht)",
  "Amtliche Veröffentlichungen — Offiziell authentifizierte Publikationen",
  "Zoll-Rechtsgrundlagen — UZK (Unionszollkodex) etc.",
  "Transferpreis-RL, Bewertungs-RL, GrESt-RL, Zoll-RL",
] as const;

export const FINDOK_BFG = {
  since: 2014,
  types: ["Erkenntnisse (meritorisch)", "Beschlüsse (Verfahren)", "Rechtssätze (Leitsätze)"],
} as const;

export const FINDOK_UFS = {
  period: "2003–2013",
  estimatedDecisions: 45_000,
  estimatedRechtssaetze: 18_000,
} as const;

// ============================================================
// 1d. EUR-Lex — EU-Gesetzgebung (1M+ Dokumente, 12 CELEX-Sektoren)
// ============================================================

export const EURLEX_CONFIG = {
  sparqlEndpoint: "https://publications.europa.eu/webapi/rdf/sparql",
  auth: "none (SPARQL), Auth (SOAP), EU Login (Bulk)",
  formats: ["RDF", "XML (Formex)", "PDF", "HTML"] as const,
  license: "CC BY 4.0",
  tools: ["eurlex R-Package", "eu_corpus_compiler Python"],
} as const;

export interface CELEXSektor {
  sektor: string;
  label: string;
  description: string;
  mvpRelevant: boolean;
}

export const EURLEX_SEKTOREN: CELEXSektor[] = [
  { sektor: "1", label: "Verträge", description: "EUV, AEUV, Grundrechtecharta, Beitrittsverträge", mvpRelevant: true },
  { sektor: "2", label: "Internationale Abkommen", description: "Abkommen, Protokolle, Briefwechsel, MoUs", mvpRelevant: false },
  { sektor: "3", label: "Rechtsakte", description: "Verordnungen, Richtlinien, Beschlüsse, Empfehlungen", mvpRelevant: true },
  { sektor: "4", label: "Ergänzendes Recht", description: "Ergänzendes Recht", mvpRelevant: false },
  { sektor: "5", label: "Vorbereitende Dokumente", description: "COM, SWD, JOIN — Gesetzesvorschläge, Impact Assessments", mvpRelevant: false },
  { sektor: "6", label: "EU-Rechtsprechung", description: "EuGH, EuG — Urteile, Beschlüsse, Schlussanträge", mvpRelevant: true },
  { sektor: "7", label: "Nationale Umsetzungsmaßnahmen", description: "Nationale Umsetzungsmaßnahmen", mvpRelevant: false },
  { sektor: "8", label: "Nationale Rechtsprechung", description: "Verweise auf nationales EU-Recht", mvpRelevant: false },
  { sektor: "9", label: "Parlamentarische Anfragen", description: "Parlamentarische Anfragen", mvpRelevant: false },
  { sektor: "0", label: "Konsolidierte Fassungen", description: "Konsolidierte Fassungen", mvpRelevant: false },
  { sektor: "C", label: "Amtsblatt C-Reihe", description: "Amtsblatt C-Reihe", mvpRelevant: false },
  { sektor: "E", label: "EFTA-Dokumente", description: "EFTA-GH Urteile, ESA-Entscheidungen, Ständiger Ausschuss", mvpRelevant: true },
];

export interface EURLexRechtsaktTyp {
  eliType: string;
  label: string;
}

export const EURLEX_RECHTSAKT_TYPEN: EURLexRechtsaktTyp[] = [
  { eliType: "reg", label: "Verordnungen" },
  { eliType: "reg_impl", label: "Durchführungsverordnungen" },
  { eliType: "reg_del", label: "Delegierte Verordnungen" },
  { eliType: "dir", label: "Richtlinien" },
  { eliType: "dir_impl", label: "Durchführungsrichtlinien" },
  { eliType: "dir_del", label: "Delegierte Richtlinien" },
  { eliType: "dec", label: "Beschlüsse" },
  { eliType: "dec_impl", label: "Durchführungsbeschlüsse" },
  { eliType: "dec_del", label: "Delegierte Beschlüsse" },
  { eliType: "reco", label: "Empfehlungen" },
  { eliType: "opinion", label: "Stellungnahmen" },
  { eliType: "resolution", label: "Entschließungen" },
  { eliType: "guideline", label: "Leitlinien (v.a. EZB)" },
];

export interface EURLexRechtsprechungTyp {
  code: string;
  label: string;
}

export const EURLEX_RECHTSPRECHUNG_TYPEN: EURLexRechtsprechungTyp[] = [
  { code: "CJ", label: "Urteile Gerichtshof" },
  { code: "TJ", label: "Urteile Gericht" },
  { code: "CO", label: "Beschlüsse/Orders Gerichtshof" },
  { code: "TO", label: "Beschlüsse/Orders Gericht" },
  { code: "CC", label: "Schlussanträge GA (Gerichtshof)" },
  { code: "TC", label: "Schlussanträge GA (Gericht)" },
  { code: "CV", label: "Gutachten des Gerichtshofs" },
  { code: "CP", label: "Stellungnahme des Generalanwalts" },
  { code: "CS", label: "Pfändungsbeschlüsse" },
  { code: "CT", label: "Drittwiderspruchsklagen (Gerichtshof)" },
  { code: "TT", label: "Drittwiderspruchsklagen (Gericht)" },
];

// ============================================================
// 1e. CURIA — EuGH-Rechtsprechung
// ============================================================

export const CURIA_CONFIG = {
  accessVia: "EUR-Lex CELLAR (CELEX Sektor 6)",
  note: "Kein eigenes API — läuft über EUR-Lex SPARQL/REST",
  estimatedDocs: 50_000,
  since: 1953,
  ecliFormat: "ECLI:EU:C:YYYY:NNN",
  license: "Frei nutzbar",
  courts: [
    { code: "C", label: "EuGH (Gerichtshof)", since: 1953 },
    { code: "T", label: "EuG (Gericht)", since: 1989 },
  ],
} as const;

// ============================================================
// 1f. Parlamentsmaterialien (25 Open Data Datasets)
// ============================================================

export const PARLAMENT_CONFIG = {
  baseUrl: "https://parlament.gv.at/opendata",
  format: "REST API, JSON",
  license: "CC BY 4.0",
  apiNote: "POST Requests, auch ?json=TRUE an Detail-URLs",
  priority: "MVP — API ist einfach zu integrieren",
  valueNote: "Extrem hilfreich für Gesetzesauslegung (teleologische Interpretation)",
} as const;

export interface ParlamentDataset {
  code: string;
  label: string;
  description: string;
  category: "gesetzgebung" | "kontrolle" | "weitere";
}

export const PARLAMENT_DATASETS: ParlamentDataset[] = [
  // Gesetzgebungsmaterialien
  { code: "RV", label: "Regierungsvorlagen", description: "Mit Erläuternden Bemerkungen", category: "gesetzgebung" },
  { code: "ME", label: "Ministerialentwürfe", description: "Begutachtungsverfahren", category: "gesetzgebung" },
  { code: "A", label: "Selbständige Anträge", description: "Gesetzesinitiativen von Abgeordneten", category: "gesetzgebung" },
  { code: "AB", label: "Ausschussberichte", description: "Ausschussberichte", category: "gesetzgebung" },
  { code: "GABR", label: "Gesetzesanträge BR", description: "Gesetzesanträge des Bundesrats", category: "gesetzgebung" },
  { code: "VOLKBG", label: "Volksbegehren", description: "Volksbegehren", category: "gesetzgebung" },

  // Parlamentarische Kontrolle
  { code: "J-AB", label: "Schriftliche Anfragen", description: "Schriftliche Anfragen + Anfragebeantwortungen (NR + BR)", category: "kontrolle" },
  { code: "DRINGL", label: "Dringliche Anfragen", description: "Dringliche Anfragen", category: "kontrolle" },
  { code: "RH", label: "Rechnungshofberichte", description: "Berichte des Rechnungshofs", category: "kontrolle" },
  { code: "VA", label: "Volksanwaltschaft", description: "Berichte der Volksanwaltschaft", category: "kontrolle" },
  { code: "MIN-BER", label: "Ministerialberichte", description: "Ministerialberichte", category: "kontrolle" },

  // Weitere
  { code: "STENO", label: "Stenographische Protokolle", description: "Ab 20. GP", category: "weitere" },
  { code: "PET-BI", label: "Petitionen & Bürgerinitiativen", description: "Petitionen + Bürgerinitiativen", category: "weitere" },
  { code: "EU-HA", label: "EU-Hauptausschuss", description: "Stellungnahmen", category: "weitere" },
  { code: "PK", label: "Parlamentskorrespondenz", description: "Ab 1997", category: "weitere" },
  { code: "AA-EA", label: "Abänderungs-/Entschließungsanträge", description: "Abänderungs- und Entschließungsanträge", category: "weitere" },
  { code: "BESCHL", label: "Beschlüsse", description: "NR + BR Beschlüsse", category: "weitere" },
];

// ============================================================
// 1g. Open Access Journals (Phase 2+)
// ============================================================

export const OA_JOURNALS_CONFIG = {
  priority: "Phase 2+",
  sources: [
    { name: "Austrian Law Journal (ALJ)", status: "peer-reviewed, DOAJ-indexed", accessible: true },
    { name: "~71 OA Law Journals im österreichischen Rechtsraum", status: "various", accessible: true },
  ],
  paywallSources: [
    "Manz Kommentare",
    "Linde Kommentare",
    "LexisNexis AT Kommentare",
  ],
  paywallNote: "Lizenzpartnerschaft erst mit Traction anstreben",
} as const;

// ============================================================
// Aggregated Stats
// ============================================================

export const DATA_SOURCE_STATS = {
  ris: {
    totalApps: 38,
    estimatedDocs: 1_840_000,
    bundesrecht: { apps: 7, docs: 524_000 },
    landesrecht: { apps: 5, docs: 311_000 },
    gemeinden: { apps: 2, docs: 25_000 },
    bezirke: { apps: 1, docs: 2_165 },
    sonstige: { apps: 8, docs: 7_600 },
    judikatur: { gerichte: 15, docs: 973_000 },
  },
  findok: {
    bfgSince: 2014,
    ufsPeriod: "2003–2013",
    ufsDecisions: 45_000,
    ufsRechtssaetze: 18_000,
    bmfRichtlinien: 11,
  },
  eurlex: {
    totalDocs: 1_000_000,
    celexSektoren: 12,
    mvpSektoren: ["1", "3", "6", "E"],
    sprachfilter: "DE",
  },
  curia: {
    estimatedDocs: 50_000,
    since: 1953,
  },
  parlament: {
    datasets: 25,
    license: "CC BY 4.0",
  },
} as const;

// ============================================================
// Provider → Data Source Mapping (for retrieval pipeline)
// ============================================================

export type RetrievalProvider =
  | "RIS"
  | "FINDOK"
  | "PARLAMENT";

export interface ProviderConfig {
  provider: RetrievalProvider;
  jurisdiction: "AT"[];
  label: string;
  description: string;
  apiType: string;
  baseUrl: string;
  mvpReady: boolean;
}

export const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    provider: "RIS",
    jurisdiction: ["AT"],
    label: "RIS (Rechtsinformationssystem)",
    description: "Bundesrecht, Landesrecht, Judikatur — 38 Apps, ~1.84M Dokumente",
    apiType: "OGD REST API v2.6",
    baseUrl: "https://data.bka.gv.at/ris/api/v2.6",
    mvpReady: true,
  },
  {
    provider: "FINDOK",
    jurisdiction: ["AT"],
    label: "FindOK (BMF Finanzdokumentation)",
    description: "Steuerrecht: BFG-Entscheidungen, BMF-Richtlinien, Erlässe",
    apiType: "BFG via RIS OGD, BMF via Reverse-Engineering",
    baseUrl: "https://findok.bmf.gv.at",
    mvpReady: true,
  },
  {
    provider: "PARLAMENT",
    jurisdiction: ["AT"],
    label: "Parlamentsmaterialien",
    description: "25 Open Data Datasets — Gesetzesmaterialien, parlamentarische Kontrolle",
    apiType: "REST API, JSON",
    baseUrl: "https://parlament.gv.at/opendata",
    mvpReady: true,
  },
];

/**
 * Get all MVP-ready providers for a given jurisdiction
 */
export function getMvpProviders(jurisdiction: "AT"[]): ProviderConfig[] {
  return PROVIDER_CONFIGS.filter(
    (p) => p.mvpReady && p.jurisdiction.some((j) => jurisdiction.includes(j as "AT"))
  );
}

/**
 * Get all active RIS Judikatur courts
 */
export function getActiveJudikaturCourts(): JudikaturGericht[] {
  return RIS_JUDIKATUR_AKTIV.filter((g) => g.active);
}

/**
 * Get total estimated document count across all sources
 */
export function getTotalDocumentCount(): number {
  const ris = DATA_SOURCE_STATS.ris.estimatedDocs;
  const eurlex = DATA_SOURCE_STATS.eurlex.totalDocs;
  const curia = DATA_SOURCE_STATS.curia.estimatedDocs;
  const findokUfs = DATA_SOURCE_STATS.findok.ufsDecisions + DATA_SOURCE_STATS.findok.ufsRechtssaetze;
  return ris + eurlex + curia + findokUfs;
}
