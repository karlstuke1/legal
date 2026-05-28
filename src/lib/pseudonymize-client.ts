/**
 * Client-side pseudonymization — runs entirely in the browser.
 * No data ever leaves the client. Uses regex patterns for common PII in German legal texts.
 */

export interface DetectedEntity {
  original: string;
  replacement: string;
  category: string;
  start: number;
  end: number;
}

const CATEGORIES: Record<string, { label: string; color: string }> = {
  email: { label: "E-Mail", color: "blue" },
  iban: { label: "IBAN", color: "emerald" },
  phone: { label: "Telefon", color: "violet" },
  date: { label: "Datum", color: "amber" },
  zipCity: { label: "PLZ/Ort", color: "rose" },
  aktenzeichen: { label: "Aktenzeichen", color: "cyan" },
  sozialversicherung: { label: "SV-Nr.", color: "orange" },
  steuernummer: { label: "Steuer-Nr.", color: "orange" },
};

export const CATEGORY_META = CATEGORIES;

// Counters per category to generate unique replacements
function makeReplacementGenerator() {
  const counters: Record<string, number> = {};
  return (category: string) => {
    counters[category] = (counters[category] || 0) + 1;
    const n = counters[category];
    switch (category) {
      case "email": return `[EMAIL_${n}]`;
      case "iban": return `[IBAN_${n}]`;
      case "phone": return `[TEL_${n}]`;
      case "date": return `[DATUM_${n}]`;
      case "zipCity": return `[ORT_${n}]`;
      case "aktenzeichen": return `[AZ_${n}]`;
      case "sozialversicherung": return `[SVNR_${n}]`;
      case "steuernummer": return `[STNR_${n}]`;
      default: return `[REDACTED_${n}]`;
    }
  };
}

interface PatternDef {
  category: string;
  regex: RegExp;
}

const PATTERNS: PatternDef[] = [
  // E-Mail
  { category: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  // IBAN (DE, AT, CH and generic)
  { category: "iban", regex: /\b[A-Z]{2}\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{0,4}\s?\d{0,2}\b/g },
  // German phone numbers
  { category: "phone", regex: /(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,5}\)?[\s-]?)?\d{3,4}[\s-]?\d{2,6}/g },
  // German dates (dd.mm.yyyy, dd.mm.yy, dd/mm/yyyy)
  { category: "date", regex: /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g },
  // German PLZ + City
  { category: "zipCity", regex: /\b\d{4,5}\s+[A-ZÄÖÜ][a-zäöüß]+(?:\s+(?:am|an|bei|im|in)\s+[A-ZÄÖÜ][a-zäöüß]+)?\b/g },
  // Austrian Sozialversicherungsnummer
  { category: "sozialversicherung", regex: /\b\d{4}\s?\d{6}\b/g },
  // Aktenzeichen (e.g. 1 BvR 123/45, 2 Ob 45/22x)
  { category: "aktenzeichen", regex: /\b\d{1,3}\s+[A-Za-z]{1,5}\s+\d{1,5}\/\d{2,4}[a-z]?\b/g },
  // German Steuernummer
  { category: "steuernummer", regex: /\b\d{2,3}\/\d{3}\/\d{4,5}\b/g },
];

/**
 * Detect PII entities in text using regex patterns.
 * Returns non-overlapping matches sorted by position.
 */
export function detectEntities(text: string): DetectedEntity[] {
  const raw: DetectedEntity[] = [];
  const nextReplacement = makeReplacementGenerator();

  for (const { category, regex } of PATTERNS) {
    // Reset regex state
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const original = match[0].trim();
      if (original.length < 4) continue; // skip very short false-positives
      raw.push({
        original,
        replacement: nextReplacement(category),
        category,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Remove overlapping matches — keep longer match
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const result: DetectedEntity[] = [];
  let lastEnd = -1;
  for (const entity of raw) {
    if (entity.start >= lastEnd) {
      result.push(entity);
      lastEnd = entity.end;
    }
  }

  return result;
}

/**
 * Apply replacements to text. Entities must be sorted by start position.
 */
export function applyReplacements(
  text: string,
  entities: DetectedEntity[]
): string {
  // Sort by position descending so indices stay valid
  const sorted = [...entities].sort((a, b) => b.start - a.start);
  let result = text;
  for (const e of sorted) {
    result = result.slice(0, e.start) + e.replacement + result.slice(e.end);
  }
  return result;
}

/**
 * Read file content as text (supports .txt, .md, .csv, and basic text-based formats).
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    reader.readAsText(file);
  });
}
