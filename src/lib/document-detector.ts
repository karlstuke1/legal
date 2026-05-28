export type DocumentType = "vertrag" | "schriftsatz" | "gutachten" | "erklaerung" | "checkliste" | "generic";

export interface DocumentDetection {
  isDocument: boolean;
  documentType: DocumentType;
  title: string;
  score: number;
}

const TYPE_PATTERNS: { type: DocumentType; regex: RegExp; weight: number }[] = [
  { type: "vertrag", regex: /\b(?:Vertrag|Vereinbarung|Präambel|Gerichtsstand|Vertragspartei|Vertragsgegenstand)\b/i, weight: 0 },
  { type: "schriftsatz", regex: /\b(?:Schriftsatz|Klageschrift|Berufung|Antragsteller|Antragsgegner|Beklagte[rn]?|Kläger)\b/i, weight: 0 },
  { type: "gutachten", regex: /\b(?:Gutachten|Stellungnahme|Rechtsgutachten|Sachverständig)\b/i, weight: 0 },
  { type: "erklaerung", regex: /\b(?:Erklärung|Datenschutzerklärung|Einwilligung|Vollmacht|Satzung)\b/i, weight: 0 },
  { type: "checkliste", regex: /\b(?:Checkliste|Prüfliste|Ablaufplan)\b/i, weight: 0 },
];

const TITLE_EXTRACTORS: RegExp[] = [
  /^#+\s*(.{5,80})$/m,
  /\*\*(.{5,80})\*\*/,
];

export function detectDocumentContent(
  responseText: string,
  userQuery: string,
  mode: string
): DocumentDetection {
  // Only detect documents in draft mode — research, playbook etc. should never auto-trigger
  if (mode !== "draft" && mode !== "document_review") {
    return { isDocument: false, documentType: "generic", title: "Dokument", score: 0 };
  }

  let score = 0;

  // Mode signal
  if (mode === "draft") score += 5;

  // Numbered paragraphs (§ 1, § 2, etc.)
  const paragraphMatches = responseText.match(/§\s*\d+/g);
  if (paragraphMatches && paragraphMatches.length >= 2) score += 3;

  // "Zwischen ... und ..." contract header
  if (/zwischen\s+.{2,50}\s+und\s+.{2,50}/i.test(responseText)) score += 3;

  // Placeholders like [PLATZHALTER], [NAME], [DATUM]
  const placeholders = responseText.match(/\[[A-ZÄÖÜ][A-ZÄÖÜ\s/:-]{2,30}\]/g);
  if (placeholders && placeholders.length >= 2) score += 2;

  // Legal headings
  if (/\b(?:Präambel|Gerichtsstand|Schlussbestimmungen|Salvatorische\s+Klausel|Vertragsstrafen?)\b/i.test(responseText)) score += 2;

  // Legal formulations
  if (/\b(?:hiermit\s+wird|die\s+Parteien\s+vereinbaren|wird\s+(?:wie\s+folgt\s+)?vereinbart)\b/i.test(responseText)) score += 2;

  // Long response (>800 words)
  if (responseText.split(/\s+/).length > 800) score += 1;

  // User query signals
  if (/\b(?:erstell|verfass|entwirf|schreib|formulier|ausarbeit)\b/i.test(userQuery)) score += 2;

  const isDocument = score >= 5;

  // Detect type
  let documentType: DocumentType = "generic";
  for (const tp of TYPE_PATTERNS) {
    if (tp.regex.test(responseText)) {
      documentType = tp.type;
      break;
    }
  }

  // Extract title
  let title = "Dokument";
  for (const re of TITLE_EXTRACTORS) {
    const m = responseText.match(re);
    if (m?.[1]) {
      title = m[1].replace(/[*#]/g, "").trim();
      break;
    }
  }

  return { isDocument, documentType, title, score };
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  vertrag: "Vertrag",
  schriftsatz: "Schriftsatz",
  gutachten: "Gutachten",
  erklaerung: "Erklärung",
  checkliste: "Checkliste",
  generic: "Dokument",
};
