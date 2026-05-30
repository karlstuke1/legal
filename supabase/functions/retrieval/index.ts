import { makeCorsHeaders } from "../_shared/cors.ts";
import { sanitizeFindokUrl } from "./findok-url.ts";
import { sanitizeParlamentUrl } from "./parlament-url.ts";
import { rerankResults } from "./rerank.ts";
import { detectLandesrechtScope } from "./landesrecht.ts";
import { filterAustrianPrivacyLawSources } from "./source-filter.ts";
import {
  extractMessageContent,
  openRouterChatCompletion,
  openRouterEmbedding,
  parseJsonObject,
  strictJsonSchema,
} from "../_shared/openrouter.ts";
import {
  annotateEvidenceStatus,
  isEvidentiarySource,
  type SourceEvidenceStatus,
  withEvidenceStatus,
} from "../_shared/source-evidence.ts";
import { resolveExactRisRechtssatzSources } from "../_shared/ris-rechtssatz.ts";

Deno.serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Authenticate user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { query, providers: requestedProviders, jurisdiction } = body;
    if (!query || typeof query !== "string" || query.length > 5000) {
      return new Response(JSON.stringify({ error: "Invalid query" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let providerNames: string[] = requestedProviders || ["RIS", "FINDOK"];
    const exactNormOnly = body?.exactNormOnly === true;

    if (exactNormOnly && providerNames.includes("RIS")) {
      const exactNormSource = await resolveExactRisNormSource(query);
      if (exactNormSource) {
        return new Response(JSON.stringify([{
          provider: "RIS",
          results: [exactNormSource],
          latencyMs: 0,
        }]), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (providerNames.includes("RIS")) {
      const exactRechtssatzSources = await resolveExactRisRechtssatzSources(query);
      if (exactRechtssatzSources.length > 0) {
        return new Response(JSON.stringify([{
          provider: "RIS",
          results: exactRechtssatzSources,
          latencyMs: 0,
        }]), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ============================================================
    // SPEED FIX: Run decomposition and reformulation IN PARALLEL
    // ============================================================
    const [subQueryResult, reformulationResult] = await Promise.allSettled([
      decomposeQuery(query, jurisdiction || []),
      reformulateQuery(query, jurisdiction || []),
    ]);
    
    const subQueries = subQueryResult.status === "fulfilled" ? subQueryResult.value : [query];
    const isDecomposed = subQueries.length > 1;
    if (isDecomposed) {
      console.log(`[retrieval] Query decomposed into ${subQueries.length} sub-queries:`, subQueries);
    }

    let reformulated: ReformulatedQuery | null = null;
    if (reformulationResult.status === "fulfilled" && reformulationResult.value) {
      reformulated = reformulationResult.value;
      console.log(`LLM reformulation: area=${reformulated.legal_area}, norms=${JSON.stringify(reformulated.norms)}`);
      providerNames = smartProviderOverride(providerNames, reformulated, jurisdiction || []);
      console.log(`Final providers: ${JSON.stringify(providerNames)}`);
    } else if (reformulationResult.status === "rejected") {
      console.error("LLM reformulation failed, using keyword fallback:", reformulationResult.reason);
    }

    // Overall timeout: abort all providers after 15 seconds
    const overallTimeout = AbortSignal.timeout(15000);
    
    // If decomposed, run ALL sub-queries IN PARALLEL (not sequentially!)
    const queriesToRun = isDecomposed ? subQueries.slice(0, 3) : [query]; // Cap at 3 sub-queries

    // Shared dedup set across sub-queries: prevents redundant results early
    const globalSeenUrls = new Set<string>();

    const subQueryResults = await Promise.allSettled(
      queriesToRun.map(async (q) => {
        const results = await Promise.allSettled(
          providerNames.map((p: string) => {
            if (overallTimeout.aborted) return Promise.reject(new Error("Overall timeout"));
            return searchProvider(p, q, jurisdiction, reformulated);
          })
        );
        return providerNames.map((name: string, i: number) => {
          const r = results[i];
          if (r.status === "fulfilled") {
            // Pre-filter duplicates across sub-queries
            const filtered = r.value.results.filter(sr => {
              const key = (sr.url || "").replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase()
                || sr.title.toLowerCase().replace(/[^a-zäöüß0-9]/g, "").slice(0, 60);
              if (globalSeenUrls.has(key)) return false;
              globalSeenUrls.add(key);
              return true;
            });
            return { provider: name, results: filtered, latencyMs: r.value.latencyMs };
          }
          console.error(`Provider ${name} failed:`, r.reason);
          return { provider: name, results: [] as SearchResult[], latencyMs: 0 };
        });
      })
    );

    const allOutputs: { provider: string; results: SearchResult[]; latencyMs?: number }[] = [];
    for (const r of subQueryResults) {
      if (r.status === "fulfilled") allOutputs.push(...r.value);
    }

    // Merge and deduplicate results across sub-queries (handles any remaining dupes)
    const mergedOutput = mergeSubQueryResults(allOutputs);

    // Enrich top results with actual content via Firecrawl
    const enrichedOutput = await enrichWithContent(mergedOutput);

    // LLM-based semantic re-ranking — single Flash-Lite call that scores
    // each candidate document's relevance to the user's actual question.
    // Without this, we return up to ~30 candidates ranked only by provider
    // score + heuristics (RS-Nummer presence etc.) — none of which know
    // whether the document actually answers the question. Adds a
    // `relevance` field (0..1) per result and sorts by it; the client's
    // existing buildSourceContext folds it into rankScore.
    await Promise.all(
      enrichedOutput.map(async (group) => {
        group.results = await rerankResults(query, group.results);
      }),
    );

    // Fire-and-forget: cache enriched results in vector DB for future semantic search
    cacheResultsInVectorDB(enrichedOutput, jurisdiction).catch(e =>
      console.warn("[retrieval] Vector cache failed (non-critical):", e)
    );

    return new Response(JSON.stringify(enrichedOutput), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("retrieval error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// Query Decomposition — Break complex questions into sub-queries
// ============================================================

const DECOMPOSE_SCHEMA = strictJsonSchema("retrieval_subqueries", {
  type: "object",
  properties: {
    queries: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string" },
    },
  },
  required: ["queries"],
  additionalProperties: false,
});

async function decomposeQuery(query: string, jurisdictions: string[]): Promise<string[]> {
  // Only decompose if query is complex enough
  const questionCount = (query.match(/\?/g) || []).length;
  const wordCount = query.split(/\s+/).length;
  const hasMultipleAspects = questionCount > 1 || wordCount > 40 || /\b(und|sowie|einerseits|andererseits|erstens|zweitens|außerdem|darüber hinaus)\b/i.test(query);
  
  if (!hasMultipleAspects) return [query];

  try {
    const resp = await openRouterChatCompletion({
      messages: [
        { role: "system", content: "Du zerlegst komplexe juristische Fragen in 2-4 einzelne, fokussierte Suchanfragen für österreichische Rechtsdatenbanken." },
        { role: "user", content: `Zerlege diese Frage in einzelne Suchanfragen:\n\n"${query}"\n\nJurisdiktionen: ${JSON.stringify(jurisdictions)}` },
      ],
      responseFormat: DECOMPOSE_SCHEMA,
      maxTokens: 1000,
      reasoningEffort: "low",
      requireParameters: true,
      signal: AbortSignal.timeout(4000),
    });

    if (!resp.ok) { await resp.text(); return [query]; }
    const data = await resp.json();
    const parsed = parseJsonObject(extractMessageContent(data));
    if (Array.isArray(parsed.queries) && parsed.queries.length >= 2 && parsed.queries.length <= 5) {
      return parsed.queries.filter((q: any) => typeof q === "string" && q.length > 5);
    }
    return [query];
  } catch (e) {
    console.warn("[retrieval] Query decomposition failed:", e);
    return [query];
  }
}

// ============================================================
// Merge sub-query results — deduplicate across multiple retrieval runs
// ============================================================

function mergeSubQueryResults(
  outputs: { provider: string; results: SearchResult[]; latencyMs?: number }[]
): { provider: string; results: SearchResult[]; latencyMs: number }[] {
  const byProvider = new Map<string, { results: Map<string, SearchResult>; latencyMs: number }>();

  for (const output of outputs) {
    const key = output.provider;
    if (!byProvider.has(key)) {
      byProvider.set(key, { results: new Map(), latencyMs: output.latencyMs || 0 });
    }
    const entry = byProvider.get(key)!;
    entry.latencyMs = Math.max(entry.latencyMs, output.latencyMs || 0);

    for (const r of output.results) {
      // Deduplicate by URL or title
      const dedupeKey = (r.url || "").replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase()
        || r.title.toLowerCase().replace(/[^a-zäöüß0-9]/g, "").slice(0, 60);
      
      if (!entry.results.has(dedupeKey)) {
        entry.results.set(dedupeKey, r);
      } else {
        // Keep the one with higher score or longer snippet
        const existing = entry.results.get(dedupeKey)!;
        if (r.score > existing.score || (r.snippet?.length || 0) > (existing.snippet?.length || 0)) {
          entry.results.set(dedupeKey, r);
        }
      }
    }
  }

  return Array.from(byProvider.entries()).map(([provider, { results, latencyMs }]) => ({
    provider,
    results: Array.from(results.values()).sort((a, b) => b.score - a.score),
    latencyMs,
  }));
}

interface SearchResult {
  doc_ref: string;
  title: string;
  date: string;
  url: string;
  score: number;
  highlights: string[];
  provider: string;
  pinpoint?: string;
  snippet?: string;
  // Set by rerank.ts after retrieval, normalized 0..1. Higher = more
  // relevant to the user's actual question. The frontend's source
  // ranker folds this into rankScore.
  relevance?: number;
  evidence_status?: SourceEvidenceStatus;
}

// ============================================================
// LLM Query Reformulation via Lovable AI Gateway
// ============================================================

interface ReformulatedQuery {
  legal_area: string;
  norms: string[];
  ris_keywords: string[];
  ris_aspect_searches: string[];
  case_law_searches: string[];
  generic_keywords: string[];
  gii_keywords?: string[];
  gii_law?: string;
  openjur_keywords?: string[];
  fedlex_keywords?: string[];
}

const REFORMULATE_SCHEMA = strictJsonSchema("retrieval_plan", {
  type: "object",
  properties: {
    legal_area: { type: "string" },
    norms: { type: "array", items: { type: "string" } },
    ris_keywords: { type: "array", items: { type: "string" } },
    ris_aspect_searches: { type: "array", items: { type: "string" } },
    case_law_searches: { type: "array", items: { type: "string" } },
    generic_keywords: { type: "array", items: { type: "string" } },
    gii_keywords: { type: "array", items: { type: "string" } },
    gii_law: { type: "string" },
    openjur_keywords: { type: "array", items: { type: "string" } },
    fedlex_keywords: { type: "array", items: { type: "string" } },
  },
  required: ["legal_area", "norms", "ris_keywords", "ris_aspect_searches", "case_law_searches", "generic_keywords", "gii_keywords", "gii_law", "openjur_keywords", "fedlex_keywords"],
  additionalProperties: false,
});

async function reformulateQuery(query: string, jurisdictions: string[]): Promise<ReformulatedQuery | null> {
  const prompt = `Analysiere diese juristische Frage und extrahiere optimierte Suchbegriffe für österreichische Rechtsdatenbanken.
Frage: "${query}"

WICHTIG: Dieses System ist NUR für österreichisches Recht (AT) ausgelegt. EU-Recht wird nur im AT-Kontext behandelt (nationale Umsetzungsgesetze).
- AT-Strafrecht: Suche nach Rechtssätzen (RS-Nummern) und OGH-Geschäftszahlen
- Bei DSGVO/EU-Themen IMMER auch nationale AT-Umsetzungsgesetze (DSG, TKG 2021, ECG, FAGG, KSchG) in Keywords aufnehmen

WICHTIG — Vollständigkeit: Extrahiere Keywords für ALLE relevanten Aspekte:
- Tatbestandsmerkmale und Definitionen
- **Rechtsfolgen** (Schadenersatz, Haftung, Strafe, Sanktionen)
- **Fristen und Verjährung**
- **Beweislast**
- **Verfahrensschritte**

Antworte NUR als JSON (kein Markdown, keine Erklärung):
{
  "legal_area": "z.B. Mietrecht, Strafrecht, Arbeitsrecht",
  "norms": ["z.B. § 30 MRG", "§ 146 öStGB", "§ 174 TKG 2021"],
  "ris_keywords": ["österreichische Suchbegriffe für RIS"],
  "ris_aspect_searches": ["Täuschung Tatsachen Irrtum", "Vermögensverfügung Vermögensschaden"],
  "case_law_searches": ["OGH Einwilligung Newsletter Direktwerbung", "VwGH DSGVO Einwilligung"],
  "generic_keywords": ["allgemeine juristische Suchbegriffe inkl. Rechtsfolgen, Fristen, NATIONALE Umsetzungsgesetze"]
}

WICHTIG für ris_aspect_searches: Zerlege die Frage in 3-5 einzelne juristische ASPEKTE und gib für JEDEN einen separaten Suchstring an.
WICHTIG für case_law_searches: Erstelle 2-4 Suchstrings die EXPLIZIT auf Gerichtsentscheidungen abzielen (OGH/VwGH/VfGH).`;

  try {
    const resp = await openRouterChatCompletion({
      messages: [
        { role: "system", content: "Du bist ein juristischer Suchbegriff-Extraktor für österreichisches Recht. Antworte strikt nach Schema." },
        { role: "user", content: prompt },
      ],
      responseFormat: REFORMULATE_SCHEMA,
      maxTokens: 2500,
      reasoningEffort: "low",
      requireParameters: true,
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      console.error(`LLM reformulation HTTP ${resp.status}`);
      await resp.text();
      return null;
    }

    const data = await resp.json();
    const parsed = parseJsonObject(extractMessageContent(data));
    
    return {
      legal_area: parsed.legal_area || "",
      norms: parsed.norms || [],
      ris_keywords: parsed.ris_keywords || [],
      ris_aspect_searches: parsed.ris_aspect_searches || [],
      case_law_searches: parsed.case_law_searches || [],
      generic_keywords: parsed.generic_keywords || [],
      gii_keywords: parsed.gii_keywords || [],
      gii_law: parsed.gii_law || "",
      openjur_keywords: parsed.openjur_keywords || [],
      fedlex_keywords: parsed.fedlex_keywords || [],
    };
  } catch (e) {
    console.error("LLM reformulation error:", e);
    return null;
  }
}

/** Get effective keywords for a provider: LLM-reformulated if available, else legacy extraction */
function getEffectiveKeywords(provider: string, query: string, reformulated: ReformulatedQuery | null): string[] {
  if (!reformulated) return extractCoreKeywords(query);
  
  switch (provider.toUpperCase()) {
    case "RIS":
      return reformulated.ris_keywords.length > 0 ? reformulated.ris_keywords : extractCoreKeywords(query);
    case "FINDOK":
      return reformulated.ris_keywords.length > 0 ? reformulated.ris_keywords : extractCoreKeywords(query);
    default:
      return reformulated.generic_keywords.length > 0 ? reformulated.generic_keywords : extractCoreKeywords(query);
  }
}

/**
 * Smart provider override: If the LLM detects norms from a jurisdiction
 * not covered by the requested providers, add the appropriate providers.
 * E.g., user has DE selected but asks about MRG (AT law) → add RIS/FINDOK
 */
function smartProviderOverride(
  requestedProviders: string[],
  reformulated: ReformulatedQuery,
  jurisdiction: string[]
): string[] {
  const providers = new Set(requestedProviders.map(p => p.toUpperCase()));

  // Ensure AT providers are always present
  providers.add("RIS");
  providers.add("FINDOK");

  const normsStr = (reformulated.norms || []).join(" ").toUpperCase();
  const area = (reformulated.legal_area || "").toLowerCase();

  // Add PARLAMENT only for legislative queries
  if (area.includes("gesetzgebung") || area.includes("parlamentar") || area.includes("novelle") ||
      normsStr.includes("REGIERUNGSVORLAGE") || normsStr.includes("AUSSCHUSS")) {
    providers.add("PARLAMENT");
  }

  // Remove providers that should never be called
  providers.delete("GII");
  providers.delete("OPENJUR");
  providers.delete("DEJURE");
  providers.delete("FEDLEX");
  providers.delete("EURLEX");
  providers.delete("CURIA");

  return Array.from(providers);
}

/** Build an effective query string from LLM-reformulated keywords for a given provider */
function buildEffectiveQuery(provider: string, originalQuery: string, reformulated: ReformulatedQuery): string {
  const keywords = getEffectiveKeywords(provider, originalQuery, reformulated);
  if (keywords.length === 0) return originalQuery;
  // For providers that take the raw query and extract keywords internally,
  // join the LLM keywords as a pseudo-query so extractCoreKeywords picks them up
  return keywords.join(" ");
}

async function searchProvider(
  provider: string,
  query: string,
  jurisdiction?: string[],
  reformulated?: ReformulatedQuery | null
): Promise<{ results: SearchResult[]; latencyMs: number }> {
  const start = Date.now();
  let results: SearchResult[] = [];
  const effectiveQuery = reformulated ? buildEffectiveQuery(provider, query, reformulated) : query;

  switch (provider.toUpperCase()) {
    case "RIS":
      results = await searchRIS(effectiveQuery, reformulated);
      break;
    case "EURLEX":
      results = await searchEURLex(effectiveQuery);
      break;
    case "CURIA":
      results = await searchCuria(effectiveQuery, reformulated);
      break;
    case "FINDOK":
      results = await searchFindok(effectiveQuery);
      break;
    case "GII":
      results = await searchGII(effectiveQuery, reformulated);
      break;
    case "OPENJUR":
      results = await searchOpenJur(effectiveQuery, reformulated);
      break;
    case "DEJURE":
      results = await searchDejure(effectiveQuery, reformulated);
      break;
    case "FEDLEX":
      results = await searchFedlex(effectiveQuery, reformulated);
      break;
    case "PARLAMENT":
      results = await searchParlament(effectiveQuery, reformulated);
      break;
    default:
      console.warn(`Unknown provider: ${provider}`);
  }

  results = annotateEvidenceStatus(results);

  const isLive = results.some((r) => isEvidentiarySource(r) && r.score > 0.5);
  console.log(`${provider}: ${results.length} results in ${Date.now() - start}ms (live: ${isLive})`);
  return { results, latencyMs: Date.now() - start };
}

// ============================================================
// Keyword extraction
// ============================================================

// RIS API operators (official docs):
// Space = AND (all terms must match)
// "oder" = OR (any term matches)  
// * = Wildcard (partial matching)
// '...' = Phrase search

const STOPWORDS = new Set([
  "welche", "welcher", "welches", "was", "wie", "wer", "wo", "wann", "warum",
  "für", "ist", "sind", "werden", "kann", "können", "muss", "müssen", "soll", "sollen",
  // Articles incl. Genitive (the original set was missing "eines" — a
  // single-word omission that ate one of the precious wide-search slots
  // for any "Geltendmachung eines Rechtes"-shaped question).
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "einem", "einen", "eines",
  "und", "oder", "aber", "von", "zu", "bei", "mit", "nach", "über", "unter",
  "sich", "auf", "aus", "an", "in", "um", "als", "auch", "noch", "nicht",
  "wenn", "ob", "dass", "weil", "da", "so", "es", "man", "hat", "haben",
  "wird", "wurde", "gibt", "mein", "meine", "meinem", "meinen",
  "ich", "er", "sie", "wir", "ihr", "gelten", "gilt", "bekommt",
]);

// Map abbreviations AND thematic terms to their law for Titel search
const LAW_ABBREV_MAP: Record<string, { titel: string; gesetzesnummer?: string }> = {
  // --- Direct abbreviations ---
  "dsgvo": { titel: "Datenschutz*", gesetzesnummer: "10001597" },
  "dsg": { titel: "Datenschutzgesetz", gesetzesnummer: "10001597" },
  "abgb": { titel: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  "stgb": { titel: "Strafgesetzbuch", gesetzesnummer: "10002296" },
  "estg": { titel: "Einkommensteuergesetz", gesetzesnummer: "10004570" },
  "ustg": { titel: "Umsatzsteuergesetz", gesetzesnummer: "10004873" },
  "arbvg": { titel: "Arbeitsverfassungsgesetz", gesetzesnummer: "10008329" },
  "asvg": { titel: "Allgemeines Sozialversicherungsgesetz", gesetzesnummer: "10008147" },
  "mrg": { titel: "Mietrechtsgesetz", gesetzesnummer: "10002521" },
  "uwg": { titel: "Gesetz gegen den unlauteren Wettbewerb", gesetzesnummer: "10002665" },
  "kschg": { titel: "Konsumentenschutzgesetz", gesetzesnummer: "10002462" },
  "avrag": { titel: "Arbeitsvertragsrechts-Anpassungsgesetz", gesetzesnummer: "10008872" },
  "gmbhg": { titel: "GmbH-Gesetz", gesetzesnummer: "10001720" },
  "aktg": { titel: "Aktiengesetz", gesetzesnummer: "10002070" },
  "urhg": { titel: "Urheberrechtsgesetz", gesetzesnummer: "10001848" },
  "zpo": { titel: "Zivilprozessordnung", gesetzesnummer: "10001699" },
  "eo": { titel: "Exekutionsordnung", gesetzesnummer: "10001700" },
  "exeo": { titel: "Exekutionsordnung", gesetzesnummer: "10001700" },
  "io": { titel: "Insolvenzordnung", gesetzesnummer: "10001736" },
  "bao": { titel: "Bundesabgabenordnung", gesetzesnummer: "10003940" },
  "vwgvg": { titel: "Verwaltungsgerichtsverfahrensgesetz", gesetzesnummer: "20008376" },
  "ang": { titel: "Angestelltengesetz", gesetzesnummer: "10008069" },
  "angg": { titel: "Angestelltengesetz", gesetzesnummer: "10008069" },
  "urlg": { titel: "Urlaubsgesetz", gesetzesnummer: "10008376" },
  "azg": { titel: "Arbeitszeitgesetz", gesetzesnummer: "10008238" },
  "mschg": { titel: "Mutterschutzgesetz", gesetzesnummer: "10008464" },
  "glbg": { titel: "Gleichbehandlungsgesetz", gesetzesnummer: "20003395" },
  "phg": { titel: "Produkthaftungsgesetz", gesetzesnummer: "10002864" },
  "eheg": { titel: "Ehegesetz", gesetzesnummer: "10001871" },
  "wgg": { titel: "Wohnungsgemeinnützigkeitsgesetz", gesetzesnummer: "10011509" },
  "wev": { titel: "Wohnungseigentumsgesetz", gesetzesnummer: "20001921" },
  "weg": { titel: "Wohnungseigentumsgesetz", gesetzesnummer: "20001921" },
  "vbg": { titel: "Vertragsbedienstetengesetz", gesetzesnummer: "10008115" },
  "bdg": { titel: "Beamten-Dienstrechtsgesetz", gesetzesnummer: "10008470" },
  "finstrg": { titel: "Finanzstrafgesetz", gesetzesnummer: "10003898" },
  "gebg": { titel: "Gebührengesetz", gesetzesnummer: "10003882" },
  "grestg": { titel: "Grunderwerbsteuergesetz", gesetzesnummer: "10004531" },
  "kstg": { titel: "Körperschaftsteuergesetz", gesetzesnummer: "10004569" },
  "vereinsg": { titel: "Vereinsgesetz", gesetzesnummer: "20001917" },
  "markschg": { titel: "Markenschutzgesetz", gesetzesnummer: "10002180" },
  "patg": { titel: "Patentgesetz", gesetzesnummer: "10002009" },
  // --- Additional important Austrian laws ---
  "vgg": { titel: "Verbrauchergewährleistungsgesetz", gesetzesnummer: "20009590" },
  "ecg": { titel: "E-Commerce-Gesetz", gesetzesnummer: "20001703" },
  "fagg": { titel: "Fern- und Auswärtsgeschäfte-Gesetz", gesetzesnummer: "20008783" },
  "b-vg": { titel: "Bundes-Verfassungsgesetz", gesetzesnummer: "10000138" },
  "bvg": { titel: "Bundes-Verfassungsgesetz", gesetzesnummer: "10000138" },
  "avg": { titel: "Allgemeines Verwaltungsverfahrensgesetz", gesetzesnummer: "10005768" },
  "vstg": { titel: "Verwaltungsstrafgesetz", gesetzesnummer: "10005770" },
  "stpo": { titel: "Strafprozessordnung", gesetzesnummer: "10002326" },
  "jgg": { titel: "Jugendgerichtsgesetz", gesetzesnummer: "10002825" },
  "smg": { titel: "Suchtmittelgesetz", gesetzesnummer: "10011040" },
  "geo": { titel: "Geschäftsordnung für Gerichte", gesetzesnummer: "10001953" },
  "fbg": { titel: "Firmenbuchgesetz", gesetzesnummer: "10001988" },
  "spg": { titel: "Sicherheitspolizeigesetz", gesetzesnummer: "10005792" },
  "gewo": { titel: "Gewerbeordnung", gesetzesnummer: "20001674" },
  "gwog": { titel: "Gewerbeordnung", gesetzesnummer: "20001674" },
  "aussstrg": { titel: "Außerstreitgesetz", gesetzesnummer: "20003001" },
  "gsvg": { titel: "Gewerbliches Sozialversicherungsgesetz", gesetzesnummer: "10002088" },
  "bsvg": { titel: "Bauern-Sozialversicherungsgesetz", gesetzesnummer: "10008691" },
  "aschg": { titel: "ArbeitnehmerInnenschutzgesetz", gesetzesnummer: "10009121" },
  "rstdg": { titel: "Richter- und Staatsanwaltschaftsdienstgesetz", gesetzesnummer: "10001945" },
  "bvergg": { titel: "Bundesvergabegesetz", gesetzesnummer: "20003521" },
  "gspg": { titel: "Glücksspielgesetz", gesetzesnummer: "10005594" },
  "meldeg": { titel: "Meldegesetz", gesetzesnummer: "10005799" },
  "asylg": { titel: "Asylgesetz", gesetzesnummer: "20004240" },
  "fpg": { titel: "Fremdenpolizeigesetz", gesetzesnummer: "20004242" },
  "nag": { titel: "Niederlassungs- und Aufenthaltsgesetz", gesetzesnummer: "20004241" },
  "medg": { titel: "Mediengesetz", gesetzesnummer: "10000719" },
  "ärzteg": { titel: "Ärztegesetz", gesetzesnummer: "20002160" },
  "apothg": { titel: "Apothekengesetz", gesetzesnummer: "10001413" },
  "epg": { titel: "Eingetragene Partnerschaft-Gesetz", gesetzesnummer: "20003005" },
  "wrg": { titel: "Wasserrechtsgesetz", gesetzesnummer: "10010290" },
  "forstg": { titel: "Forstgesetz", gesetzesnummer: "10010371" },
  "uvpg": { titel: "Umweltverträglichkeitsprüfungsgesetz", gesetzesnummer: "20003020" },
  "schug": { titel: "Schulunterrichtsgesetz", gesetzesnummer: "10009600" },

  // --- Thematic terms → primary law ---
  "kündigungsschutz": { titel: "Arbeitsverfassungsgesetz", gesetzesnummer: "10008329" },
  "kündigung": { titel: "Angestelltengesetz", gesetzesnummer: "10008069" },
  "entlassung": { titel: "Angestelltengesetz", gesetzesnummer: "10008069" },
  "abfertigung": { titel: "Angestelltengesetz", gesetzesnummer: "10008069" },
  "arbeitsrecht": { titel: "Arbeitsverfassungsgesetz", gesetzesnummer: "10008329" },
  "arbeitsvertrag": { titel: "Arbeitsvertragsrechts-Anpassungsgesetz", gesetzesnummer: "10008872" },
  "arbeitszeit": { titel: "Arbeitszeitgesetz", gesetzesnummer: "10008238" },
  "urlaub": { titel: "Urlaubsgesetz", gesetzesnummer: "10008376" },
  "mutterschutz": { titel: "Mutterschutzgesetz", gesetzesnummer: "10008464" },
  "karenz": { titel: "Mutterschutzgesetz", gesetzesnummer: "10008464" },
  "elternkarenz": { titel: "Mutterschutzgesetz", gesetzesnummer: "10008464" },
  "betriebsrat": { titel: "Arbeitsverfassungsgesetz", gesetzesnummer: "10008329" },
  "gleichbehandlung": { titel: "Gleichbehandlungsgesetz", gesetzesnummer: "20003395" },
  "diskriminierung": { titel: "Gleichbehandlungsgesetz", gesetzesnummer: "20003395" },
  "mietrecht": { titel: "Mietrechtsgesetz", gesetzesnummer: "10002521" },
  "miete": { titel: "Mietrechtsgesetz", gesetzesnummer: "10002521" },
  "mietvertrag": { titel: "Mietrechtsgesetz", gesetzesnummer: "10002521" },
  "mieterschutz": { titel: "Mietrechtsgesetz", gesetzesnummer: "10002521" },
  "kaution": { titel: "Mietrechtsgesetz", gesetzesnummer: "10002521" },
  "wohnungseigentum": { titel: "Wohnungseigentumsgesetz", gesetzesnummer: "20001921" },
  "insolvenz": { titel: "Insolvenzordnung", gesetzesnummer: "10001736" },
  "konkurs": { titel: "Insolvenzordnung", gesetzesnummer: "10001736" },
  "sanierung": { titel: "Insolvenzordnung", gesetzesnummer: "10001736" },
  "schadenersatz": { titel: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  "schadensersatz": { titel: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  "haftung": { titel: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  "gewährleistung": { titel: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  "vertragsrecht": { titel: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  "erbrecht": { titel: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  "sachenrecht": { titel: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  "eigentum": { titel: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  "bereicherungsrecht": { titel: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  "konsumentenschutz": { titel: "Konsumentenschutzgesetz", gesetzesnummer: "10002462" },
  "verbraucherschutz": { titel: "Konsumentenschutzgesetz", gesetzesnummer: "10002462" },
  "rücktrittsrecht": { titel: "Konsumentenschutzgesetz", gesetzesnummer: "10002462" },
  "produkthaftung": { titel: "Produkthaftungsgesetz", gesetzesnummer: "10002864" },
  "datenschutz": { titel: "Datenschutz*", gesetzesnummer: "10001597" },
  "urheberrecht": { titel: "Urheberrechtsgesetz", gesetzesnummer: "10001848" },
  "markenrecht": { titel: "Markenschutzgesetz", gesetzesnummer: "10002180" },
  "patentrecht": { titel: "Patentgesetz", gesetzesnummer: "10002009" },
  "wettbewerbsrecht": { titel: "Gesetz gegen den unlauteren Wettbewerb", gesetzesnummer: "10002665" },
  "strafrecht": { titel: "Strafgesetzbuch", gesetzesnummer: "10002296" },
  "körperverletzung": { titel: "Strafgesetzbuch", gesetzesnummer: "10002296" },
  "betrug": { titel: "Strafgesetzbuch", gesetzesnummer: "10002296" },
  "diebstahl": { titel: "Strafgesetzbuch", gesetzesnummer: "10002296" },
  "untreue": { titel: "Strafgesetzbuch", gesetzesnummer: "10002296" },
  "einkommensteuer": { titel: "Einkommensteuergesetz", gesetzesnummer: "10004570" },
  "umsatzsteuer": { titel: "Umsatzsteuergesetz", gesetzesnummer: "10004873" },
  "körperschaftsteuer": { titel: "Körperschaftsteuergesetz", gesetzesnummer: "10004569" },
  "grunderwerbsteuer": { titel: "Grunderwerbsteuergesetz", gesetzesnummer: "10004531" },
  "sozialversicherung": { titel: "Allgemeines Sozialversicherungsgesetz", gesetzesnummer: "10008147" },
  "krankenversicherung": { titel: "Allgemeines Sozialversicherungsgesetz", gesetzesnummer: "10008147" },
  "pension": { titel: "Allgemeines Sozialversicherungsgesetz", gesetzesnummer: "10008147" },
  "gesellschaftsrecht": { titel: "GmbH-Gesetz", gesetzesnummer: "10001720" },
  "gmbh": { titel: "GmbH-Gesetz", gesetzesnummer: "10001720" },
  "aktiengesellschaft": { titel: "Aktiengesetz", gesetzesnummer: "10002070" },
  "firmenbuch": { titel: "Firmenbuchgesetz" },
  "unternehmensrecht": { titel: "Unternehmensgesetzbuch", gesetzesnummer: "10001702" },
  "verwaltungsrecht": { titel: "Allgemeines Verwaltungsverfahrensgesetz" },
  "verwaltungsstrafe": { titel: "Verwaltungsstrafgesetz" },
  "vergabe": { titel: "Bundesvergabegesetz" },
  "scheidung": { titel: "Ehegesetz", gesetzesnummer: "10001871" },
  "unterhalt": { titel: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  "obsorge": { titel: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  "familienrecht": { titel: "Allgemeines bürgerliches Gesetzbuch", gesetzesnummer: "10001622" },
  "exekution": { titel: "Exekutionsordnung", gesetzesnummer: "10001700" },
  "pfändung": { titel: "Exekutionsordnung", gesetzesnummer: "10001700" },
  "zwangsvollstreckung": { titel: "Exekutionsordnung", gesetzesnummer: "10001700" },
  // --- Additional thematic terms ---
  "fernabsatz": { titel: "Fern- und Auswärtsgeschäfte-Gesetz", gesetzesnummer: "20008783" },
  "haustürgeschäft": { titel: "Fern- und Auswärtsgeschäfte-Gesetz", gesetzesnummer: "20008783" },
  "e-commerce": { titel: "E-Commerce-Gesetz", gesetzesnummer: "20001703" },
  "onlinehandel": { titel: "E-Commerce-Gesetz", gesetzesnummer: "20001703" },
  "gewährleistungsrecht": { titel: "Verbrauchergewährleistungsgesetz", gesetzesnummer: "20009590" },
  "verfassungsrecht": { titel: "Bundes-Verfassungsgesetz", gesetzesnummer: "10000138" },
  "grundrechte": { titel: "Bundes-Verfassungsgesetz", gesetzesnummer: "10000138" },
  "asyl": { titel: "Asylgesetz", gesetzesnummer: "20004240" },
  "aufenthaltstitel": { titel: "Niederlassungs- und Aufenthaltsgesetz", gesetzesnummer: "20004241" },
  "aufenthalt": { titel: "Niederlassungs- und Aufenthaltsgesetz", gesetzesnummer: "20004241" },
  "abschiebung": { titel: "Fremdenpolizeigesetz", gesetzesnummer: "20004242" },
  "fremdenrecht": { titel: "Fremdenpolizeigesetz", gesetzesnummer: "20004242" },
  "glücksspiel": { titel: "Glücksspielgesetz", gesetzesnummer: "10005594" },
  "gewerbe": { titel: "Gewerbeordnung", gesetzesnummer: "20001674" },
  "arbeitnehmerschutz": { titel: "ArbeitnehmerInnenschutzgesetz", gesetzesnummer: "10009121" },
  "arbeitssicherheit": { titel: "ArbeitnehmerInnenschutzgesetz", gesetzesnummer: "10009121" },
  "suchtmittel": { titel: "Suchtmittelgesetz", gesetzesnummer: "10011040" },
  "drogen": { titel: "Suchtmittelgesetz", gesetzesnummer: "10011040" },
  "medienrecht": { titel: "Mediengesetz", gesetzesnummer: "10000719" },
  "presserecht": { titel: "Mediengesetz", gesetzesnummer: "10000719" },
  "vergaberecht": { titel: "Bundesvergabegesetz", gesetzesnummer: "20003521" },
  "öffentliche beschaffung": { titel: "Bundesvergabegesetz", gesetzesnummer: "20003521" },
  "eingetragene partnerschaft": { titel: "Eingetragene Partnerschaft-Gesetz", gesetzesnummer: "20003005" },
  "wasserrecht": { titel: "Wasserrechtsgesetz", gesetzesnummer: "10010290" },
  "umweltverträglichkeit": { titel: "Umweltverträglichkeitsprüfungsgesetz", gesetzesnummer: "20003020" },
  "strafprozess": { titel: "Strafprozessordnung", gesetzesnummer: "10002326" },
  "ermittlungsverfahren": { titel: "Strafprozessordnung", gesetzesnummer: "10002326" },
  "verwaltungsverfahren": { titel: "Allgemeines Verwaltungsverfahrensgesetz", gesetzesnummer: "10005768" },
  "bescheid": { titel: "Allgemeines Verwaltungsverfahrensgesetz", gesetzesnummer: "10005768" },
};

function extractCoreKeywords(query: string): string[] {
  const words = query
    .replace(/[?!.,;:()]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w.toLowerCase()));

  const result: string[] = [];
  for (const word of words) {
    // Only split hyphenated words if they're very long (>20 chars)
    // Keep short compounds like "EU-DSGVO", "KI-Verordnung" intact
    if (word.includes("-") && word.length > 20) {
      const parts = word.split("-").filter(p => p.length > 2);
      result.push(...parts);
    } else {
      result.push(word);
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return result.filter(w => {
    const l = w.toLowerCase();
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
}

// For non-RIS providers: return simple space-joined keywords
function extractKeywords(query: string): string[] {
  return extractCoreKeywords(query);
}

function splitGermanCompound(word: string): string[] {
  const splitPatterns = [
    /^(Datenschutz)(.*)/i, /^(Arbeits)(.*)/i, /^(Verbraucher)(.*)/i,
    /^(Wettbewerbs)(.*)/i, /^(Handels)(.*)/i, /^(Steuer)(.*)/i,
    /^(Verwaltungs)(.*)/i, /^(Verfassungs)(.*)/i, /^(Straf)(.*)/i,
    /^(Zivil)(.*)/i, /^(Gesellschafts)(.*)/i, /^(Unternehmens)(.*)/i,
    /^(Umsatz)(.*)/i, /^(Einkommen)(.*)/i, /^(Grundbuch)(.*)/i,
    /^(Insolvenz)(.*)/i, /^(Miet)(.*)/i, /^(Erb)(recht|schaft|folge)(.*)/i,
    /^(Familien)(.*)/i, /^(Umwelt)(.*)/i, /^(Sozialversicherungs)(.*)/i,
    /^(Marken)(.*)/i, /^(Patent)(.*)/i, /^(Urheber)(.*)/i,
    /^(Kündigungs)(.*)/i, /^(Wohnungs)(.*)/i, /^(Betriebs)(.*)/i,
    /^(Dienst)(.*)/i, /^(Schadenersatz)(.*)/i, /^(Gewährleistungs)(.*)/i,
    /^(Haftungs)(.*)/i, /^(Vertrags)(.*)/i,
  ];
  for (const pattern of splitPatterns) {
    const m = word.match(pattern);
    if (m) {
      const parts = m.slice(1).filter(p => p && p.length > 2);
      if (parts.length > 1) return parts;
    }
  }
  return [word];
}

function safeStr(val: unknown): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if ("item" in obj) return String(obj.item || "");
    if ("_" in obj) return String(obj._ || "");
    return JSON.stringify(val);
  }
  return String(val || "");
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stripRisXmlText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRisXmlAbsatz(xml: string, ct: string): string {
  const re = new RegExp(`<absatz[^>]+ct=["']${escapeRegExp(ct)}["'][^>]*>([\\s\\S]*?)<\\/absatz>`, "i");
  const match = xml.match(re);
  return match ? stripRisXmlText(match[1]) : "";
}

async function fetchRisXmlAbsatz(xmlUrl: string, ct: string): Promise<string> {
  if (!xmlUrl) return "";
  try {
    const resp = await fetchWithTimeout(xmlUrl, 5000);
    if (!resp.ok) return "";
    return extractRisXmlAbsatz(await resp.text(), ct);
  } catch {
    return "";
  }
}

/** Convert RIS XML document URLs to human-readable, canonical HTML (.wxe) URLs.
 *  - XML doc URLs → Dokument.wxe
 *  - JustizEntscheidung.wxe → Dokument.wxe
 *  - Fix parameter names (Paragraph → Paragraf)
 *  - Strip session-specific params (ResultFunctionToken, Position, etc.)
 *  - Reduce Suchen.wxe/Ergebnis.wxe to minimal Abfrage+Suchworte
 */
function normalizeRisUrl(url: string): string {
  if (!url) return url;
  // Pattern: /Dokumente/{Abfrage}/{DocNr}/{DocNr}.xml → /Dokument.wxe?Abfrage={Abfrage}&Dokumentnummer={DocNr}
  const xmlMatch = url.match(/ris\.bka\.gv\.at\/Dokumente\/(\w+)\/([^/]+)\/[^/]+\.xml$/i);
  if (xmlMatch) {
    return `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=${xmlMatch[1]}&Dokumentnummer=${xmlMatch[2]}`;
  }
  // Fix wrong endpoint: JustizEntscheidung.wxe → Dokument.wxe
  let fixed = url;
  fixed = fixed.replace(/JustizEntscheidung\.wxe/gi, "Dokument.wxe");
  // Fix common parameter name mistakes in RIS URLs
  fixed = fixed.replace(/([?&])Paragraph=/gi, "$1Paragraf=");
  fixed = fixed.replace(/([?&])Uebergang=/gi, "$1Uebergangsrecht=");

  // Strip session/list params from Dokument.wxe and NormDokument.wxe links
  if (/\/(Dokument|NormDokument|GeltendeFassung)\.wxe\?/i.test(fixed)) {
    fixed = stripRisSessionParams(fixed);
  }

  // Canonicalize Suchen.wxe / Ergebnis.wxe to minimal search
  if (/\/(Suchen|Ergebnis)\.wxe\?/i.test(fixed)) {
    fixed = canonicalizeRisSearchUrl(fixed);
  }

  return fixed;
}

const RIS_SESSION_PARAMS = new Set([
  "ResultFunctionToken", "Position", "Gericht", "Fachgebiet",
  "Rechtssatznummer", "Rechtssatz", "Fundstelle", "Spruch",
  "Rechtsgebiet", "AenderungenSeit", "JustizEntscheidungsart",
  "SucheNachRechtssatz", "SucheNachText", "GZ", "VonDatum",
  "BisDatum", "Norm", "ImRisSeitVonDatum", "ImRisSeitBisDatum",
  "ImRisSeit", "ResultPageSize", "ShowEmptySearchResultMessage",
]);

function stripRisSessionParams(url: string): string {
  try {
    const parsed = new URL(url);
    const toDelete: string[] = [];
    for (const [key, value] of parsed.searchParams.entries()) {
      if (RIS_SESSION_PARAMS.has(key) || value === "Undefined" || value === "") {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) parsed.searchParams.delete(key);
    return parsed.toString();
  } catch { return url; }
}

function canonicalizeRisSearchUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const suchworte = parsed.searchParams.get("Suchworte")?.trim();
    const abfrage = parsed.searchParams.get("Abfrage") || "Justiz";
    if (!suchworte) return `https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=${abfrage}`;
    const scope = abfrage === "Bundesnormen" ? "Bundesnormen" : "Justiz";
    return `https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=${scope}&Suchworte=${encodeURIComponent(suchworte)}`;
  } catch { return url; }
}

/** Laws that require a default Artikel parameter in their RIS URL (e.g. AngG → Art. 1) */
const LAW_DEFAULT_ARTIKEL: Record<string, string> = {
  "10008069": "1", // Angestelltengesetz (AngG) → Art. 1
};

function buildRisBundesnormenUrl(gesetzesnummer?: string, artikelInfo?: string, fallbackUrl?: string): string {
  if (!gesetzesnummer) return fallbackUrl || "";

  const artikelText = safeStr(artikelInfo);
  const paragraph = artikelText.match(/(?:paragraph\s*)?§\s*(\d+[a-z]?)/i)?.[1]
    || artikelText.match(/paragraph\s*(\d+[a-z]?)/i)?.[1];
  const artikel = artikelText.match(/artikel\s*(\d+[a-z]?)/i)?.[1]
    || LAW_DEFAULT_ARTIKEL[gesetzesnummer]
    || "";

  if (paragraph) {
    return `https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=${gesetzesnummer}&Artikel=${artikel}&Paragraf=${paragraph}&Anlage=&Uebergangsrecht=`;
  }

  return fallbackUrl || `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=${gesetzesnummer}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function verifyRisNormHtml(html: string, lawTitle: string, knownLaw: string, paragraphNumber?: string): boolean {
  if (!html || html.length < 1000) return false;
  const normalized = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#167;|&sect;/gi, "§")
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (/keine dokumente gefunden|kein dokument gefunden|fehler bei der suche/i.test(normalized)) return false;

  const cleanTitle = lawTitle.replace(/\*$/, "").toLowerCase();
  const lawNeedles = [
    knownLaw.toLowerCase(),
    cleanTitle,
    cleanTitle.split(/\s+/).find((part) => part.length > 5) || "",
  ].filter(Boolean);
  const hasLaw = lawNeedles.some((needle) => normalized.includes(needle));
  if (!hasLaw) return false;

  if (!paragraphNumber) return true;
  const paraRe = new RegExp(`(?:§|paragraph|paragraf)\\s*${escapeRegExp(paragraphNumber)}\\b`, "i");
  return paraRe.test(normalized);
}

async function tryBuildVerifiedRisNormSource(
  knownLaw: string | undefined,
  lawInfo: { titel: string; gesetzesnummer?: string } | null,
  paragraphNumber?: string,
): Promise<SearchResult | null> {
  if (!knownLaw || !lawInfo?.gesetzesnummer) return null;

  const cleanTitle = lawInfo.titel.replace(/\*$/, "");
  const url = paragraphNumber
    ? buildRisBundesnormenUrl(lawInfo.gesetzesnummer, `Paragraph §${paragraphNumber}`)
    : buildRisBundesnormenUrl(lawInfo.gesetzesnummer);

  try {
    const resp = await fetchWithTimeout(url, 5000);
    if (!resp.ok) return null;
    const html = await resp.text();
    if (!verifyRisNormHtml(html, cleanTitle, knownLaw, paragraphNumber)) return null;

    return withEvidenceStatus({
      doc_ref: paragraphNumber ? `§ ${paragraphNumber} ${knownLaw.toUpperCase()}` : lawInfo.gesetzesnummer,
      title: paragraphNumber ? `§ ${paragraphNumber} ${cleanTitle}` : cleanTitle,
      date: "",
      url,
      score: paragraphNumber ? 0.99 : 0.94,
      highlights: [knownLaw, cleanTitle, paragraphNumber ? `§ ${paragraphNumber}` : ""].filter(Boolean),
      provider: "RIS",
      pinpoint: paragraphNumber ? `§ ${paragraphNumber}` : undefined,
      snippet: paragraphNumber ? `Verifizierte RIS-Norm: § ${paragraphNumber} ${cleanTitle}` : `Verifizierte RIS-Norm: ${cleanTitle}`,
    }, "verified_document");
  } catch (e) {
    console.warn(`[RIS] Direct norm verification failed for ${knownLaw}${paragraphNumber ? ` § ${paragraphNumber}` : ""}:`, e);
    return null;
  }
}

async function resolveExactRisNormSource(query: string): Promise<SearchResult | null> {
  const paragraphNumber = query.match(/(?:§{1,2}|paragraf|paragraph)\s*(\d+[a-z]?)/i)?.[1];
  if (!paragraphNumber) return null;

  const normalizedQuery = query.toLowerCase();
  const lawKey = normalizedQuery
    .toLowerCase()
    .split(/[^a-zäöüß0-9-]+/i)
    .map((part) => part.trim())
    .find((part) => !!LAW_ABBREV_MAP[part])
    || Object.entries(LAW_ABBREV_MAP).find(([, law]) => {
      const title = law.titel.replace(/\*$/, "").toLowerCase();
      return title.length > 5 && normalizedQuery.includes(title);
    })?.[0];

  if (!lawKey) return null;
  return tryBuildVerifiedRisNormSource(lawKey, LAW_ABBREV_MAP[lawKey], paragraphNumber);
}

// ============================================================
// RIS - Rechtsinformationssystem des Bundes (Austria)
// 
// Strategy:
// 1) Check if query contains known law abbreviation → Titel search
// 2) Parallel: Titel search (wildcard) + Suchworte search (AND, max 2 terms)
// 3) Judikatur: Suchworte with 1-2 focused terms
// 4) Landesrecht: triggered by topic-keywords or explicit Bundesland mention
// ============================================================

// detectLandesrechtScope is imported from ./landesrecht.ts so it stays
// unit-testable from vitest (Deno-only inline functions can't be tested
// from Node directly).
async function searchRIS(query: string, reformulated?: ReformulatedQuery | null): Promise<SearchResult[]> {
  // Use LLM-reformulated keywords if available, otherwise legacy extraction
  const keywords = reformulated?.ris_keywords?.length ? reformulated.ris_keywords.flatMap(k => k.split(/\s+/)) : extractCoreKeywords(query);
  console.log(`RIS: keywords=${JSON.stringify(keywords)} (from: "${query}", llm: ${!!reformulated?.ris_keywords?.length})`);
  
  // Also check LLM-extracted norms for law abbreviation matching
  const allTerms = reformulated?.norms ? [...keywords, ...reformulated.norms.map(n => n.replace(/§\s*\d+[a-z]?\s*/i, "").trim())] : keywords;

  // Check for known law abbreviations
  const knownLaw = [...keywords, ...(allTerms || [])].find(k => LAW_ABBREV_MAP[k.toLowerCase()]);
  const lawInfo = knownLaw ? LAW_ABBREV_MAP[knownLaw.toLowerCase()] : null;

  // Build search queries
  const contentTerms = keywords
    .filter(k => !LAW_ABBREV_MAP[k.toLowerCase()])
    .slice(0, 2);

  const results: SearchResult[] = [];
  const seenRefs = new Set<string>();

  // Extract § references from query for paragraph-level URLs
  const paragraphMatch = query.match(/(?:§{1,2}|paragraf|paragraph)\s*(\d+[a-z]?)/i);
  const paragraphNumber = paragraphMatch?.[1];
  const verifiedNormSourcePromise = tryBuildVerifiedRisNormSource(knownLaw, lawInfo, paragraphNumber);

  // Build API URLs for parallel requests
  const urls: { label: string; url: string }[] = [];

  if (contentTerms.length > 0) {
    urls.push({
      label: "BR-Suchworte",
      url: `https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Suchworte=${encodeURIComponent(contentTerms.join(" "))}&Pagesize=5`,
    });
  } else if (!lawInfo) {
    urls.push({
      label: "BR-Suchworte",
      url: `https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Suchworte=${encodeURIComponent(keywords.slice(0, 2).join(" "))}&Pagesize=5`,
    });
  }

  // DEFINITION QUERIES: When query asks "where is X defined/normiert", search broadly within the law
  const isDefinitionQuery = /\b(wo\s+wird|wo\s+ist|wo\s+findet|definition\s+von|legaldefinition|begriff\s+d|normiert|definiert|begriffsbestimmung)\b/i.test(query);
  if (isDefinitionQuery && lawInfo?.gesetzesnummer) {
    // Search for the term within the specific law to find the defining paragraph
    const definitionTerms = contentTerms.length > 0 ? contentTerms.join(" ") : keywords.filter(k => !LAW_ABBREV_MAP[k.toLowerCase()]).slice(0, 2).join(" ");
    if (definitionTerms) {
      urls.push({
        label: "BR-Definition",
        url: `https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Gesetzesnummer=${lawInfo.gesetzesnummer}&Suchworte=${encodeURIComponent(definitionTerms)}&Pagesize=5`,
      });
    }
  }

  // Judikatur with 1-2 focused terms (broad recall, catches general topic)
  const judTerms = keywords
    .filter(k => k.length > 3 || /^[A-ZÄÖÜ]{2,}$/.test(k))
    .slice(0, 2);
  const judSuchworte = judTerms.length > 0 ? judTerms.join(" ") : keywords[0];

  // Leitsatz-style precision search: when the user's question reads like
  // a Rechtssatz (e.g. "Unterbrechen gerichtliche Schritte, die die
  // Geltendmachung eines Rechtes bloß vorbereiten, die Verjährung?"),
  // the actual matching RS-number is found by passing MANY content
  // keywords as AND-joined Suchworte — RIS narrows directly to the
  // Leitsatz hit. With only 2 keywords we get hundreds of unrelated
  // results and the model falls back to hallucinated training-data
  // citations. This is the most impactful retrieval improvement for
  // Wissensfragen formulated as full sentences.
  //
  // Take up to 8 (not 6) keywords because the last 1–2 words of a
  // sentence-style question are typically THE most match-defining for
  // a Leitsatz hit — e.g. for the Verjährungsfrage above, "vorbereiten"
  // (word #7) and "Verjährung" (word #8) are exactly the words that
  // narrow RS0034826 down out of thousands of Verjährungs-related RSs.
  const judTermsWide = keywords
    .filter(k => k.length > 3 || /^[A-ZÄÖÜ]{2,}$/.test(k))
    .slice(0, 8);
  const judSuchworteWide = judTermsWide.length > 2 ? judTermsWide.join(" ") : "";

  // Search both Judikatur (full decisions) and Rechtssätze (RS-numbers) in parallel
  urls.push({
    label: "Jud",
    url: `https://data.bka.gv.at/ris/api/v2.6/Judikatur?Suchworte=${encodeURIComponent(judSuchworte)}&Pagesize=5`,
  });
  urls.push({
    label: "JudRs",
    url: `https://data.bka.gv.at/ris/api/v2.6/Judikatur?Suchworte=${encodeURIComponent(judSuchworte)}&Dokumenttyp=Rechtssatz&Pagesize=5`,
  });
  // Wide-keyword Rechtssatz precision search — only fire when we have
  // enough distinct content words to make AND-narrowing meaningful.
  if (judSuchworteWide && judSuchworteWide !== judSuchworte) {
    urls.push({
      label: "JudRs-Wide",
      url: `https://data.bka.gv.at/ris/api/v2.6/Judikatur?Suchworte=${encodeURIComponent(judSuchworteWide)}&Dokumenttyp=Rechtssatz&Pagesize=5`,
    });
  }

  // === SMART SEARCH SELECTION ===
  // When query has an explicit § reference + known law, we already have a precise target.
  // Skip broad aspect/case-law searches to save API calls and reduce latency.
  const hasExplicitNorm = !!(paragraphNumber && lawInfo?.gesetzesnummer);

  // ASPECT-BASED RECHTSSATZ SEARCHES — only when no explicit norm target
  if (!hasExplicitNorm && reformulated?.ris_aspect_searches && reformulated.ris_aspect_searches.length > 0) {
    for (const aspectTerms of reformulated.ris_aspect_searches.slice(0, 2)) {
      const aspectKey = aspectTerms.trim();
      if (!aspectKey || aspectKey === judSuchworte) continue;
      urls.push({
        label: `JudRs-Aspect`,
        url: `https://data.bka.gv.at/ris/api/v2.6/Judikatur?Suchworte=${encodeURIComponent(aspectKey)}&Dokumenttyp=Rechtssatz&Pagesize=3`,
      });
    }
  }

  // CASE LAW SEARCHES — limit to 2 max, skip if explicit norm query
  if (!hasExplicitNorm && reformulated?.case_law_searches && reformulated.case_law_searches.length > 0) {
    for (const clSearch of reformulated.case_law_searches.slice(0, 2)) {
      const clKey = clSearch.trim();
      if (!clKey || clKey === judSuchworte) continue;
      urls.push({
        label: `Jud-CaseLaw`,
        url: `https://data.bka.gv.at/ris/api/v2.6/Judikatur?Suchworte=${encodeURIComponent(clKey)}&Pagesize=4`,
      });
    }
  }

  // LANDESRECHT — added when the query topic is Landessache (Bauordnung,
  // Naturschutz, Mindestsicherung, …) or names a specific Bundesland.
  // Without this, queries like "Wiener Bauordnung § 60" miss Landes-laws
  // entirely because the rest of the pipeline only hits Bundesrecht.
  const landesScope = detectLandesrechtScope(query);
  if (landesScope.trigger) {
    const landesSuchworte = encodeURIComponent(keywords.slice(0, 3).join(" "));
    for (const bl of landesScope.bundeslaender) {
      urls.push({
        label: `LR-${bl}`,
        url: `https://data.bka.gv.at/ris/api/v2.6/Landesrecht?Bundesland=${encodeURIComponent(bl)}&Suchworte=${landesSuchworte}&Pagesize=3`,
      });
    }
    console.log(`RIS Landesrecht triggered: ${landesScope.bundeslaender.join(", ")}`);
  }

  console.log(`RIS: direct=${!!lawInfo}, ${urls.map(u => `${u.label}="${u.url.split("?")[1]}"`).join(", ")}`);

  try {
    const [verifiedNormSource, responses] = await Promise.all([
      verifiedNormSourcePromise,
      Promise.allSettled(urls.map(u => fetchWithTimeout(u.url, 8000))),
    ]);

    if (verifiedNormSource) {
      results.push(verifiedNormSource);
      seenRefs.add(verifiedNormSource.doc_ref || verifiedNormSource.title);
    }

    for (let i = 0; i < urls.length; i++) {
      const resp = responses[i];
      if (resp.status !== "fulfilled") {
        console.error(`RIS ${urls[i].label} fetch failed:`, resp.reason);
        continue;
      }

      const label = urls[i].label;
      if (label.startsWith("Jud")) {
        // All Rechtssatz-specific labels (JudRs, JudRs-Wide, JudRs-Aspect)
        // signal the parser to set the isRechtssatz flag so the result
        // carries an RS-number that the citation allowlist can pick up.
        const judHits = await parseRISJudikatur(resp.value, label.startsWith("JudRs"));
        for (const h of judHits) {
          if (!seenRefs.has(h.doc_ref)) { seenRefs.add(h.doc_ref); results.push(h); }
        }
      } else {
        const brHits = await parseRISBundesrecht(resp.value, label, keywords);
        for (const h of brHits) {
          const key = h.doc_ref || h.title;
          if (!seenRefs.has(key)) { seenRefs.add(key); results.push(h); }
        }
      }
    }

    // Judikatur retry with progressively broader search strategies
    const judHitCount = results.filter(r => r.pinpoint).length;
    if (judHitCount === 0) {
      const retryQueries: string[] = [];

      // Strategy 1: Single keyword (most specific term)
      if (judTerms.length > 1) {
        retryQueries.push(judTerms[0]);
      }

      // Strategy 2: If query mentions a known law, search Judikatur with the law's full title
      if (lawInfo) {
        const lawTitle = lawInfo.titel.replace(/\*$/, "");
        retryQueries.push(lawTitle);
      }

      // Strategy 3: Use the thematic terms from the reformulated query
      if (reformulated?.ris_keywords?.length) {
        const altTerms = reformulated.ris_keywords
          .filter(k => k !== judSuchworte && k.length > 3)
          .slice(0, 2);
        retryQueries.push(...altTerms);
      }

      // Deduplicate retry queries
      const seenRetries = new Set<string>();
      for (const retryQ of retryQueries) {
        const normalized = retryQ.toLowerCase().trim();
        if (seenRetries.has(normalized) || !normalized) continue;
        seenRetries.add(normalized);

        console.log(`RIS Jud retry: "${retryQ}"`);
        try {
          const retryResp = await fetchWithTimeout(
            `https://data.bka.gv.at/ris/api/v2.6/Judikatur?Suchworte=${encodeURIComponent(retryQ)}&Pagesize=5`,
            8000
          );
          const retryHits = await parseRISJudikatur(retryResp);
          for (const h of retryHits) {
            if (!seenRefs.has(h.doc_ref)) { seenRefs.add(h.doc_ref); results.push(h); }
          }
          if (retryHits.length > 0) break; // Stop retrying once we have hits
        } catch (_e) { /* ignore */ }
      }
    }

    const filteredResults = filterAustrianPrivacyLawSources(query, reformulated, results);
    const filteredCount = results.length - filteredResults.length;
    if (filteredCount > 0) {
      console.warn(`[RIS] Filtered ${filteredCount} non-privacy-law result(s) from Datenschutz query.`);
    }

    if (filteredResults.length === 0) return getRISFallback(query);
    return filteredResults;
  } catch (e) {
    console.error("RIS error:", e);
    return getRISFallback(query);
  }
}

async function parseRISBundesrecht(resp: Response, label: string, queryKeywords?: string[]): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const data = await resp.json();
    const error = data?.OgdSearchResult?.Error;
    if (error) console.error(`RIS ${label} error:`, error.Message || JSON.stringify(error));
    const hits = data?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference || [];
    const hitArray = Array.isArray(hits) ? hits : hits ? [hits] : [];
    console.log(`RIS ${label}: ${hitArray.length} hits`);

    for (const hit of hitArray.slice(0, 5)) {
      const meta = hit?.Data?.Metadaten?.BrKons || hit?.Data?.Metadaten?.Bundesrecht || hit?.Data?.Metadaten || {};
      const docList = hit?.Data?.Dokumentliste?.ContentReference;
      const docInfo = Array.isArray(docList) ? docList[0] : docList || {};
      const kurztitel = safeStr(meta?.Kurztitel);
      const langtitel = safeStr(meta?.Langtitel);
      const gesetzesnummer = safeStr(meta?.Gesetzesnummer);
      const artikel = safeStr(meta?.ArtikelParagrafAnlage);
      const docName = safeStr(docInfo?.Name);
      const contentUrls = docInfo?.Urls?.ContentUrl;
      const firstUrl = Array.isArray(contentUrls) ? contentUrls[0] : contentUrls;
      const docUrl = normalizeRisUrl(safeStr(firstUrl?.Url));

      const bestTitle = pickBestTitle([kurztitel, langtitel, docName], label);
      const bgblMatch = docUrl.match(/BGBLA?_(\d{4}_[IV]+_\d+)/);
      const bgblRef = bgblMatch ? `BGBl. ${bgblMatch[1].replace(/_/g, " ")}` : "";

      // Relevance filtering: skip results whose title has zero overlap with query keywords
      const shouldApplyKeywordFilter = queryKeywords && queryKeywords.length > 0
        && !["BR-GesNr", "BR-Titel", "BR-Definition"].includes(label);
      if (shouldApplyKeywordFilter) {
        const titleLower = (kurztitel + " " + langtitel).toLowerCase();
        const matchCount = queryKeywords.filter(k => 
          titleLower.includes(k.toLowerCase())
        ).length;
        if (matchCount === 0) continue;
      }

      const isLandesrecht = label.startsWith("LR-");
      const score = label === "BR-GesNr" ? 0.95 : label === "BR-Titel" ? 0.92 : isLandesrecht ? 0.85 : 0.88;
      // Landesrecht docs are NOT in the Bundesnormen scope, so the
      // Bundesnormen URL builder would produce a 404. Use the docUrl
      // RIS hands us directly — it already has the correct Abfrage=Lr<code>
      // query string.
      const finalUrl = isLandesrecht ? (docUrl || "") : buildRisBundesnormenUrl(gesetzesnummer, artikel, docUrl);

      results.push({
        doc_ref: bgblRef || gesetzesnummer || artikel || "",
        title: isLandesrecht ? `${bestTitle} (${label.slice(3)})` : bestTitle,
        date: safeStr(meta?.Kundmachungsdatum) || "",
        url: finalUrl,
        score,
        highlights: [kurztitel, langtitel, artikel].filter(Boolean),
        provider: isLandesrecht ? "RIS-Landesrecht" : "RIS",
        pinpoint: artikel || undefined,
        snippet: langtitel || kurztitel || "",
      });
    }
  } catch (parseErr) {
    console.error(`RIS ${label} parse error:`, parseErr);
  }
  return results;
}

function pickBestTitle(candidates: string[], fallback: string): string {
  const junk = new Set(["hauptdokument", "gesamte rechtsvorschrift", "", "undefined"]);
  for (const c of candidates) {
    if (c && !junk.has(c.toLowerCase().trim())) return c;
  }
  return fallback;
}

/** Format RIS date strings like "2020-07-16T00:00:00" or "16.07.2020" → "16.07.2020" */
function formatRISDate(raw: string): string {
  if (!raw) return "";
  // ISO: 2020-07-16 or 2020-07-16T00:00:00
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  // Already DD.MM.YYYY
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) return raw;
  return raw;
}

async function parseRISJudikatur(resp: Response, isRechtssatz: boolean = false): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const data = await resp.json();
    const error = data?.OgdSearchResult?.Error;
    if (error) console.error("RIS Jud error:", error.Message || JSON.stringify(error));
    const hits = data?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference || [];
    const hitArray = Array.isArray(hits) ? hits : hits ? [hits] : [];
    console.log(`RIS ${isRechtssatz ? "JudRs" : "Jud"}: ${hitArray.length} hits`);

    for (const hit of hitArray.slice(0, 5)) {
      // Support multiple Judikatur sub-schemas
      const metadaten = hit?.Data?.Metadaten || {};
      const meta = metadaten?.JudikaturRs
        || metadaten?.JudikaturJustiz
        || metadaten?.Judikatur
        || metadaten || {};
      const justiz = meta?.Justiz || {};
      const allgemein = metadaten?.Allgemein || {};
      const technisch = metadaten?.Technisch || {};
      const docList = hit?.Data?.Dokumentliste?.ContentReference;
      const docInfo = Array.isArray(docList) ? docList[0] : docList || {};
      const rawGz = safeStr(meta?.Geschaeftszahl);
      const contentUrls = docInfo?.Urls?.ContentUrl;
      const contentUrlList = asArray(contentUrls);
      const xmlContentUrl = contentUrlList.find((u: any) => safeStr(u?.DataType).toLowerCase() === "xml");
      const htmlContentUrl = contentUrlList.find((u: any) => safeStr(u?.DataType).toLowerCase() === "html");
      const firstUrl = htmlContentUrl || xmlContentUrl || contentUrlList[0];
      const xmlUrl = safeStr(xmlContentUrl?.Url);
      const docUrl = normalizeRisUrl(safeStr(allgemein?.DokumentUrl) || safeStr(firstUrl?.Url));
      const firstGz = rawGz.split(";")[0].trim();
      const normen = safeStr(meta?.Normen);
      const gerichtstyp = safeStr(meta?.Gerichtstyp) || safeStr(justiz?.Gerichtstyp) || safeStr(justiz?.Gericht) || safeStr(technisch?.Organ);
      const dokumenttyp = safeStr(meta?.Dokumenttyp);
      const isActualRechtssatz = isRechtssatz || /rechtssatz/i.test(dokumenttyp);
      const rawDate = safeStr(meta?.Entscheidungsdatum);
      
      // Extract Dokumentnummer for direct linking (e.g. JJT_20220615_OGH0002_0060OB01400_18H0000_000)
      const dokumentnummer = safeStr(meta?.Dokumentnummer) || safeStr(hit?.Data?.Dokumentnummer) || safeStr(technisch?.ID) || "";

      // Extract Rechtssatznummer (RS number) if available — this is the key identifier for Austrian case law
      const ecli = safeStr(meta?.EuropeanCaseLawIdentifier);
      const rsNummer = safeStr(meta?.Rechtssatznummer)
        || safeStr(justiz?.Rechtssatznummern)
        || ecli.match(/RS\d{5,}/i)?.[0]
        || dokumentnummer;
      // Support both RS0094010 and RS94010 formats, also with leading zeros stripped
      const rsMatch = rsNummer.match(/RS0*(\d{5,})/);
      const rsRef = rsMatch ? `RIS-Justiz RS${rsMatch[1].padStart(7, "0")}` : "";

      // Format date
      const entscheidungsdatum = formatRISDate(rawDate);

      let bestTitle = "";
      let spruch = safeStr(meta?.RechtssatzText || meta?.Spruch || meta?.Kurztext || "");
      if (isActualRechtssatz && !spruch && xmlUrl) {
        spruch = await fetchRisXmlAbsatz(xmlUrl, "rechtssatz");
      }
      if (isActualRechtssatz && spruch.length > 10) {
        const spruchShort = spruch.length > 140 ? spruch.slice(0, 140) + "…" : spruch;
        bestTitle = `${dokumenttyp || "Rechtssatz"}: ${spruchShort}`;
      } else if (normen && normen.length > 5 && normen !== "undefined") {
        const normShort = normen.length > 100 ? normen.slice(0, 100) + "…" : normen;
        bestTitle = `${dokumenttyp || "Rechtssatz"} zu ${normShort}`;
      } else if (spruch && spruch.length > 10) {
        const spruchShort = spruch.length > 120 ? spruch.slice(0, 120) + "…" : spruch;
        bestTitle = `${dokumenttyp || "Judikatur"}: ${spruchShort}`;
      } else {
        bestTitle = `${dokumenttyp || "Judikatur"} ${firstGz}`;
      }
      // Prefix with court + case number + date for scanability
      const dateTag = entscheidungsdatum ? ` (${entscheidungsdatum})` : "";
      const fullTitle = isActualRechtssatz && spruch.length > 10
        ? bestTitle
        : gerichtstyp
        ? `${gerichtstyp} ${firstGz}${dateTag}: ${bestTitle}`
        : `${firstGz}${dateTag}: ${bestTitle}`;

      // Build a proper deep link:
      // Priority 1: API-provided docUrl (direct document link)
      // Priority 2: Dokument.wxe with Dokumentnummer (for JJT/JJR document IDs from the API)
      // Priority 3: RS-number search link
      // Priority 4: GZ-based search link
      const searchGz = firstGz || rawGz;
      let risUrl = docUrl;
      if (!risUrl && dokumentnummer && /^(JJT|JJR|JJRS)_/.test(dokumentnummer)) {
        // Build direct Dokument.wxe link from the API's Dokumentnummer
        const abfrage = isRechtssatz ? "Justiz" : "Justiz";
        risUrl = `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=${abfrage}&Dokumentnummer=${dokumentnummer}`;
      }
      if (!risUrl) {
        risUrl = rsRef && rsMatch
          ? `https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=Justiz&Suchworte=RS${rsMatch[1].padStart(7, "0")}&SucheNachRechtssatz=True&SucheNachText=True`
          : `https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=Justiz&Suchworte=${encodeURIComponent(searchGz)}&SucheNachRechtssatz=True&SucheNachText=True`;
      }

      // For Rechtssatz results, include RS-number prominently
      const docRefDisplay = rsRef || firstGz || "";
      const snippetParts = [spruch, normen?.slice(0, 250)].filter(Boolean);

      results.push({
        doc_ref: docRefDisplay,
        title: fullTitle,
        date: entscheidungsdatum || rawDate || "",
        url: risUrl,
        score: isActualRechtssatz && spruch ? 0.96 : isActualRechtssatz ? 0.90 : 0.85,
        highlights: [spruch, firstGz, rsRef, gerichtstyp, normen?.slice(0, 80)].filter(Boolean),
        provider: "RIS",
        pinpoint: rsRef || firstGz || undefined,
        snippet: snippetParts.join(" | ") || "",
      });
    }
  } catch (parseErr) {
    console.error("RIS Jud parse error:", parseErr);
  }
  return results;
}

function getRISFallback(query: string): SearchResult[] {
  const q = query.toLowerCase();
  const fallbacks: SearchResult[] = [];

  // Check if the query mentions any known law → provide direct link to its GeltendeFassung
  const words = q.split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/[.,;:!?()§]/g, "").trim();
    const lawInfo = LAW_ABBREV_MAP[cleanWord];
    if (lawInfo?.gesetzesnummer) {
      fallbacks.push({
        doc_ref: `FALLBACK-RIS-${lawInfo.gesetzesnummer}`,
        title: lawInfo.titel.replace(/\*$/, ""),
        date: "",
        url: `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=${lawInfo.gesetzesnummer}`,
        score: 0.75,
        highlights: [cleanWord, lawInfo.titel.replace(/\*$/, "")],
        provider: "RIS",
        snippet: `Geltende Fassung – ${lawInfo.titel.replace(/\*$/, "")}`,
        evidence_status: "fallback",
      });
      break; // Only add one direct law link
    }
  }

  // Fallback: search both Bundesnormen and Judikatur for broader coverage
  const searchTerms = words
    .filter(w => w.length > 3 && !STOPWORDS.has(w))
    .slice(0, 3)
    .join(" ");
  const searchQuery = searchTerms || query;

  fallbacks.push({
    doc_ref: "FALLBACK-RIS-BUNDESRECHT", title: `RIS Bundesrecht: "${searchQuery}"`,
    date: "", url: `https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=Bundesnormen&Suchworte=${encodeURIComponent(searchQuery)}`,
    score: 0.3, highlights: ["Durchsuchen Sie RIS direkt"], provider: "RIS",
    evidence_status: "fallback",
  });
  fallbacks.push({
    doc_ref: "FALLBACK-RIS-JUDIKATUR", title: `RIS Judikatur: "${searchQuery}"`,
    date: "", url: `https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=Justiz&Suchworte=${encodeURIComponent(searchQuery)}`,
    score: 0.25, highlights: ["Judikatur-Suche"], provider: "RIS",
    evidence_status: "fallback",
  });
  return fallbacks;
}

// ============================================================
// EUR-Lex - EU law database
// Strategy: 1) EUR-Lex REST Search API  2) Firecrawl  3) Fallback
// ============================================================
async function searchEURLex(query: string): Promise<SearchResult[]> {
  const keywordsArr = extractKeywords(query);
  const keywords = keywordsArr.join(" ");
  console.log(`EUR-Lex: keywords="${keywords}"`);

  // 1) Try EUR-Lex REST Search API (replaces SPARQL which returned 0 results)
  try {
    const restResults = await searchEURLexREST(keywords);
    if (restResults.length > 0) {
      console.log(`EUR-Lex REST: ${restResults.length} results`);
      return restResults;
    }
  } catch (e) {
    console.error("EUR-Lex REST failed:", e);
  }

  // 2) Try Firecrawl
  try {
    const firecrawlResults = await searchWithFirecrawl(
      `https://eur-lex.europa.eu/search.html?scope=EURLEX&text=${encodeURIComponent(keywords)}&type=quick&lang=de`,
      "EURLEX",
      keywords
    );
    if (firecrawlResults.length > 0) {
      console.log(`EUR-Lex Firecrawl: ${firecrawlResults.length} results`);
      return firecrawlResults;
    }
  } catch (e) {
    console.error("EUR-Lex Firecrawl failed:", e);
  }

  console.log("EUR-Lex: all methods failed, using fallback");
  return getEURLexFallback(query);
}

// EUR-Lex REST Search API using the expert search endpoint
async function searchEURLexREST(keywords: string): Promise<SearchResult[]> {
  const keywordList = keywords.split(" ").filter(w => w.length > 2 && !w.includes("*"));
  
  // Build a simple text query for the EUR-Lex search page API
  const searchText = keywordList.slice(0, 5).join(" ");
  const searchUrl = `https://eur-lex.europa.eu/search.html?scope=EURLEX&text=${encodeURIComponent(searchText)}&type=quick&lang=de&qid=&DTS_DOM=ALL&page=1`;
  
  // Try the CELLAR/SPARQL with improved query using text search
  const sparqlQuery = `
    PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT DISTINCT ?work ?title ?date ?celex WHERE {
      ?work cdm:work_has_expression ?expr .
      ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/DEU> .
      ?expr cdm:expression_title ?title .
      OPTIONAL { ?work cdm:work_date_document ?date . }
      OPTIONAL { ?work cdm:resource_legal_id_celex ?celex . }
      FILTER(${keywordList.map(k => `CONTAINS(LCASE(STR(?title)), "${k.toLowerCase()}")`).join(" || ")})
    }
    ORDER BY DESC(?date)
    LIMIT 8
  `;

  const sparqlUrl = `https://publications.europa.eu/webapi/rdf/sparql?default-graph-uri=&query=${encodeURIComponent(sparqlQuery)}`;
  const resp = await fetch(sparqlUrl, {
    headers: {
      "Accept": "application/sparql-results+json",
      "User-Agent": "LegalAI/1.0 (Research Tool)",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    console.error(`EUR-Lex SPARQL HTTP ${resp.status}`);
    await resp.text(); // consume body
    return [];
  }

  const data = await resp.json();
  const bindings = data?.results?.bindings || [];
  console.log(`EUR-Lex SPARQL: ${bindings.length} bindings`);

  if (bindings.length === 0) {
    // Fallback: try Firecrawl search for EUR-Lex content
    return await searchEURLexViaFirecrawlSearch(keywords);
  }

  return bindings.map((b: Record<string, { value: string }>) => {
    const celex = b.celex?.value || "";
    const cellarUri = b.work?.value || "";
    // CELEX produces a stable, user-facing legal-content URL. The cellarUri
    // (e.g. http://publications.europa.eu/resource/cellar/abc-123) is an
    // RDF graph identifier — it 404s in a normal browser and was the
    // source of broken EUR-Lex links when SPARQL bindings lacked a CELEX
    // number. Fall back to a EUR-Lex search instead so the link always
    // resolves to something useful.
    let eurLexUrl: string;
    if (celex) {
      eurLexUrl = `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:${celex}`;
    } else {
      const searchTerm = b.title?.value || keywords;
      eurLexUrl = `https://eur-lex.europa.eu/search.html?scope=EURLEX&type=quick&text=${encodeURIComponent(searchTerm.slice(0, 200))}`;
    }

    return {
      doc_ref: celex || cellarUri,
      title: b.title?.value || keywords,
      date: b.date?.value || "",
      url: eurLexUrl,
      score: 0.9,
      highlights: keywords.split(" ").filter((w: string) => w.length > 3),
      provider: "EURLEX",
      snippet: b.title?.value || "",
    };
  });
}

// Use Firecrawl's search feature to find EUR-Lex content
async function searchEURLexViaFirecrawlSearch(keywords: string): Promise<SearchResult[]> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return [];

  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `site:eur-lex.europa.eu ${keywords}`,
        limit: 5,
        lang: "de",
        scrapeOptions: { formats: ["markdown"] },
      }),
    });

    if (!resp.ok) {
      await resp.text();
      return [];
    }

    const data = await resp.json();
    const results: SearchResult[] = [];
    for (const item of (data?.data || []).slice(0, 8)) {
      const celex = extractCelexFromUrl(item.url || "");
      const snippet = item.description || "";
      const title = item.title || item.description || keywords;
      
      // Skip JavaScript-disabled / bot-check pages
      if (/javascript is disabled|verify.*robot/i.test(snippet) || /javascript is disabled|verify.*robot/i.test(title)) continue;
      // Skip untitled results
      if (title === "EUR-Lex" || title === "Ohne Titel" || title.length < 5) continue;
      
      results.push({
        doc_ref: celex || "",
        title,
        date: "",
        url: item.url || "",
        score: 0.85,
        highlights: keywords.split(" ").filter((w: string) => w.length > 3),
        provider: "EURLEX",
        snippet,
      });
      if (results.length >= 5) break;
    }
    console.log(`EUR-Lex Firecrawl Search: ${results.length} results`);
    return results;
  } catch (e) {
    console.error("EUR-Lex Firecrawl Search failed:", e);
    return [];
  }
}

function getEURLexFallback(query: string): SearchResult[] {
  const q = query.toLowerCase();
  const fallbacks: SearchResult[] = [];
  if (q.includes("dsgvo") || q.includes("datenschutz") || q.includes("gdpr")) {
    fallbacks.push({
      doc_ref: "32016R0679", title: "Verordnung (EU) 2016/679 – DSGVO",
      date: "2016-04-27", url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
      score: 0.7, highlights: ["Art. 6 DSGVO", "Rechtmäßigkeit"], provider: "EURLEX", pinpoint: "Art. 6 Abs. 1",
    });
  }
  if (q.includes("ki") || q.includes("artificial") || q.includes("ai act")) {
    fallbacks.push({
      doc_ref: "32024R1689", title: "Verordnung (EU) 2024/1689 – AI Act",
      date: "2024-06-13", url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
      score: 0.7, highlights: ["Hochrisiko-KI", "Transparenzpflichten"], provider: "EURLEX",
    });
  }
  // Manual search fallback with low score
  fallbacks.push({
    doc_ref: "EURLEX", title: `EU-Recht: "${query}"`,
    date: "", url: `https://eur-lex.europa.eu/search.html?scope=EURLEX&text=${encodeURIComponent(query)}&type=quick&lang=de`,
    score: 0.3, highlights: ["EUR-Lex durchsuchen"], provider: "EURLEX",
  });
  return fallbacks;
}

// ============================================================
// CURIA - Court of Justice of the EU (improved title parsing)
// ============================================================
async function searchCuria(query: string, _reformulated?: ReformulatedQuery | null): Promise<SearchResult[]> {
  const keywordsArr = extractKeywords(query);
  const keywords = keywordsArr.join(" ");
  console.log(`Curia: keywords="${keywords}"`);

  // 1) Try Firecrawl search for Curia content (more reliable than scraping)
  try {
    const searchResults = await searchCuriaViaFirecrawlSearch(keywords);
    if (searchResults.length > 0) {
      console.log(`Curia search: ${searchResults.length} results`);
      return searchResults;
    }
  } catch (e) {
    console.error("Curia search failed:", e);
  }

  // 2) Try Firecrawl scrape
  try {
    const firecrawlResults = await searchWithFirecrawl(
      `https://curia.europa.eu/juris/recherche.jsf?language=de&jur=C%2CT%2CF&td=%3BALL&textlibre=${encodeURIComponent(keywords)}&submit=Suchen`,
      "CURIA",
      keywords
    );
    if (firecrawlResults.length > 0) return firecrawlResults;
  } catch (e) {
    console.error("Curia Firecrawl scrape failed:", e);
  }

  // 3) Try plain HTML scrape
  try {
    const url = `https://curia.europa.eu/juris/recherche.jsf?language=de&jur=C%2CT%2CF&td=%3BALL&textlibre=${encodeURIComponent(keywords)}&submit=Suchen`;
    const resp = await fetchWithTimeout(url, 8000);
    if (resp.ok) {
      const html = await resp.text();
      const results = parseCuriaHTML(html, keywords);
      if (results.length > 0) return results;
    }
  } catch (_e) { /* ignore */ }

  return getCuriaFallback(query);
}

// Use Firecrawl search to find Curia case law
async function searchCuriaViaFirecrawlSearch(keywords: string): Promise<SearchResult[]> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return [];

  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `site:curia.europa.eu ${keywords} Urteil`,
        limit: 5,
        lang: "de",
      }),
    });

    if (!resp.ok) { await resp.text(); return []; }

    const data = await resp.json();
    const results: SearchResult[] = [];
    const seenCases = new Set<string>();

    for (const item of (data?.data || []).slice(0, 8)) {
      const allText = `${item.title || ""} ${item.description || ""} ${item.url || ""}`;
      const caseRef = extractCaseRef(allText);
      if (!caseRef) continue; // skip results without a case number
      if (seenCases.has(caseRef)) continue;
      seenCases.add(caseRef);

      let title = cleanCuriaTitle(item.title || "", item.url || "");
      const date = extractCuriaDate(allText);
      
      // Final fallback: if title is still truncated garbage, use caseRef
      if (title.length < 10 || /^[a-z]/.test(title)) {
        const isT = caseRef.startsWith("T-");
        title = isT ? `EuG Rechtssache ${caseRef}` : `EuGH Rechtssache ${caseRef}`;
      }

      results.push({
        doc_ref: caseRef,
        title,
        date,
        url: item.url || `https://curia.europa.eu/juris/liste.jsf?num=${caseRef}&language=de`,
        score: 0.88,
        highlights: [caseRef, ...keywords.split(" ").filter((w: string) => w.length > 3)],
        provider: "CURIA",
        pinpoint: caseRef,
        snippet: item.description || "",
      });
    }
    return results;
  } catch (e) {
    console.error("Curia Firecrawl search error:", e);
    return [];
  }
}

// Clean up Curia titles from malformed Firecrawl output
function cleanCuriaTitle(rawTitle: string, url: string): string {
  let title = rawTitle
    .replace(/^.*?(?=Rechtssache)/i, "") // Remove junk before "Rechtssache"
    .replace(/CURIA\s*[-–]\s*/i, "")
    .replace(/Dokumente\s*$/i, "")
    .replace(/^\s*[-–|]\s*/, "")
    .trim();

  // Fix truncated titles like "chtssache C-876/24", "tshof", "richt"
  const caseRef = extractCaseRef(title) || extractCaseRef(url);
  
  // Very short or starts with lowercase = truncated
  if (title.length < 8 || /^[a-z]/.test(title)) {
    if (caseRef) {
      // Detect court type from URL or text
      const isT = caseRef.startsWith("T-");
      title = isT ? `EuG Rechtssache ${caseRef}` : `EuGH Rechtssache ${caseRef}`;
    }
  }

  // If empty, build from URL
  if (!title || title.length < 5) {
    title = caseRef ? `EuGH ${caseRef}` : "EuGH-Entscheidung";
  }

  return title;
}

function extractCaseRef(text: string): string {
  const m = text.match(/(C[-–]\d+\/\d+|T[-–]\d+\/\d+)/i);
  return m ? m[1].replace("–", "-") : "";
}

/** Extract date from Curia snippets — matches "16. Juli 2020", "16.07.2020", "2020-07-16" etc. */
function extractCuriaDate(text: string): string {
  // ISO format: 2020-07-16
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];

  // German long format: 16. Juli 2020
  const monthMap: Record<string, string> = {
    januar: "01", februar: "02", märz: "03", april: "04", mai: "05", juni: "06",
    juli: "07", august: "08", september: "09", oktober: "10", november: "11", dezember: "12",
  };
  const deLong = text.match(/(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i);
  if (deLong) {
    const mm = monthMap[deLong[2].toLowerCase()] || "01";
    return `${deLong[3]}-${mm}-${deLong[1].padStart(2, "0")}`;
  }

  // DD.MM.YYYY
  const dmy = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  return "";
}

function parseCuriaHTML(html: string, query: string): SearchResult[] {
  const results: SearchResult[] = [];
  const cases = new Set<string>();
  const caseRegex = /(?:Rechtssache|Case)?\s*(?:Nr\.\s*)?(C[-–]\d+\/\d+|T[-–]\d+\/\d+)/gi;
  let match;
  while ((match = caseRegex.exec(html)) !== null && cases.size < 5) {
    cases.add(match[1].replace("–", "-"));
  }
  for (const caseRef of cases) {
    results.push({
      doc_ref: caseRef,
      title: `EuGH Rechtssache ${caseRef}`,
      date: "",
      url: `https://curia.europa.eu/juris/liste.jsf?num=${caseRef}&language=de`,
      score: 0.85,
      highlights: query.split(" ").filter(w => w.length > 3),
      provider: "CURIA",
    });
  }
  return results;
}

function getCuriaFallback(query: string): SearchResult[] {
  const q = query.toLowerCase();
  const fallbacks: SearchResult[] = [];
  if (q.includes("dsgvo") || q.includes("datenschutz") || q.includes("schrems")) {
    fallbacks.push({
      doc_ref: "C-311/18", title: "Schrems II – Datenschutz bei Drittstaatentransfers",
      date: "2020-07-16", url: "https://curia.europa.eu/juris/liste.jsf?num=C-311/18&language=de",
      score: 0.7, highlights: ["Privacy Shield", "Standardvertragsklauseln"], provider: "CURIA", pinpoint: "Rn. 134-137",
    });
  }
  // Manual search fallback with low score
  fallbacks.push({
    doc_ref: "CURIA", title: `EuGH-Suche: "${query}"`,
    date: "", url: `https://curia.europa.eu/juris/recherche.jsf?language=de&textlibre=${encodeURIComponent(query)}`,
    score: 0.3, highlights: ["CURIA durchsuchen"], provider: "CURIA",
  });
  return fallbacks;
}

// ============================================================
// FINDOK - via Firecrawl scraping (REST API returns 404)
// FINDOK URLs carry Spring Webflow session tokens that expire within
// minutes; see ./findok-url.ts for sanitization logic.
// ============================================================
async function searchFindok(query: string): Promise<SearchResult[]> {
  const keywordsArr = extractKeywords(query);
  const keywords = keywordsArr.join(" ");
  console.log(`Findok: keywords="${keywords}"`);

  // Only use Firecrawl search (REST API returns 404)
  try {
    const searchResults = await searchFindokViaFirecrawl(keywords);
    if (searchResults.length > 0) {
      console.log(`Findok Firecrawl: ${searchResults.length} results`);
      return searchResults;
    }
  } catch (e) {
    console.error("Findok Firecrawl failed:", e);
  }

  return getFindokFallback(query);
}

// Use Firecrawl search to find Findok content
async function searchFindokViaFirecrawl(keywords: string): Promise<SearchResult[]> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return [];

  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `site:findok.bmf.gv.at ${keywords}`,
        limit: 5,
        lang: "de",
      }),
    });

    if (!resp.ok) { await resp.text(); return []; }

    const data = await resp.json();
    const results: SearchResult[] = [];

    for (const item of (data?.data || []).slice(0, 5)) {
      const title = (item.title || "")
        .replace(/Findok\s*[-–|]\s*/i, "")
        .replace(/BMF\s*[-–|]\s*/i, "")
        .trim() || keywords;

      // Try to extract GZ from URL or title
      const gzMatch = (item.url || "").match(/[A-Z]{2,}\s*\d+\/\d+/i)
        || (item.title || "").match(/[A-Z]{2,}\s*\d+\/\d+/i);

      results.push({
        doc_ref: gzMatch ? gzMatch[0] : "",
        title,
        date: "",
        url: sanitizeFindokUrl(item.url || "", gzMatch ? gzMatch[0] : title || keywords),
        score: 0.82,
        highlights: keywords.split(" ").filter((w: string) => w.length > 3),
        provider: "FINDOK",
        snippet: item.description || "",
      });
    }
    return results;
  } catch (e) {
    console.error("Findok Firecrawl search error:", e);
    return [];
  }
}

