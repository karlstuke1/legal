import { makeCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { openRouterEmbedding } from "../_shared/openrouter.ts";

/**
 * semantic-search: Takes a query, generates an embedding, and performs
 * hybrid vector + full-text search against the legal_documents table.
 *
 * Input: {
 *   query: string;
 *   jurisdiction?: string;     // 'DE' | 'AT' | 'CH' | 'EU'
 *   provider?: string;         // filter by source_provider
 *   workspace_id?: string;     // include workspace-specific docs
 *   threshold?: number;        // similarity threshold (default 0.5)
 *   limit?: number;            // max results (default 10)
 * }
 *
 * Output: {
 *   results: Array<{
 *     id: string;
 *     title: string;
 *     content: string;
 *     source_provider: string;
 *     source_url: string;
 *     jurisdiction: string;
 *     doc_ref: string;
 *     doc_date: string;
 *     similarity: number;
 *     combined_score: number;
 *   }>;
 *   latency_ms: number;
 * }
 */

async function generateQueryEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await openRouterEmbedding({
      input: text.slice(0, 4000),
      dimensions: 768,
    });

    if (response.ok) {
      const data = await response.json();
      return data.data?.[0]?.embedding || null;
    }

    const errText = await response.text();
    console.error("[semantic-search] OpenRouter embedding generation failed:", response.status, errText);
    return null;
  } catch (e) {
    console.error("[semantic-search] Embedding error:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const start = Date.now();

    // Verify user
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { query, jurisdiction, provider, workspace_id, threshold = 0.45, limit = 10 } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ results: [], latency_ms: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate embedding for the query
    const queryEmbedding = await generateQueryEmbedding(query);

    // Use service role for DB queries
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let results: Record<string, unknown>[] = [];

    if (queryEmbedding) {
      // Vector + FTS hybrid search
      const { data, error: searchError } = await adminClient.rpc("match_legal_documents", {
        query_embedding: JSON.stringify(queryEmbedding),
        query_text: query,
        match_jurisdiction: jurisdiction || null,
        match_provider: provider || null,
        match_workspace_id: workspace_id || null,
        match_threshold: threshold,
        match_count: limit,
      });

      if (searchError) {
        console.error("[semantic-search] RPC error:", searchError);
      } else {
        results = data || [];
      }
    }

    // FTS-only fallback when embeddings fail or vector search returns nothing
    if (results.length === 0) {
      console.log("[semantic-search] Falling back to pure FTS search");
      let ftsQuery = adminClient
        .from("legal_documents")
        .select("id, title, content, source_provider, source_url, jurisdiction, doc_ref, doc_date, metadata")
        .textSearch("fts", query, { type: "plain", config: "german" })
        .limit(limit);

      if (jurisdiction) ftsQuery = ftsQuery.eq("jurisdiction", jurisdiction);
      if (provider) ftsQuery = ftsQuery.eq("source_provider", provider);

      const { data: ftsData, error: ftsError } = await ftsQuery;

      if (ftsError) {
        console.error("[semantic-search] FTS fallback error:", ftsError);
      } else {
        results = (ftsData || []).map((r: Record<string, unknown>, i: number) => ({
          ...r,
          similarity: 0,
          fts_rank: 1.0 - (i * 0.05),
          combined_score: 1.0 - (i * 0.05),
        }));
      }
    }

    const latencyMs = Date.now() - start;
    console.log(`[semantic-search] Found ${results?.length || 0} results in ${latencyMs}ms for: "${query.slice(0, 80)}"`);

    return new Response(JSON.stringify({
      results: (results || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        source_provider: r.source_provider,
        source_url: r.source_url,
        jurisdiction: r.jurisdiction,
        doc_ref: r.doc_ref,
        doc_date: r.doc_date,
        similarity: r.similarity,
        fts_rank: r.fts_rank,
        combined_score: r.combined_score,
      })),
      latency_ms: latencyMs,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[semantic-search] Error:", e);
    return new Response(JSON.stringify({ results: [], error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
