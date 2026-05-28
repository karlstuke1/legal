export type Jurisdiction = "AT";
export type SourceProvider = "AUTO" | "RIS" | "FINDOK" | "PARLAMENT";
export type ChatMode = "research" | "document_review" | "draft" | "vault" | "exam";
export type LegalArea = "zivilrecht" | "strafrecht" | "steuerrecht" | "oeffentliches_recht" | "arbeitsrecht" | "allgemein";

export interface ChatMessage {
  id: string;
  chat_id: string;
  role: "user" | "assistant" | "system";
  content: {
    text: string;
    file_ids?: string[];
    sources?: Array<{
      provider: string;
      results: Array<{
        doc_ref?: string;
        title?: string;
        date?: string;
        url?: string;
        score?: number;
        highlights?: string[];
        provider?: string;
        pinpoint?: string;
        snippet?: string;
        relevance?: number;
        evidence_status?: "verified_document" | "search_utility" | "fallback";
      }>;
      latencyMs?: number;
    }>;
  };
  created_at: string;
}

export interface Chat {
  id: string;
  workspace_id: string;
  matter_id: string | null;
  title: string;
  mode: ChatMode;
  jurisdiction: Jurisdiction[];
  sources: SourceProvider[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ChatFilters {
  jurisdiction: Jurisdiction[];
  sources: SourceProvider[];
  mode: ChatMode;
  autoRouter: boolean;
  legalArea: LegalArea;
}

export const MODE_LABELS: Record<ChatMode, string> = {
  research: "Chat / Research",
  document_review: "Dokumentenprüfung",
  draft: "Entwurf",
  vault: "Mandantenakten",
  exam: "Study",
};

export const JURISDICTION_FLAGS: Record<Jurisdiction, string> = {
  AT: "🇦🇹",
};

export const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  AT: "Österreich",
};

export const SOURCE_LABELS: Record<SourceProvider, string> = {
  AUTO: "Auto",
  RIS: "RIS",
  FINDOK: "Findok",
  PARLAMENT: "Parlament (AT)",
};

export const LEGAL_AREA_LABELS: Record<LegalArea, string> = {
  zivilrecht: "Zivilrecht",
  strafrecht: "Strafrecht",
  steuerrecht: "Steuerrecht",
  oeffentliches_recht: "Öffentliches Recht",
  arbeitsrecht: "Arbeitsrecht",
  allgemein: "Allgemein",
};

export const LEGAL_AREA_DESCRIPTIONS: Record<LegalArea, string> = {
  zivilrecht: "ABGB, UGB – Vertrags-, Haftungs- & Sachenrecht",
  strafrecht: "StGB – Tatbestände, Rechtsfolgen, Strafprozess",
  steuerrecht: "EStG, UStG, BAO – Steuerliche Einordnung",
  oeffentliches_recht: "B-VG, VwGVG, AVG – Verwaltungs- & Verfassungsrecht",
  arbeitsrecht: "ArbVG, AngG, AVRAG – Arbeitsverträge & Kündigungsschutz",
  allgemein: "Allgemeine Anfragen ohne spezifisches Rechtsgebiet",
};

/** Maps legal area to the best retrieval sources for AT */
export function resolveLegalAreaSources(area: LegalArea, _jurisdiction: Jurisdiction[]): SourceProvider[] {
  if (area === "allgemein") return [];

  const sources = new Set<SourceProvider>();

  switch (area) {
    case "zivilrecht":
    case "arbeitsrecht":
      sources.add("RIS");
      sources.add("PARLAMENT");
      break;
    case "strafrecht":
      sources.add("RIS");
      sources.add("PARLAMENT");
      break;
    case "steuerrecht":
      sources.add("RIS");
      sources.add("FINDOK");
      sources.add("PARLAMENT");
      break;
    case "oeffentliches_recht":
      sources.add("RIS");
      sources.add("PARLAMENT");
      break;
  }

  return sources.size > 0 ? Array.from(sources) : ["RIS"];
}