function getFindokFallback(query: string): SearchResult[] {
  const q = query.toLowerCase();
  const fallbacks: SearchResult[] = [];
  if (q.includes("einkommen") || q.includes("estg") || q.includes("steuer")) {
    fallbacks.push({
      doc_ref: "EStR 2000", title: "Einkommensteuerrichtlinien 2000",
      date: "2000-01-01", url: sanitizeFindokUrl("", "EStR 2000"),
      score: 0.7, highlights: ["§ 4 EStG", "Betriebsausgaben"], provider: "FINDOK", pinpoint: "§ 4 Abs. 4 EStG",
    });
  }
  if (q.includes("umsatz") || q.includes("ustg") || q.includes("mehrwert")) {
    fallbacks.push({
      doc_ref: "UStR 2000", title: "Umsatzsteuerrichtlinien 2000",
      date: "2000-01-01", url: sanitizeFindokUrl("", "UStR 2000"),
      score: 0.65, highlights: ["§ 6 UStG", "Kleinunternehmerregelung"], provider: "FINDOK", pinpoint: "§ 6 Abs. 1 Z 27 UStG",
    });
  }
  // Manual search fallback with low score
  fallbacks.push({
    doc_ref: "FINDOK", title: `Findok-Suche: "${query}"`,
    date: "", url: sanitizeFindokUrl("", query),
    score: 0.3, highlights: ["Findok durchsuchen"], provider: "FINDOK",
  });
  return fallbacks;
}

