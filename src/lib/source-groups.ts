import type { RetrievalResult } from "@/lib/retrieval";

export interface SourceGroup {
  provider: string;
  results: RetrievalResult[];
  latencyMs?: number;
}

/**
 * Flatten provider groups, re-group by each result's own provider and
 * dedupe by provider+url+doc_ref+title. Shared by the sources sheet body
 * and its trigger so the count on the button always equals the number of
 * cards in the opened sheet.
 */
export function normalizeSourceGroups(groups: SourceGroup[]): SourceGroup[] {
  const byProvider = new Map<string, SourceGroup>();
  const seen = new Set<string>();

  for (const group of groups || []) {
    for (const result of group.results || []) {
      const provider = result.provider || group.provider;
      const dedupeKey = [
        provider,
        result.url || "",
        result.doc_ref || "",
        result.title || "",
      ].join("::").toLowerCase();

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const existing = byProvider.get(provider) || {
        provider,
        results: [],
        latencyMs: group.latencyMs,
      };
      existing.results.push(result);
      existing.latencyMs = Math.max(existing.latencyMs || 0, group.latencyMs || 0);
      byProvider.set(provider, existing);
    }
  }

  return Array.from(byProvider.values());
}

/** Total source count after normalization. */
export function countSourceResults(groups: SourceGroup[]): number {
  return normalizeSourceGroups(groups).reduce((sum, r) => sum + (r.results?.length ?? 0), 0);
}
