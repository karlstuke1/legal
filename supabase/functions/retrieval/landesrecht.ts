/**
 * Landesrecht scope detector for RIS retrieval.
 *
 * Without this, the retrieval pipeline only queries Bundesrecht +
 * Judikatur — Landesgesetze (Bauordnung, Naturschutz, Mindestsicherung,
 * Tourismus, …) are constitutionally Landessache (Art. 15 B-VG residual
 * competence) and live in a separate RIS endpoint. Lawyers asking about
 * "Wiener Bauordnung § 60" or "Mindestsicherung Steiermark" would
 * otherwise miss the actual Landesgesetz entirely.
 *
 * Triggering rules:
 *   1) Query mentions a specific Bundesland → query that Bundesland only
 *   2) Query contains a Landessache topic keyword → query the four
 *      most populous Bundesländer (Wien, NÖ, OÖ, Stmk; ~75% of AT pop)
 *   3) Otherwise → don't trigger (saves a RIS API call)
 *
 * Pure TypeScript, no runtime deps — usable from both Deno edge function
 * and Node-based vitest tests.
 */

const LANDESRECHT_KEYWORDS_RE = /\b(bauordnung|baurecht|bauanzeige|raumordnung|flaechenwidmung|flächenwidmung|bebauungsplan|naturschutz|jagd|fischerei|tourismus|veranstaltung|jugendschutz|mindestsicherung|sozialhilfe|behindertenhilfe|antidiskriminierung|gleichbehandlung[s]?landes|wohnbauförderung|landesabgabe|landesbeamten|landeslehrer|kindergarten|krippe|hort|leichenbestattung|feuerwehr|katastrophenhilfe|gemeindeordnung|landtagswahl|gemeinderatswahl)/i;

// Substring needles per Bundesland, including the adjective forms that
// lawyers use in practice ("Wiener Bauordnung", "Steiermärkische
// Bauordnung", "kärntnerisches Naturschutzgesetz", …). The mark-versus-
// adjective distinction matters because "Steiermärkisch" does NOT
// contain the substring "steiermark" (the umlaut breaks the match).
const BUNDESLAENDER_NAMES: Record<string, string> = {
  // Wien
  wien: "Wien",
  // Niederösterreich (multiple spellings + adjective forms)
  niederoesterreich: "Niederösterreich",
  niederösterreich: "Niederösterreich",
  niederoesterreichisch: "Niederösterreich",
  niederösterreichisch: "Niederösterreich",
  // Oberösterreich
  oberoesterreich: "Oberösterreich",
  oberösterreich: "Oberösterreich",
  oberoesterreichisch: "Oberösterreich",
  oberösterreichisch: "Oberösterreich",
  // Steiermark — base form + adjective (the latter has the umlaut break)
  steiermark: "Steiermark",
  steiermärkisch: "Steiermark",
  steiermaerkisch: "Steiermark",
  // Tirol — base form covers "tiroler"/"tirolisch" via prefix
  tirol: "Tirol",
  // Vorarlberg
  vorarlberg: "Vorarlberg",
  // Salzburg
  salzburg: "Salzburg",
  // Kärnten — base + adjective + ASCII variant
  kaernten: "Kärnten",
  kärnten: "Kärnten",
  kaerntner: "Kärnten",
  kärntner: "Kärnten",
  // Burgenland — base form covers "burgenländisch" via prefix
  burgenland: "Burgenland",
};

export const DEFAULT_LANDESRECHT_BUNDESLAENDER = ["Wien", "Niederösterreich", "Oberösterreich", "Steiermark"];

export interface LandesrechtScope {
  /** True when at least one Landesrecht query should be added. */
  trigger: boolean;
  /** Canonical Bundesland names to query (max 4). */
  bundeslaender: string[];
}

export function detectLandesrechtScope(query: string): LandesrechtScope {
  if (!query) return { trigger: false, bundeslaender: [] };
  const lower = query.toLowerCase();

  // Explicit Bundesland mention always wins.
  const explicit: string[] = [];
  for (const [needle, canonical] of Object.entries(BUNDESLAENDER_NAMES)) {
    if (lower.includes(needle) && !explicit.includes(canonical)) {
      explicit.push(canonical);
    }
  }
  if (explicit.length > 0) {
    return { trigger: true, bundeslaender: explicit.slice(0, 4) };
  }

  // No Bundesland named — but the topic is typically Landessache?
  if (LANDESRECHT_KEYWORDS_RE.test(lower)) {
    return { trigger: true, bundeslaender: DEFAULT_LANDESRECHT_BUNDESLAENDER };
  }

  return { trigger: false, bundeslaender: [] };
}