// ============================================================
// ============================================================
// GII - Gesetze-im-Internet.de (German federal law)
// Strategy: 1) Direct law lookup via abbreviation map
//           2) Firecrawl site search
// ============================================================

const DE_LAW_MAP: Record<string, { name: string; slug: string }> = {
  "bgb": { name: "Bürgerliches Gesetzbuch", slug: "bgb" },
  "stgb": { name: "Strafgesetzbuch", slug: "stgb" },
  "zpo": { name: "Zivilprozessordnung", slug: "zpo" },
  "stpo": { name: "Strafprozessordnung", slug: "stpo" },
  "hgb": { name: "Handelsgesetzbuch", slug: "hgb" },
  "gg": { name: "Grundgesetz", slug: "gg" },
  "arbgg": { name: "Arbeitsgerichtsgesetz", slug: "arbgg" },
  "betrvg": { name: "Betriebsverfassungsgesetz", slug: "betrvg" },
  "kschg": { name: "Kündigungsschutzgesetz", slug: "kschg" },
  "tzbfg": { name: "Teilzeit- und Befristungsgesetz", slug: "tzbfg" },
  "estg": { name: "Einkommensteuergesetz", slug: "estg" },
  "ustg": { name: "Umsatzsteuergesetz", slug: "ustg_1980" },
  "ao": { name: "Abgabenordnung", slug: "ao_1977" },
  "gmbhg": { name: "GmbH-Gesetz", slug: "gmbhg" },
  "aktg": { name: "Aktiengesetz", slug: "aktg" },
  "inso": { name: "Insolvenzordnung", slug: "inso" },
  "vwgo": { name: "Verwaltungsgerichtsordnung", slug: "vwgo" },
  "vwvfg": { name: "Verwaltungsverfahrensgesetz", slug: "vwvfg" },
  "sgb": { name: "Sozialgesetzbuch", slug: "sgb_1" },
  "brao": { name: "Bundesrechtsanwaltsordnung", slug: "brao" },
  "urhg": { name: "Urheberrechtsgesetz", slug: "urhg" },
  "markeng": { name: "Markengesetz", slug: "markeng" },
  "uwg": { name: "Gesetz gegen den unlauteren Wettbewerb", slug: "uwg_2004" },
  "gwb": { name: "Gesetz gegen Wettbewerbsbeschränkungen", slug: "gwb" },
  "bdsg": { name: "Bundesdatenschutzgesetz", slug: "bdsg_2018" },
  "tmg": { name: "Telemediengesetz", slug: "tmg" },
  "mietrecht": { name: "Bürgerliches Gesetzbuch – Mietrecht", slug: "bgb" },
  "arbeitsrecht": { name: "Bürgerliches Gesetzbuch – Arbeitsrecht", slug: "bgb" },
  "erbrecht": { name: "Bürgerliches Gesetzbuch – Erbrecht", slug: "bgb" },
  "familienrecht": { name: "Bürgerliches Gesetzbuch – Familienrecht", slug: "bgb" },
  "sachenrecht": { name: "Bürgerliches Gesetzbuch – Sachenrecht", slug: "bgb" },
  "schuldrecht": { name: "Bürgerliches Gesetzbuch – Schuldrecht", slug: "bgb" },
  "agbrecht": { name: "Bürgerliches Gesetzbuch – AGB-Recht", slug: "bgb" },
  "beamtstg": { name: "Beamtenstatusgesetz", slug: "beamtstg" },
  "bimschg": { name: "Bundes-Immissionsschutzgesetz", slug: "bimschg" },
  "bauo": { name: "Bauordnung", slug: "baugb" },
  "baugb": { name: "Baugesetzbuch", slug: "baugb" },
  "stvg": { name: "Straßenverkehrsgesetz", slug: "stvg" },
  "stvo": { name: "Straßenverkehrs-Ordnung", slug: "stvo_2013" },
  "vvg": { name: "Versicherungsvertragsgesetz", slug: "vvg_2008" },
  "aufenthg": { name: "Aufenthaltsgesetz", slug: "aufenthg_2004" },
  "asylg": { name: "Asylgesetz", slug: "asylvfg_1992" },
  "btmg": { name: "Betäubungsmittelgesetz", slug: "btmg_1981" },
  "waffg": { name: "Waffengesetz", slug: "waffg_2002" },
  "tierschg": { name: "Tierschutzgesetz", slug: "tierschg" },
};

