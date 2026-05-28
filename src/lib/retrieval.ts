// Retrieval service — calls the retrieval edge function for live legal source search
// + semantic vector search for indexed legal documents

import { invokeEdgeFunction } from "@/lib/edge-fetch";
import { resolveLegalAreaSources } from "@/lib/types";
import type { LegalArea, Jurisdiction } from "@/lib/types";

export interface RetrievalResult {
  doc_ref: string;
  title: string;
  date: string;
  url: string;
  score: number;
  highlights: string[];
  provider: string;
  pinpoint?: string;
  snippet?: string;
  // Server-side LLM relevance score (0..1) computed by retrieval/rerank.ts
  // after sub-query merge. When present, buildSourceContext folds it into
  // rankScore so the LLM-judged top-K wins over heuristic-only ranking.
  relevance?: number;
  evidence_status?: "verified_document" | "search_utility" | "fallback";
}

interface RouteConfig {
  jurisdiction: string[];
  sources: string[];
  autoRouter: boolean;
  legalArea?: LegalArea;
}

export function resolveProviders(config: RouteConfig, queryText?: string): string[] {
  // If a specific legalArea is set (not "allgemein"), use area-based routing
  if (config.legalArea && config.legalArea !== "allgemein") {
    const areaSources = resolveLegalAreaSources(config.legalArea, config.jurisdiction as Jurisdiction[]);
    if (areaSources.length > 0) return areaSources;
  }

  // Legacy fallback: manual source selection
  if (!config.autoRouter && config.sources.length > 0 && !config.sources.includes("AUTO")) {
    return config.sources;
  }

  // AT-only system
  const selected = new Set<string>();
  selected.add("RIS");
  selected.add("FINDOK");

  // PARLAMENT only for explicitly parliamentary queries
  if (queryText && /\b(regierungsvorlage|ausschuss|gesetzesvorlage|nationalrat|bundesrat|parlament|novelle|begutachtung|erläuterung|initiativantrag|ministerialentwurf)\b/i.test(queryText)) {
    selected.add("PARLAMENT");
  }

  return Array.from(selected);
}

/**
 * Semantic vector search against indexed legal documents.
 * Runs in parallel with live provider search for hybrid results.
 */
async function semanticSearch(
  query: string,
  jurisdiction?: string,
  workspaceId?: string
): Promise<{ provider: string; results: RetrievalResult[]; latencyMs: number }> {
  try {
    const data = await invokeEdgeFunction<{
      results?: Array<{
        doc_ref?: string;
        title?: string;
        doc_date?: string;
        source_url?: string;
        combined_score?: number;
        content?: string;
        source_provider?: string;
      }>;
      latency_ms?: number;
    }>("semantic-search", {
      query,
      jurisdiction: jurisdiction || null,
      workspace_id: workspaceId || null,
      threshold: 0.45,
      limit: 8,
    }, { timeoutMs: 15000 });

    if (!data?.results) {
      return { provider: "VECTOR", results: [], latencyMs: 0 };
    }

    const results: RetrievalResult[] = (data.results || []).map((r) => ({
      doc_ref: r.doc_ref || "",
      title: r.title || "",
      date: r.doc_date || "",
      url: r.source_url || "",
      score: r.combined_score || 0,
      highlights: [r.content?.slice(0, 300) || ""],
      provider: `VECTOR:${r.source_provider || "INDEX"}`,
      snippet: r.content?.slice(0, 500) || "",
      evidence_status: "verified_document",
    }));

    return {
      provider: "VECTOR",
      results,
      latencyMs: data.latency_ms || 0,
    };
  } catch (e) {
    console.warn("[semantic-search] Error:", e);
    return { provider: "VECTOR", results: [], latencyMs: 0 };
  }
}

export async function searchProviders(
  query: string,
  config: RouteConfig,
  workspaceId?: string
): Promise<{ provider: string; results: RetrievalResult[]; latencyMs: number }[]> {
  const providerNames = resolveProviders(config, query);

  // Run live retrieval and semantic search IN PARALLEL
  const [liveResults, vectorResults] = await Promise.all([
    // Live provider search
    (async () => {
      try {
        const data = await invokeEdgeFunction<{ provider: string; results: RetrievalResult[]; latencyMs: number }[]>(
          "retrieval",
          { query, providers: providerNames, jurisdiction: config.jurisdiction },
          { timeoutMs: 25000 }
        );
        return data || providerNames.map((name) => ({ provider: name, results: [] as RetrievalResult[], latencyMs: 0 }));
      } catch (e) {
        console.error("Retrieval fetch error:", e);
        return providerNames.map((name) => ({ provider: name, results: [] as RetrievalResult[], latencyMs: 0 }));
      }
    })(),

    // Semantic vector search (primary jurisdiction only)
    semanticSearch(query, config.jurisdiction[0], workspaceId),
  ]);

  // Merge: add vector results if they have matches, deduplicate by doc_ref
  const allResults = [...liveResults];

  if (vectorResults.results.length > 0) {
    // Deduplicate: remove vector results that already appear in live results
    const liveDocRefs = new Set(
      liveResults.flatMap(r => r.results.map(res => res.doc_ref?.toLowerCase()).filter(Boolean))
    );
    const uniqueVectorResults = vectorResults.results.filter(
      r => !r.doc_ref || !liveDocRefs.has(r.doc_ref.toLowerCase())
    );

    if (uniqueVectorResults.length > 0) {
      allResults.push({
        provider: "VECTOR",
        results: uniqueVectorResults,
        latencyMs: vectorResults.latencyMs,
      });
    }
  }

  return allResults;
}