// Thematic terms → DE law slug
const DE_THEME_MAP: Record<string, string> = {
  "kündigungsfrist": "bgb", "kündigungsfristen": "bgb", "kündigung": "bgb",
  "mietvertrag": "bgb", "miete": "bgb", "mietrecht": "bgb", "mieterhöhung": "bgb",
  "kaufvertrag": "bgb", "gewährleistung": "bgb", "schadenersatz": "bgb", "schadensersatz": "bgb",
  "haftung": "bgb", "verjährung": "bgb", "vertrag": "bgb",
  "arbeitsvertrag": "bgb", "abmahnung": "kschg", "kündigungsschutz": "kschg",
  "betriebsrat": "betrvg", "mitbestimmung": "betrvg",
  "insolvenz": "inso", "konkurs": "inso",
  "datenschutz": "bdsg_2018", "dsgvo": "bdsg_2018",
  "straftat": "stgb", "körperverletzung": "stgb", "betrug": "stgb", "diebstahl": "stgb",
  "grundrechte": "gg", "meinungsfreiheit": "gg", "versammlungsfreiheit": "gg",
  "gmbh": "gmbhg", "gesellschaft": "gmbhg", "aktiengesellschaft": "aktg",
  "urheberrecht": "urhg", "markenrecht": "markeng",
  "wettbewerbsrecht": "uwg_2004", "agb": "bgb",
  "baurecht": "baugb", "baugenehmigung": "baugb",
  "verkehrsunfall": "stvg", "fahrerlaubnis": "stvg",
  "versicherung": "vvg_2008",
  "aufenthaltserlaubnis": "aufenthg_2004", "abschiebung": "aufenthg_2004",
};

async function searchGII(query: string, reformulated?: ReformulatedQuery | null): Promise<SearchResult[]> {
  const keywords = reformulated?.gii_keywords?.length ? reformulated.gii_keywords.flatMap(k => k.split(/\s+/)) : extractCoreKeywords(query);
  const giiLaw = reformulated?.gii_law || "";
  console.log(`GII: keywords=${JSON.stringify(keywords)}, law=${giiLaw} (from: "${query}", llm: ${!!reformulated?.gii_keywords?.length})`);

  const results: SearchResult[] = [];
  const seenSlugs = new Set<string>();

  // 1) Check for known law abbreviations → direct links
  for (const kw of keywords) {
    const lower = kw.toLowerCase();
    const law = DE_LAW_MAP[lower];
    if (law && !seenSlugs.has(law.slug)) {
      seenSlugs.add(law.slug);
      results.push({
        doc_ref: kw.toUpperCase(),
        title: law.name,
        date: "",
        url: `https://www.gesetze-im-internet.de/${law.slug}/`,
        score: 0.95,
        highlights: [kw, law.name],
        provider: "GII",
        snippet: `Volltext – ${law.name} (gesetze-im-internet.de)`,
      });
    }
    // Also check thematic terms
    const themeSlug = DE_THEME_MAP[lower];
    if (themeSlug && !seenSlugs.has(themeSlug)) {
      seenSlugs.add(themeSlug);
      const themeLaw = Object.values(DE_LAW_MAP).find(l => l.slug === themeSlug);
      if (themeLaw) {
        results.push({
          doc_ref: themeSlug.toUpperCase(),
          title: themeLaw.name,
          date: "",
          url: `https://www.gesetze-im-internet.de/${themeSlug}/`,
          score: 0.90,
          highlights: [kw, themeLaw.name],
          provider: "GII",
          snippet: `Relevantes Gesetz für "${kw}" – ${themeLaw.name}`,
        });
      }
    }
  }

  // 2) Check for § references → direct paragraph links
  const paraMatch = query.match(/§\s*(\d+[a-z]?)\s+(\w+)/i);
  if (paraMatch) {
    const paraNum = paraMatch[1];
    const lawAbbr = paraMatch[2].toLowerCase();
    const law = DE_LAW_MAP[lawAbbr];
    if (law) {
      const paraSlug = `__${paraNum}`;
      results.unshift({
        doc_ref: `§ ${paraNum} ${paraMatch[2].toUpperCase()}`,
        title: `§ ${paraNum} ${law.name}`,
        date: "",
        url: `https://www.gesetze-im-internet.de/${law.slug}/${paraSlug}.html`,
        score: 0.98,
        highlights: [`§ ${paraNum}`, law.name],
        provider: "GII",
        snippet: `Einzelnorm § ${paraNum} ${law.name}`,
      });
    }
  }

  // 3) Firecrawl site search for additional results
  if (results.length < 5) {
    try {
      const firecrawlResults = await searchGIIViaFirecrawl(keywords.slice(0, 3).join(" "));
      for (const r of firecrawlResults) {
        const key = r.url;
        if (!results.some(existing => existing.url === key)) {
          results.push(r);
        }
      }
    } catch (e) {
      console.error("GII Firecrawl failed:", e);
    }
  }

  if (results.length === 0) {
    // Fallback: search link with low score
    results.push({
      doc_ref: "GII",
      title: `Gesetze-im-Internet: "${query}"`,
      date: "",
      url: `https://www.gesetze-im-internet.de/cgi-bin/SucheSuche?textsuche=1&suchworte=${encodeURIComponent(query)}`,
      score: 0.3,
      highlights: ["Gesetze-im-Internet durchsuchen"],
      provider: "GII",
    });
  }

  return results;
}

async function searchGIIViaFirecrawl(keywords: string): Promise<SearchResult[]> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return [];

  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `site:gesetze-im-internet.de ${keywords}`,
        limit: 5,
        lang: "de",
        country: "de",
      }),
    });

    if (!resp.ok) { await resp.text(); return []; }

    const data = await resp.json();
    const results: SearchResult[] = [];

    for (const item of (data?.data || []).slice(0, 5)) {
      const title = (item.title || "")
        .replace(/- Gesetze im Internet$/i, "")
        .replace(/nichtamtliches Inhaltsverzeichnis/i, "")
        .trim() || keywords;

      // Try to extract law abbreviation from URL
      const urlMatch = (item.url || "").match(/gesetze-im-internet\.de\/([^/]+)\//);
      const lawSlug = urlMatch ? urlMatch[1] : "";

      results.push({
        doc_ref: lawSlug.toUpperCase() || "",
        title,
        date: "",
        url: item.url || "",
        score: 0.82,
        highlights: keywords.split(" ").filter((w: string) => w.length > 3),
        provider: "GII",
        snippet: item.description || "",
      });
    }
    return results;
  } catch (e) {
    console.error("GII Firecrawl search error:", e);
    return [];
  }
}

// ============================================================
// OpenJur - German case law database (openjur.de)
// Strategy: 1) Firecrawl search  2) Direct HTML scrape
// ============================================================

async function searchOpenJur(query: string, reformulated?: ReformulatedQuery | null): Promise<SearchResult[]> {
  const keywords = reformulated?.openjur_keywords?.length ? reformulated.openjur_keywords.flatMap(k => k.split(/\s+/)) : extractCoreKeywords(query);
  const searchTerms = keywords.slice(0, 5).join(" ");
  console.log(`OpenJur: keywords="${searchTerms}" (from: "${query}")`);

  // Run main search AND case-law-specific searches in parallel
  const searchPromises: Promise<SearchResult[]>[] = [];
  
  // 1) Main Firecrawl search
  searchPromises.push(
    searchOpenJurViaFirecrawl(searchTerms).catch(e => {
      console.error("OpenJur Firecrawl failed:", e);
      return [] as SearchResult[];
    })
  );

  // 2) Case-law-specific searches (e.g. "BGH Newsletter Einwilligung")
  if (reformulated?.case_law_searches?.length) {
    for (const clSearch of reformulated.case_law_searches.slice(0, 2)) {
      // Only use DE-relevant case law searches (BGH, OLG, etc.)
      if (/\b(BGH|OLG|LG|AG|BAG|BVerwG|BFH|BSG|BVerfG)\b/i.test(clSearch)) {
        searchPromises.push(
          searchOpenJurViaFirecrawl(clSearch).catch(() => [] as SearchResult[])
        );
      }
    }
  }

  const allResults = await Promise.allSettled(searchPromises);
  const combined: SearchResult[] = [];
  const seenRefs = new Set<string>();
  
  for (const r of allResults) {
    if (r.status === "fulfilled") {
      for (const hit of r.value) {
        const key = hit.doc_ref || hit.url || hit.title;
        if (!seenRefs.has(key)) { seenRefs.add(key); combined.push(hit); }
      }
    }
  }
  
  if (combined.length > 0) return combined;

  // 3) Direct HTML scrape fallback
  try {
    const url = `https://openjur.de/suche/${encodeURIComponent(searchTerms)}/`;
    const resp = await fetchWithTimeout(url, 8000);
    if (resp.ok) {
      const html = await resp.text();
      const results = parseOpenJurHTML(html, searchTerms);
      if (results.length > 0) return results;
    }
  } catch (e) {
    console.error("OpenJur HTML scrape failed:", e);
  }

  // Fallback
  return [{
    doc_ref: "OPENJUR",
    title: `OpenJur-Suche: "${query}"`,
    date: "",
    url: `https://openjur.de/suche/${encodeURIComponent(query)}/`,
    score: 0.3,
    highlights: ["OpenJur durchsuchen"],
    provider: "OPENJUR",
  }];
}

async function searchOpenJurViaFirecrawl(keywords: string): Promise<SearchResult[]> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return [];

  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `site:openjur.de ${keywords}`,
        limit: 5,
        lang: "de",
        country: "de",
      }),
    });

    if (!resp.ok) { await resp.text(); return []; }

    const data = await resp.json();
    const results: SearchResult[] = [];

    for (const item of (data?.data || []).slice(0, 5)) {
      // Parse court and case number from OpenJur titles like "BGH, 12.03.2024 - III ZR 123/23"
      const title = (item.title || "").replace(/\s*[-|]\s*openJur$/i, "").trim();
      const caseMatch = title.match(/^(\w+),?\s*(?:Urteil|Beschluss|Urt\.|Beschl\.)?\s*(?:v(?:om)?\.?\s*)?(\d{1,2}\.\d{1,2}\.\d{4})?\s*[-–]?\s*(.*)/i);
      
      let court = "";
      let date = "";
      let caseRef = "";
      
      if (caseMatch) {
        court = caseMatch[1] || "";
        date = caseMatch[2] || "";
        caseRef = caseMatch[3]?.trim() || "";
      }

      // Extract case number from URL pattern /u/{id}.html
      const urlIdMatch = (item.url || "").match(/\/u\/(\d+)\.html/);

      results.push({
        doc_ref: caseRef || (urlIdMatch ? `OpenJur-${urlIdMatch[1]}` : ""),
        title: title || keywords,
        date,
        url: item.url || "",
        score: 0.85,
        highlights: keywords.split(" ").filter((w: string) => w.length > 3),
        provider: "OPENJUR",
        snippet: item.description || "",
        pinpoint: caseRef || undefined,
      });
    }
    return results;
  } catch (e) {
    console.error("OpenJur Firecrawl search error:", e);
    return [];
  }
}

function parseOpenJurHTML(html: string, query: string): SearchResult[] {
  const results: SearchResult[] = [];
  
  // Extract case entries from OpenJur search results HTML
  // Pattern: links like /u/12345.html with court names and case numbers
  const entryRegex = /<a[^>]*href="(\/u\/\d+\.html)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  const seen = new Set<string>();
  
  while ((match = entryRegex.exec(html)) !== null && results.length < 5) {
    const path = match[1];
    const title = match[2].trim();
    
    if (seen.has(path) || title.length < 10) continue;
    seen.add(path);
    
    // Try to extract case reference
    const caseRefMatch = title.match(/(\w+[-\s]+\d+\s*\/\s*\d+)/);
    
    results.push({
      doc_ref: caseRefMatch ? caseRefMatch[1] : "",
      title,
      date: "",
      url: `https://openjur.de${path}`,
      score: 0.82,
      highlights: query.split(" ").filter(w => w.length > 3),
      provider: "OPENJUR",
    });
  }
  
  return results;
}

// ============================================================
// Firecrawl scrape (for direct page scraping)
// ============================================================
async function searchWithFirecrawl(
  url: string,
  provider: string,
  keywords: string
): Promise<SearchResult[]> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return [];

  console.log(`Firecrawl scrape: ${url}`);
  const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "links"],
      onlyMainContent: true,
      waitFor: 3000,
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`Firecrawl HTTP ${resp.status}: ${errBody.slice(0, 200)}`);
    return [];
  }

  const data = await resp.json();
  const markdown = data?.data?.markdown || data?.markdown || "";
  const links = data?.data?.links || data?.links || [];

  if (!markdown && links.length === 0) return [];

  if (provider === "EURLEX") return parseFirecrawlEURLex(markdown, links, keywords);
  if (provider === "CURIA") return parseFirecrawlCuria(markdown, links, keywords);
  return [];
}

function parseFirecrawlEURLex(markdown: string, links: string[], keywords: string): SearchResult[] {
  const results: SearchResult[] = [];
  const seenTitles = new Set<string>();
  const junkPatterns = /cookie|skip|accept|refuse|main.?content|footer|header|navigation|privacy|legal.?notice|home$|^\s*_|^l-content|nbsp|^\s*pdf$|^\s*html$/i;

  // Strategy 1: Extract EU law references
  const docPatterns = [
    /(?:Verordnung|Richtlinie|Beschluss)\s*\((?:EU|EG)\)\s*(?:Nr\.\s*)?(\d{4}\/\d+|\d+\/\d+)/gi,
    /CELEX[:\s]*(\d{5}[A-Z]\d{4})/gi,
  ];
  for (const pattern of docPatterns) {
    let match;
    while ((match = pattern.exec(markdown)) !== null && results.length < 5) {
      const ref = match[1];
      if (seenTitles.has(ref)) continue;
      seenTitles.add(ref);
      const idx = match.index;
      const context = markdown.slice(Math.max(0, idx - 20), Math.min(markdown.length, idx + 150));
      const titleLine = context.split("\n")[0].replace(/[#*\[\]()]/g, "").trim();
      const matchingLink = links.find(l => l.includes(ref) || l.includes("legal-content"));
      results.push({
        doc_ref: ref, title: titleLine || `EU-Rechtsakt ${ref}`, date: "",
        url: matchingLink || `https://eur-lex.europa.eu/search.html?text=${encodeURIComponent(ref)}`,
        score: 0.88, highlights: keywords.split(" ").filter(w => w.length > 3), provider: "EURLEX",
      });
    }
  }

  // Strategy 2: Markdown links
  const linkLineRegex = /\[([^\]]{10,})\]\((https?:\/\/eur-lex\.europa\.eu\/(?:legal-content|eli)[^)]+)\)/g;
  let linkMatch;
  while ((linkMatch = linkLineRegex.exec(markdown)) !== null && results.length < 5) {
    const title = linkMatch[1].trim();
    const url = linkMatch[2];
    if (seenTitles.has(title) || junkPatterns.test(title)) continue;
    seenTitles.add(title);
    results.push({
      doc_ref: extractCelexFromUrl(url) || "", title, date: "", url,
      score: 0.86, highlights: keywords.split(" ").filter(w => w.length > 3), provider: "EURLEX",
    });
  }

  return results;
}

function parseFirecrawlCuria(markdown: string, links: string[], keywords: string): SearchResult[] {
  const results: SearchResult[] = [];
  const cases = new Set<string>();

  const caseRegex = /(C[-–]\d+\/\d+|T[-–]\d+\/\d+)/gi;
  let match;
  while ((match = caseRegex.exec(markdown)) !== null && cases.size < 5) {
    const caseRef = match[1].replace("–", "-");
    if (cases.has(caseRef)) continue;
    cases.add(caseRef);

    const idx = match.index;
    const context = markdown.slice(Math.max(0, idx - 10), Math.min(markdown.length, idx + 150));
    const contextLine = context.split("\n")[0].replace(/[#*\[\]]/g, "").trim();
    let title = cleanCuriaTitle(contextLine, "");
    
    // Final fallback for truncated titles
    if (!title || title.length < 10 || /^[a-z]/.test(title)) {
      const isT = caseRef.startsWith("T-");
      title = isT ? `EuG Rechtssache ${caseRef}` : `EuGH Rechtssache ${caseRef}`;
    }

    const matchingLink = links.find(l => l.includes(caseRef.replace("-", ""))) ||
      `https://curia.europa.eu/juris/liste.jsf?num=${caseRef}&language=de`;

    results.push({
      doc_ref: caseRef,
      title,
      date: "",
      url: matchingLink,
      score: 0.88,
      highlights: keywords.split(" ").filter(w => w.length > 3),
      provider: "CURIA",
      snippet: contextLine,
    });
  }
  return results;
}

function extractCelexFromUrl(url: string): string {
  const m = url.match(/celex[:/]([A-Z0-9]+)/i) || url.match(/(\d{5}[A-Z]\d{4})/);
  return m ? m[1] : "";
}

// ============================================================
// DEJURE - dejure.org (German law & case law with cross-references)
// URL patterns:
//   Laws: https://dejure.org/gesetze/BGB  (overview)
//         https://dejure.org/gesetze/BGB/433.html  (specific §)
//   Case law: via Firecrawl search
// Strategy: 1) Direct law links via abbreviation map
//           2) Firecrawl site search for case law & commentary
// ============================================================

const DEJURE_LAW_MAP: Record<string, { name: string; slug: string }> = {
  "bgb": { name: "Bürgerliches Gesetzbuch", slug: "BGB" },
  "stgb": { name: "Strafgesetzbuch", slug: "StGB" },
  "zpo": { name: "Zivilprozessordnung", slug: "ZPO" },
  "stpo": { name: "Strafprozessordnung", slug: "StPO" },
  "hgb": { name: "Handelsgesetzbuch", slug: "HGB" },
  "gg": { name: "Grundgesetz", slug: "GG" },
  "betrvg": { name: "Betriebsverfassungsgesetz", slug: "BetrVG" },
  "kschg": { name: "Kündigungsschutzgesetz", slug: "KSchG" },
  "tzbfg": { name: "Teilzeit- und Befristungsgesetz", slug: "TzBfG" },
  "estg": { name: "Einkommensteuergesetz", slug: "EStG" },
  "ustg": { name: "Umsatzsteuergesetz", slug: "UStG" },
  "ao": { name: "Abgabenordnung", slug: "AO" },
  "gmbhg": { name: "GmbH-Gesetz", slug: "GmbHG" },
  "aktg": { name: "Aktiengesetz", slug: "AktG" },
  "inso": { name: "Insolvenzordnung", slug: "InsO" },
  "vwgo": { name: "Verwaltungsgerichtsordnung", slug: "VwGO" },
  "vwvfg": { name: "Verwaltungsverfahrensgesetz", slug: "VwVfG" },
  "brao": { name: "Bundesrechtsanwaltsordnung", slug: "BRAO" },
  "urhg": { name: "Urheberrechtsgesetz", slug: "UrhG" },
  "uwg": { name: "Gesetz gegen den unlauteren Wettbewerb", slug: "UWG" },
  "bdsg": { name: "Bundesdatenschutzgesetz", slug: "BDSG" },
  "sgb_i": { name: "Sozialgesetzbuch I", slug: "SGB_I" },
  "sgb_ii": { name: "Sozialgesetzbuch II", slug: "SGB_II" },
  "sgb_iii": { name: "Sozialgesetzbuch III", slug: "SGB_III" },
  "sgb_v": { name: "Sozialgesetzbuch V", slug: "SGB_V" },
  "baugb": { name: "Baugesetzbuch", slug: "BauGB" },
  "stvg": { name: "Straßenverkehrsgesetz", slug: "StVG" },
  "stvo": { name: "Straßenverkehrs-Ordnung", slug: "StVO" },
  "vvg": { name: "Versicherungsvertragsgesetz", slug: "VVG" },
  "aufenthg": { name: "Aufenthaltsgesetz", slug: "AufenthG" },
  "gwb": { name: "Gesetz gegen Wettbewerbsbeschränkungen", slug: "GWB" },
  "markeng": { name: "Markengesetz", slug: "MarkenG" },
  "ago": { name: "Arbeitsgerichtsgesetz", slug: "ArbGG" },
  "fgo": { name: "Finanzgerichtsordnung", slug: "FGO" },
  "gvg": { name: "Gerichtsverfassungsgesetz", slug: "GVG" },
  "zvg": { name: "Zwangsversteigerungsgesetz", slug: "ZVG" },
  "weg": { name: "Wohnungseigentumsgesetz", slug: "WEG" },
  "agg": { name: "Allgemeines Gleichbehandlungsgesetz", slug: "AGG" },
};

// Map thematic terms → dejure slug
const DEJURE_THEME_MAP: Record<string, string> = {
  "kündigung": "BGB", "kündigungsfrist": "BGB", "mietvertrag": "BGB", "miete": "BGB",
  "kaufvertrag": "BGB", "gewährleistung": "BGB", "schadenersatz": "BGB", "schadensersatz": "BGB",
  "haftung": "BGB", "verjährung": "BGB", "vertrag": "BGB",
  "arbeitsvertrag": "BGB", "abmahnung": "KSchG", "kündigungsschutz": "KSchG",
  "betriebsrat": "BetrVG", "mitbestimmung": "BetrVG",
  "insolvenz": "InsO", "konkurs": "InsO",
  "datenschutz": "BDSG", "dsgvo": "BDSG",
  "straftat": "StGB", "körperverletzung": "StGB", "betrug": "StGB", "diebstahl": "StGB",
  "grundrechte": "GG", "meinungsfreiheit": "GG",
  "gmbh": "GmbHG", "gesellschaft": "GmbHG", "aktiengesellschaft": "AktG",
  "urheberrecht": "UrhG", "markenrecht": "MarkenG",
  "wettbewerbsrecht": "UWG", "agb": "BGB",
  "baurecht": "BauGB", "baugenehmigung": "BauGB",
  "verkehrsunfall": "StVG", "versicherung": "VVG",
  "wohnungseigentum": "WEG", "diskriminierung": "AGG", "gleichbehandlung": "AGG",
};

async function searchDejure(query: string, reformulated?: ReformulatedQuery | null): Promise<SearchResult[]> {
  const keywords = reformulated?.gii_keywords?.length ? reformulated.gii_keywords.flatMap(k => k.split(/\s+/)) : extractCoreKeywords(query);
  console.log(`DEJURE: keywords=${JSON.stringify(keywords)} (from: "${query}", llm: ${!!reformulated?.gii_keywords?.length})`);

  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();

  // 1) Check for § references → direct paragraph links
  const paraMatch = query.match(/§\s*(\d+[a-z]?)\s+(\w+)/i);
  if (paraMatch) {
    const paraNum = paraMatch[1];
    const lawAbbr = paraMatch[2].toLowerCase();
    const law = DEJURE_LAW_MAP[lawAbbr];
    if (law) {
      const url = `https://dejure.org/gesetze/${law.slug}/${paraNum}.html`;
      seenUrls.add(url);
      results.push({
        doc_ref: `§ ${paraNum} ${paraMatch[2].toUpperCase()}`,
        title: `§ ${paraNum} ${law.name}`,
        date: "",
        url,
        score: 0.98,
        highlights: [`§ ${paraNum}`, law.name],
        provider: "DEJURE",
        snippet: `Einzelnorm mit Querverweisen & Rechtsprechung – dejure.org`,
      });
    }
  }

  // 2) Known law abbreviations → law overview page
  for (const kw of keywords) {
    const lower = kw.toLowerCase();
    const law = DEJURE_LAW_MAP[lower];
    if (law) {
      const url = `https://dejure.org/gesetze/${law.slug}`;
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        results.push({
          doc_ref: kw.toUpperCase(),
          title: law.name,
          date: "",
          url,
          score: 0.95,
          highlights: [kw, law.name],
          provider: "DEJURE",
          snippet: `Volltext mit Querverweisen – dejure.org`,
        });
      }
    }
    // Thematic terms
    const themeSlug = DEJURE_THEME_MAP[lower];
    if (themeSlug && !seenUrls.has(`https://dejure.org/gesetze/${themeSlug}`)) {
      const url = `https://dejure.org/gesetze/${themeSlug}`;
      seenUrls.add(url);
      const lawEntry = Object.values(DEJURE_LAW_MAP).find(l => l.slug === themeSlug);
      results.push({
        doc_ref: themeSlug,
        title: lawEntry?.name || themeSlug,
        date: "",
        url,
        score: 0.90,
        highlights: [kw, lawEntry?.name || themeSlug],
        provider: "DEJURE",
        snippet: `Relevantes Gesetz für „${kw}" – dejure.org`,
      });
    }
  }

  // 3) Firecrawl search for case law and additional results
  if (results.length < 5) {
    try {
      const searchResults = await searchDejureViaFirecrawl(keywords.slice(0, 3).join(" "));
      for (const r of searchResults) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          results.push(r);
        }
      }
    } catch (e) {
      console.error("DEJURE Firecrawl failed:", e);
    }
  }

  if (results.length === 0) {
    // Fallback: link to dejure.org homepage
    results.push({
      doc_ref: "DEJURE",
      title: `dejure.org-Suche: "${query}"`,
      date: "",
      url: `https://dejure.org/`,
      score: 0.3,
      highlights: ["dejure.org durchsuchen"],
      provider: "DEJURE",
    });
  }

  return results;
}

async function searchDejureViaFirecrawl(keywords: string): Promise<SearchResult[]> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return [];

  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `site:dejure.org ${keywords}`,
        limit: 5,
        lang: "de",
        country: "de",
      }),
    });

    if (!resp.ok) { await resp.text(); return []; }

    const data = await resp.json();
    const results: SearchResult[] = [];

    for (const item of (data?.data || []).slice(0, 5)) {
      const rawTitle = (item.title || "")
        .replace(/\s*[-–|]\s*dejure\.org$/i, "")
        .replace(/\s*[-–|]\s*Rechtsprechung$/i, "")
        .trim() || keywords;

      // Detect type from URL
      const url = item.url || "";
      const isLaw = url.includes("/gesetze/");
      const isCase = url.includes("/dienste/") || url.includes("/rechtsprechung/");

      // Extract law/paragraph info from URL
      const lawMatch = url.match(/\/gesetze\/(\w+)(?:\/(\d+[a-z]?)\.html)?/);
      let docRef = "";
      if (lawMatch) {
        docRef = lawMatch[2] ? `§ ${lawMatch[2]} ${lawMatch[1]}` : lawMatch[1];
      }

      // Extract case reference from title (e.g., "BGH, 12.03.2024 - III ZR 123/23")
      const caseMatch = rawTitle.match(/^(\w+),?\s*(\d{1,2}\.\d{1,2}\.\d{4})?\s*[-–]?\s*([\w\s/]+\d+\/\d+)/);
      if (caseMatch) {
        docRef = caseMatch[3]?.trim() || docRef;
      }

      results.push({
        doc_ref: docRef,
        title: rawTitle,
        date: caseMatch?.[2] || "",
        url,
        score: isLaw ? 0.88 : isCase ? 0.85 : 0.82,
        highlights: keywords.split(" ").filter((w: string) => w.length > 3),
        provider: "DEJURE",
        snippet: item.description || (isLaw ? "Gesetzestext mit Querverweisen" : "Rechtsprechung"),
      });
    }
    return results;
  } catch (e) {
    console.error("DEJURE Firecrawl search error:", e);
    return [];
  }
}

// ============================================================
// FEDLEX - Swiss Federal Law (fedlex.data.admin.ch)
// ============================================================

const CH_LAW_MAP: Record<string, string> = {
  "or": "Obligationenrecht",
  "zgb": "Zivilgesetzbuch",
  "stgb": "Strafgesetzbuch",
  "schkg": "Schuldbetreibungs- und Konkursgesetz",
  "bg": "Bundesgesetz",
  "bv": "Bundesverfassung",
  "stpo": "Strafprozessordnung",
  "zpo": "Zivilprozessordnung",
  "vwvg": "Verwaltungsverfahrensgesetz",
  "dsg": "Datenschutzgesetz",
  "mwstg": "Mehrwertsteuergesetz",
  "dbg": "Bundesgesetz über die direkte Bundessteuer",
  "ahvg": "Bundesgesetz über die Alters- und Hinterlassenenversicherung",
  "arbeitsgesetz": "Arbeitsgesetz",
  "mietrecht": "Obligationenrecht",
  "arbeitsrecht": "Obligationenrecht",
  "arbeitsvertrag": "Obligationenrecht",
  "kaufvertrag": "Obligationenrecht",
  "scheidung": "Zivilgesetzbuch",
  "erbrecht": "Zivilgesetzbuch",
  "familienrecht": "Zivilgesetzbuch",
};

async function searchFedlex(query: string, reformulated?: ReformulatedQuery | null): Promise<SearchResult[]> {
  const keywords = reformulated?.fedlex_keywords?.length ? reformulated.fedlex_keywords.flatMap(k => k.split(/\s+/)) : extractKeywords(query);
  console.log(`FEDLEX: keywords=${JSON.stringify(keywords)} (llm: ${!!reformulated?.fedlex_keywords?.length})`);

  const results: SearchResult[] = [];

  // Try Firecrawl search for fedlex.data.admin.ch
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (firecrawlKey) {
    try {
      // Map known law abbreviations for better search
      const mappedTerms = keywords.map(k => CH_LAW_MAP[k.toLowerCase()] || k);
      const searchQuery = `site:fedlex.data.admin.ch ${mappedTerms.join(" ")}`;

      const resp = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: searchQuery,
          limit: 8,
          lang: "de",
          country: "ch",
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const items = data?.data || [];
        for (let i = 0; i < items.length && results.length < 8; i++) {
          const item = items[i];
          if (!item.url) continue;

          results.push({
            doc_ref: `FEDLEX-${i + 1}`,
            title: item.title || item.url,
            date: "",
            url: item.url,
            score: 0.85 - i * 0.05,
            highlights: keywords.slice(0, 3),
            provider: "FEDLEX",
            snippet: item.description || "",
          });
        }
        console.log(`FEDLEX Firecrawl: ${results.length} results`);
      }
    } catch (e) {
      console.error("FEDLEX Firecrawl error:", e);
    }
  }

  // Fallback: direct fedlex search URL
  if (results.length === 0) {
    const searchTerms = keywords.slice(0, 3).join("+");
    results.push({
      doc_ref: "FALLBACK-FEDLEX",
      title: `Schweizer Bundesrecht durchsuchen: "${keywords.slice(0, 3).join(" ")}"`,
      date: "",
      url: `https://www.fedlex.admin.ch/de/search#q=${encodeURIComponent(searchTerms)}`,
      score: 0.3,
      highlights: keywords.slice(0, 3),
      provider: "FEDLEX",
    });
  }

  return results;
}

// ============================================================
// Content Enrichment via Firecrawl
// Scrapes top results to extract actual legal text snippets
// ============================================================

async function enrichWithContent(
  output: { provider: string; results: SearchResult[]; latencyMs: number }[]
): Promise<{ provider: string; results: SearchResult[]; latencyMs: number }[]> {
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!firecrawlKey) return output;

  // Collect top results that need enrichment (score > 0.45, snippet < 200 chars, max 8)
  const toEnrich: { providerIdx: number; resultIdx: number; url: string }[] = [];
  for (let pi = 0; pi < output.length; pi++) {
    for (let ri = 0; ri < output[pi].results.length; ri++) {
      const r = output[pi].results[ri];
      if (
        r.score > 0.45 &&
        isEvidentiarySource(r) &&
        (!r.snippet || r.snippet.length < 200) &&  // Skip if already has decent snippet
        r.url &&
        !r.doc_ref?.startsWith("FALLBACK") &&
        toEnrich.length < 12
      ) {
        toEnrich.push({ providerIdx: pi, resultIdx: ri, url: r.url });
      }
    }
  }

  if (toEnrich.length === 0) return output;

  console.log(`Enriching ${toEnrich.length} results with content via Firecrawl`);
  const enrichStart = Date.now();

  // Run all scrapes in parallel (up to 8) with reduced timeout
  const allScrapeResults = await Promise.allSettled(
    toEnrich.map(async (item) => {
      const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: item.url,
          formats: ["markdown"],
          onlyMainContent: true,
          waitFor: 1000,
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) throw new Error(`Scrape failed: ${resp.status}`);
      return resp.json();
    })
  );

  for (let i = 0; i < toEnrich.length; i++) {
    const result = allScrapeResults[i];
    if (result.status !== "fulfilled") continue;

    const markdown = result.value?.data?.markdown || result.value?.markdown || "";
    // Validate enriched content — reject garbage
    if (markdown.length < 300) continue;
    if (/javascript|<script|cookie.*consent|localStorage|sessionStorage|google.*tag|gtm\.|Share\s+on\s+|Advertisement|Anzeige|Newsletter.*abonnieren/i.test(markdown)) {
      console.warn(`[enrich] Rejected garbage content for ${toEnrich[i].url}`);
      continue;
    }
    // Reject if mostly whitespace (bad PDF conversion)
    const whitespaceRatio = (markdown.match(/\s/g) || []).length / markdown.length;
    if (whitespaceRatio > 0.45) {
      console.warn(`[enrich] Rejected high-whitespace content (${(whitespaceRatio * 100).toFixed(0)}%) for ${toEnrich[i].url}`);
      continue;
    }
    // Reject if mostly links (navigation pages)
    const linkCount = (markdown.match(/\[.+?\]\(.+?\)/g) || []).length;
    const lineCount = markdown.split(/\n/).length;
    if (linkCount > 5 && linkCount > lineCount / 2) {
      console.warn(`[enrich] Rejected link-heavy content (${linkCount} links in ${lineCount} lines) for ${toEnrich[i].url}`);
      continue;
    }

    const { providerIdx, resultIdx } = toEnrich[i];
    const searchResult = output[providerIdx].results[resultIdx];
    const snippet = extractRelevantParagraphs(markdown, searchResult.highlights || [], searchResult.pinpoint);
    
    // Optimization #8: Only use enriched content if it's better than original
    const originalSnippet = output[providerIdx].results[resultIdx].snippet || "";
    if (snippet.length > originalSnippet.length) {
      output[providerIdx].results[resultIdx].snippet = snippet;
    }
  }

  console.log(`Content enrichment took ${Date.now() - enrichStart}ms (${toEnrich.length} URLs)`);
  return output;
}

/**
 * Extract only relevant legal paragraphs from scraped content.
 * Uses multi-signal scoring: legal markers, keyword density, 
 * RS-numbers, case references, and coherent paragraph grouping.
 * Max ~800 words per result.
 */
function extractRelevantParagraphs(
  markdown: string,
  highlights: string[],
  pinpoint?: string
): string {
  // Split into paragraphs (double newline or heading markers)
  const paragraphs = markdown.split(/\n{2,}|\n(?=#{1,3}\s)/);
  
  // Build search terms from highlights and pinpoint
  const searchTerms = [
    ...(highlights || []).filter(h => h.length > 2),
    pinpoint || "",
  ].filter(Boolean).map(t => t.toLowerCase());
  
  // Patterns for scoring
  const legalMarkers = /(?:^|\n)\s*(?:§\s*\d|Art\.?\s*\d|Abs\.?\s*\d|\(\d+\)|\d+\.\s+[A-ZÄÖÜ]|Rechtssatz|Leitsatz|Normen?:|Spruch:|Entscheidungsgründe|Begründung)/;
  const boilerplatePatterns = /^\s*(?:Impressum|Datenschutz|Cookie|Menü|Navigation|Suche|Anmelden|©|Alle Rechte|Kontakt|Seitenleiste|Inhaltsverzeichnis|Druckversion|Teilen|Startseite|Home|Login|Registrier|Newsletter|Abonnieren)/i;
  const techPatterns = /javascript|cookie|tracking|analytics|google\s*tag|gtm|localStorage|sessionStorage/i;
  
  // Score each paragraph by relevance
  const scored = paragraphs.map((p, idx) => {
    const pLower = p.toLowerCase();
    const pTrimmed = p.trim();
    let score = 0;
    
    // Hard reject boilerplate and tech noise
    if (boilerplatePatterns.test(pTrimmed)) return { text: pTrimmed, score: -100, idx };
    if (techPatterns.test(pTrimmed)) return { text: pTrimmed, score: -100, idx };
    if (pTrimmed.length < 20) return { text: pTrimmed, score: -5, idx };
    
    // Strong boost for legal structure markers
    if (legalMarkers.test(p)) score += 4;
    
    // Strong boost for Leitsatz/Rechtssatz sections (most valuable)
    if (/\b(?:Leitsatz|Rechtssatz|Kernsatz)\b/i.test(p)) score += 6;
    
    // Boost for matching search terms (scaled by density)
    let termMatches = 0;
    for (const term of searchTerms) {
      const matches = pLower.split(term).length - 1;
      if (matches > 0) {
        termMatches += matches;
        score += 2 * Math.min(matches, 3); // Cap at 3 matches per term
      }
    }
    
    // Boost for § references (density-based)
    const paraRefs = (p.match(/§\s*\d+[a-z]?/g) || []).length;
    score += Math.min(paraRefs * 1.5, 6);
    
    // Strong boost for RS-numbers (RIS-Justiz RS...)
    const rsMatches = (p.match(/RS\d{5,}/g) || []).length;
    score += rsMatches * 4;
    
    // Boost for case references (OGH, BGH, etc.)
    const caseRefs = (p.match(/(?:OGH|BGH|BVerfG|EuGH|BGer|OLG|LG|BG|VwGH|VfGH)\s/g) || []).length;
    score += caseRefs * 3;
    
    // Boost for Geschäftszahlen (e.g. 11 Os 2/22m, III ZR 123/23)
    const gzMatches = (p.match(/\d+\s*(?:Os|Ob|Ns|Bs|Bkd|Fsc)\s*\d+\/\d+[a-z]?/gi) || []).length;
    score += gzMatches * 3;
    const bghMatches = (p.match(/(?:I{1,3}V?|V|VI|VII|VIII|IX|X|XI|XII)\s*Z[RB]\s*\d+\/\d+/g) || []).length;
    score += bghMatches * 3;
    
    // Moderate boost for substantive legal content
    if (/\b(?:Tatbestand|Rechtsfolge|Anspruch|Vorsatz|Fahrlässigkeit|Kausalität|Rechtswidrigkeit|Schuld|Subsumtion)\b/i.test(p)) score += 2;
    
    // Penalize very short paragraphs (likely headings without content)
    if (pTrimmed.length < 50 && !legalMarkers.test(p)) score -= 1;
    
    // Penalize link-heavy content (navigation)
    const linkCount = (p.match(/\[.*?\]\(.*?\)/g) || []).length;
    if (linkCount > 3 && pTrimmed.length < 200) score -= 5;
    
    return { text: pTrimmed, score, idx };
  });
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  const MAX_WORDS = 800;
  let totalWords = 0;
  const selected: { text: string; idx: number }[] = [];
  
  for (const item of scored) {
    if (item.score <= 0) break;
    const words = item.text.split(/\s+/).length;
    if (totalWords + words > MAX_WORDS && selected.length > 0) {
      // If this paragraph is very high-value, truncate to fit
      if (item.score >= 6) {
        const remaining = MAX_WORDS - totalWords;
        if (remaining > 40) {
          const truncated = item.text.split(/\s+/).slice(0, remaining).join(" ") + " [...]";
          selected.push({ text: truncated, idx: item.idx });
          totalWords = MAX_WORDS;
        }
      }
      continue;
    }
    selected.push({ text: item.text, idx: item.idx });
    totalWords += words;
    if (totalWords >= MAX_WORDS) break;
  }
  
  // Re-sort by original position for coherent reading
  selected.sort((a, b) => a.idx - b.idx);
  
  if (selected.length === 0) {
    // Fallback: take first 150 words
    return markdown.split(/\s+/).slice(0, 150).join(" ");
  }
  
  return selected.map(s => s.text).join("\n\n");
}

// ============================================================
// PARLAMENT — Austrian Parliamentary Materials (parlament.gv.at/opendata)
// ============================================================

async function searchParlament(query: string, reformulated?: ReformulatedQuery | null): Promise<SearchResult[]> {
  const keywords = reformulated ? getEffectiveKeywords("PARLAMENT", query, reformulated) : extractCoreKeywords(query);
  const searchTerm = keywords.slice(0, 3).join(" ");
  
  if (!searchTerm || searchTerm.length < 2) return [];
  
  const results: SearchResult[] = [];
  
  try {
    // Search parliamentary materials via the parlament.gv.at search
    const searchUrl = `https://www.parlament.gv.at/recherchieren/suche?SUCH=${encodeURIComponent(searchTerm)}&json=TRUE&pageSize=10`;
    const resp = await fetchWithTimeout(searchUrl, 8000);
    
    if (resp.ok) {
      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("json")) {
        const data = await resp.json();
        const items = data?.rows || data?.results || data?.items || [];
        
        for (const item of items.slice(0, 8)) {
          const title = item.title || item.betreff || item.label || "Parlamentarisches Dokument";
          const docRef = item.nr || item.ident || item.id || "";
          const date = item.datum || item.date || "";
          const rawUrl = item.url || item.link || (item.path ? `https://www.parlament.gv.at${item.path}` : "");
          const url = sanitizeParlamentUrl(rawUrl, docRef ? `${docRef} ${title}` : title);

          results.push({
            doc_ref: `PARL-${docRef}`,
            title: title,
            date: date,
            url: url,
            score: 0.7,
            highlights: [title],
            provider: "PARLAMENT",
            snippet: item.kurzinformation || item.beschreibung || item.summary || "",
          });
        }
      }
    }
    
    // If JSON API didn't work, try Firecrawl-based search
    if (results.length === 0) {
      const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
      if (firecrawlKey) {
        const fcResp = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `site:parlament.gv.at ${searchTerm}`,
            limit: 5,
          }),
          signal: AbortSignal.timeout(8000),
        });
        
        if (fcResp.ok) {
          const fcData = await fcResp.json();
          const fcResults = fcData?.data || [];
          
          for (const item of fcResults.slice(0, 5)) {
            results.push({
              doc_ref: `PARL-FC-${results.length}`,
              title: item.title || "Parlamentsmaterial",
              date: "",
              url: sanitizeParlamentUrl(item.url, item.title || searchTerm),
              score: 0.40,  // Low score: Firecrawl fallback results are often irrelevant
              highlights: [item.description || ""],
              provider: "PARLAMENT",
              snippet: item.markdown?.slice(0, 500) || item.description || "",
            });
          }
        }
      }
    }
  } catch (e) {
    console.error("Parlament search error:", e);
  }
  
  return results;
}

// ============================================================
// Utilities
// ============================================================
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "LegalAI/1.0 (Research Tool)",
        "Accept": "text/html,application/json,application/xml;q=0.9",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(timer);
    return resp;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ============================================================
// Auto-cache retrieval results in vector DB (fire-and-forget)
// ============================================================

async function cacheResultsInVectorDB(
  providerResults: { provider: string; results: SearchResult[] }[],
  jurisdiction?: string[]
): Promise<void> {
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!serviceKey) return;

  const sb = createClient(supabaseUrl, serviceKey);

  // Collect top results with enough content to embed
  const toEmbed: { title: string; content: string; provider: string; url: string; jurisdiction: string; doc_ref: string; date: string }[] = [];

  for (const pr of providerResults) {
    for (const r of pr.results) {
      const text = r.snippet || r.highlights?.join(" ") || "";
      if (!isEvidentiarySource(r)) continue;
      if (text.length < 50) continue; // Skip results with too little content
      toEmbed.push({
        title: r.title || "",
        content: text,
        provider: pr.provider,
        url: r.url || "",
        jurisdiction: detectJurisdictionFromProvider(pr.provider, jurisdiction),
        doc_ref: r.doc_ref || "",
        date: r.date || "",
      });
    }
  }

  if (toEmbed.length === 0) return;

  // Limit to top 15 results to avoid excessive API calls
  const batch = toEmbed.slice(0, 15);
  const encoder = new TextEncoder();

  // Step 1: Compute all content hashes in parallel
  const hashPromises = batch.map(async (doc) => {
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(doc.content + doc.url));
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  });
  const contentHashes = await Promise.all(hashPromises);

  // Step 2: Batch dedup check — single DB query instead of 15
  const { data: existingDocs } = await sb
    .from("legal_documents")
    .select("content_hash")
    .in("content_hash", contentHashes);
  const existingSet = new Set(existingDocs?.map(e => e.content_hash) || []);

  // Filter to only new documents
  const newDocs = batch
    .map((doc, i) => ({ doc, contentHash: contentHashes[i] }))
    .filter(({ contentHash }) => !existingSet.has(contentHash));

  if (newDocs.length === 0) return;

  // Step 3: Generate embeddings in parallel (with fallback)
  const embeddingResults = await Promise.allSettled(
    newDocs.map(async ({ doc }) => {
      const input = `${doc.title}\n${doc.doc_ref}\n\n${doc.content}`.slice(0, 8000);
      const embResp = await openRouterEmbedding({
        input,
        dimensions: 768,
      });
      if (embResp.ok) {
        const data = await embResp.json();
        return data.data?.[0]?.embedding;
      }
      const errText = await embResp.text();
      console.error("[vector-cache] OpenRouter embedding failed:", embResp.status, errText);
      return null;
    })
  );

  // Step 4: Batch insert all successful embeddings
  const inserts = newDocs
    .map(({ doc, contentHash }, i) => {
      const result = embeddingResults[i];
      const embedding = result.status === "fulfilled" ? result.value : null;
      if (!embedding) return null;
      return {
        workspace_id: null,
        title: doc.title || "Untitled",
        content: doc.content,
        content_hash: contentHash,
        source_provider: doc.provider,
        source_url: doc.url || null,
        jurisdiction: doc.jurisdiction,
        doc_ref: doc.doc_ref || null,
        doc_date: doc.date || null,
        metadata: {},
        embedding: JSON.stringify(embedding),
        chunk_index: 0,
      };
    })
    .filter(Boolean);

  if (inserts.length > 0) {
    await sb.from("legal_documents").insert(inserts);
    console.log(`[vector-cache] Cached ${inserts.length}/${batch.length} results`);
  }
}

function detectJurisdictionFromProvider(provider: string, jurisdictions?: string[]): string {
  switch (provider.toUpperCase()) {
    case "RIS":
    case "FINDOK":
    case "PARLAMENT":
      return "AT";
    case "EURLEX":
    case "CURIA":
      return "EU";
    default:
      return jurisdictions?.[0] || "AT";
  }
}
