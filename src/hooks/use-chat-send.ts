import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/lib/supabase-safe";
import {
  createChat,
  insertMessage,
  updateChatTitle,
  updateChatFilters,
} from "@/lib/chat-api";
import { assignChatToMatter, fetchMatterFiles } from "@/lib/matters-api";
import { streamChat } from "@/lib/stream";
import { searchProviders, type RetrievalResult } from "@/lib/retrieval";
import { generateThinkingSteps, createThinkingController, isDraftIntent } from "@/lib/thinking";
import { analyzeCitations, type CitationAnalysis, type ExtractedCitation } from "@/lib/citation-engine";
import { applyCitationScrub } from "@/lib/scrub-citations";
import { renderSourceTokens, type SourceMapEntry } from "@/lib/render-source-tokens";
import { toast } from "@/hooks/use-toast";
import type { ChatFilters, ChatMessage } from "@/lib/types";
import type { ThinkingStep } from "@/components/ThinkingSteps";
import { detectDocumentContent, type DocumentDetection } from "@/lib/document-detector";

// Optimization #6: More precise regex anchored at text end, minimum 20 chars, only strip final disclaimer
const LEGAL_DISCLAIMER_REGEX = /\n\s*Hinweis:\s*Diese\s+(?:Analyse|Antwort|Information)\s+wurde\s+KI[-\s]?gestützt\s+erstellt\s+und\s+ersetzt\s+keine\s+individuelle\s+Rechtsberatung\.[^\n]{0,200}$/i;

function stripTrailingLegalDisclaimer(text: string): string {
  return text.replace(LEGAL_DISCLAIMER_REGEX, "").trimEnd();
}

/** Sliding window: keep last N message pairs + system context summary */
const MAX_CONTEXT_MESSAGES = 20; // ~10 user+assistant pairs
const MIN_THINKING_PHASE_MS = 1400;

/**
 * Build enriched search query for follow-up questions by extracting
 * key legal terms, norms, and topics from the conversation context.
 */
function buildFollowUpSearchQuery(currentQuery: string, previousMessages: ChatMessage[]): string {
  const normRegex = /§§?\s*\d+[a-z]?\s+[\wÄÖÜäöüß-]+/g;
  const rsRegex = /RS\d{5,}/g;
  const bgRegex = /\b\d+\s+(?:Os|Ob|Cg|Bs|Bgs|BlgNR)\s+\d+\/\d+[a-z]?\b/g;

  const extractedTerms = new Set<string>();

  // Extract from last 4 messages (2 pairs) for focus
  const recent = previousMessages.slice(-4);
  for (const msg of recent) {
    const text = msg.content?.text || "";
    // Extract legal norms (§ references)
    text.match(normRegex)?.forEach(m => extractedTerms.add(m.trim()));
    // Extract RS numbers
    text.match(rsRegex)?.forEach(m => extractedTerms.add(m));
    // Extract case numbers
    text.match(bgRegex)?.forEach(m => extractedTerms.add(m.trim()));
  }

  // Also extract the first user question's core topic
  const firstUserMsg = previousMessages.find(m => m.role === "user");
  if (firstUserMsg) {
    const firstText = firstUserMsg.content?.text || "";
    // Extract key legal nouns (long words that are likely legal terms)
    const legalNouns = firstText.match(/\b[A-ZÄÖÜ][a-zäöüß]{5,}\b/g);
    if (legalNouns) {
      legalNouns.slice(0, 3).forEach(n => extractedTerms.add(n));
    }
  }

  if (extractedTerms.size === 0) return currentQuery;

  // Combine: current query + extracted context terms
  const contextStr = Array.from(extractedTerms).slice(0, 8).join(" ");
  return `${currentQuery} ${contextStr}`;
}

/** LRU-capped cache for summaries — max 20 entries to prevent memory leaks */
const summaryCache = new Map<string, { messageCount: number; summary: string }>();
const SUMMARY_CACHE_MAX = 20;
function setSummaryCache(key: string, value: { messageCount: number; summary: string }) {
  if (summaryCache.size >= SUMMARY_CACHE_MAX) {
    const firstKey = summaryCache.keys().next().value;
    if (firstKey) summaryCache.delete(firstKey);
  }
  summaryCache.set(key, value);
}

/**
 * Rule-based fallback summary (used when LLM summary is unavailable or loading)
 */
function buildFallbackSummary(
  oldMessages: { role: string; content: string }[]
): string {
  const summaryParts: string[] = [];
  const extractedNorms = new Set<string>();

  for (const m of oldMessages) {
    if (m.role === "user") {
      const short = m.content.length > 100 ? m.content.slice(0, 100) + "…" : m.content;
      summaryParts.push(`- Nutzer: ${short}`);
    } else if (m.role === "assistant") {
      const short = m.content.length > 150 ? m.content.slice(0, 150) + "…" : m.content;
      summaryParts.push(`- Assistent: ${short}`);
      m.content.match(/RS\d{5,}/g)?.forEach(r => extractedNorms.add(r));
      m.content.match(/§§?\s*\d+[a-z]?\s+[\wÄÖÜäöüß-]+/g)?.slice(0, 5).forEach(p => extractedNorms.add(p.trim()));
    }
  }

  let content = `[Kontext aus früheren Nachrichten — ${oldMessages.length} Nachrichten zusammengefasst]\n${summaryParts.slice(-8).join("\n")}`;
  if (extractedNorms.size > 0) {
    content += `\n\n[Bereits referenzierte Normen: ${Array.from(extractedNorms).slice(0, 15).join(", ")}]`;
  }
  return content;
}

/**
 * Request an LLM-generated summary of old messages via the context-summary edge function.
 * Falls back to rule-based summary on error.
 */
async function requestLLMSummary(
  oldMessages: { role: string; content: string }[],
  chatId?: string
): Promise<string> {
  // Optimization #7: Only cache with a real chatId, avoid cross-chat pollution
  const cacheKey = chatId || null;
  if (cacheKey) {
    const cached = summaryCache.get(cacheKey);
    if (cached && cached.messageCount === oldMessages.length) {
      return cached.summary;
    }
  }

  try {
    const { data, error } = await supabase.functions.invoke("context-summary", {
      body: { messages: oldMessages },
    });

    if (error || !data?.summary) {
      console.warn("[context-summary] LLM summary unavailable, using fallback:", error);
      return buildFallbackSummary(oldMessages);
    }

    if (cacheKey) {
      setSummaryCache(cacheKey, { messageCount: oldMessages.length, summary: data.summary });
    }
    return data.summary;
  } catch (e) {
    console.warn("[context-summary] LLM summary failed, using fallback:", e);
    return buildFallbackSummary(oldMessages);
  }
}

/**
 * Truncate messages with LLM-based or rule-based summary for old context.
 * Returns immediately with rule-based fallback; LLM summary is used if cached.
 */
function truncateMessages(
  messages: { role: string; content: string }[],
  llmSummary?: string
): { role: string; content: string }[] {
  if (messages.length <= MAX_CONTEXT_MESSAGES) return messages;

  const oldMessages = messages.slice(0, -MAX_CONTEXT_MESSAGES);
  const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);

  // Use LLM summary if available, otherwise fall back to rule-based
  const summaryContent = llmSummary || buildFallbackSummary(oldMessages);

  return [
    { role: "system", content: summaryContent },
    ...recentMessages,
  ];
}

/** Map provider name to jurisdiction — AT only */
function providerToJurisdiction(provider: string): string {
  const prov = (provider || "").toUpperCase().replace(/^VECTOR:/, "");
  if (["RIS", "FINDOK", "PARLAMENT"].includes(prov)) return "AT";
  // All other providers are irrelevant for AT-only system
  return "";
}

interface ChatSourceItem {
  provider?: string;
  title?: string;
  url?: string;
  doc_ref?: string;
  date?: string;
  pinpoint?: string;
  snippet?: string;
  score?: number;
  relevance?: number;
  evidence_status?: "verified_document" | "search_utility" | "fallback";
}

function isEvidentiaryRetrievalResult(r: RetrievalResult): boolean {
  if (r.evidence_status === "fallback" || r.evidence_status === "search_utility") return false;
  const provider = (r.provider || "").toUpperCase();
  if (provider.startsWith("RIS")) return r.evidence_status === "verified_document";
  return true;
}

/** Build concise source context string for the AI from retrieval results */
function buildSourceContext(
  results: { provider: string; results: RetrievalResult[]; latencyMs?: number }[],
  queryComplexity: "simple" | "medium" | "complex" = "medium",
  activeJurisdictionFilter?: string[]
): string {
  const allResults = results.flatMap(r => r.results);
  if (allResults.length === 0) return "";

  // Optimization #1: Raise score threshold from 0.4 to 0.55 to exclude noisy low-quality sources
  let realResults = allResults.filter(r => r.score > 0.55 && !r.doc_ref?.startsWith("FALLBACK") && isEvidentiaryRetrievalResult(r));
  if (realResults.length === 0) {
    // Fallback: if strict filter yields nothing, relax slightly to 0.45
    realResults = allResults.filter(r => r.score > 0.45 && !r.doc_ref?.startsWith("FALLBACK") && isEvidentiaryRetrievalResult(r));
  }
  if (realResults.length === 0) return "";

  // Optimization #1b: Exclude metadata-only sources (snippet < 100 chars)
  const withContent = realResults.filter(r => (r.snippet?.length || 0) >= 100 || (r.evidence_status === "verified_document" && r.score >= 0.95));
  if (withContent.length > 0) {
    realResults = withContent;
  }

  // JURISDICTION HARD FILTER: When a single jurisdiction is active, remove sources
  // from other jurisdictions entirely (not just deprioritize them).
  // This prevents e.g. Munich court decisions from appearing in AT-only queries.
  if (activeJurisdictionFilter && activeJurisdictionFilter.length === 1) {
    const activeJ = activeJurisdictionFilter[0];
    realResults = realResults.filter(r => {
      const srcJ = providerToJurisdiction(r.provider);
      // Keep if: same jurisdiction, unknown jurisdiction (VECTOR/UPLOAD), or EU (always relevant)
      return !srcJ || srcJ === activeJ || srcJ === "EU";
    });
    if (realResults.length === 0) return "";
  }

  // Deduplication
  const seen = new Map<string, RetrievalResult>();
  for (const r of realResults) {
    const urlKey = r.url?.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase() || "";
    const titleKey = r.title?.toLowerCase().replace(/[^a-zäöüß0-9]/g, "").slice(0, 60) || "";
    const key = urlKey || titleKey;
    if (key && seen.has(key)) {
      const existing = seen.get(key)!;
      if ((r.snippet?.length || 0) > (existing.snippet?.length || 0)) seen.set(key, r);
    } else if (key) {
      seen.set(key, r);
    } else {
      seen.set(`unknown-${seen.size}`, r);
    }
  }
  const deduped = Array.from(seen.values());

  // Global ranking. The heuristic boosts (RS-Nummer, Leitsatz, OGH-prefix,
  // snippet length) reward documents that LOOK lawyerly. The new
  // `relevance` field — a server-side LLM relevance score (0..1) — is
  // weighted heaviest because it knows whether the document actually
  // answers THIS question, not just whether it has the right shape.
  const ranked = deduped.map(r => {
    let rankScore = r.score;
    if (typeof r.relevance === "number") rankScore += r.relevance * 1.5;
    const snippet = r.snippet || "";
    if (snippet.length > 200) rankScore += 0.3;
    if (snippet.length > 500) rankScore += 0.2;
    if (/RS\d{5,}/.test(snippet)) rankScore += 0.4;
    if (/(?:OGH|VfGH|VwGH|BVwG)\s/.test(snippet)) rankScore += 0.2;
    if (/§\s*\d+/.test(snippet)) rankScore += 0.15;
    if (/\b(?:Leitsatz|Rechtssatz)\b/i.test(snippet)) rankScore += 0.5;
    return { ...r, rankScore };
  });

  // Jurisdiction boost for multi-jurisdiction queries
  if (!activeJurisdictionFilter || activeJurisdictionFilter.length > 1) {
    for (const r of ranked) {
      const provJ = providerToJurisdiction(r.provider);
      if (provJ && activeJurisdictionFilter?.includes(provJ)) {
        r.rankScore += 0.5;
      }
    }
  }
  ranked.sort((a, b) => b.rankScore - a.rankScore);

  // Dynamic token budget based on query complexity
  // Optimization #1c: Reduce max sources to reduce noise (was 16/12, now 8/6)
  const MAX_WORDS = queryComplexity === "complex" ? 4000 : queryComplexity === "medium" ? 3000 : 2000;
  const MAX_SOURCES = queryComplexity === "complex" ? 8 : 6;

  const lines = ["Die folgenden Quellen wurden aus Rechtsdatenbanken abgerufen:\n"];
  let totalWords = 0;

  const getMaxWordsForSource = (r: typeof ranked[0]): number => {
    const snippet = r.snippet || "";
    if (/RS\d{5,}/.test(snippet) || /\b(?:Leitsatz|Rechtssatz)\b/i.test(snippet)) return 500;
    if (/(?:OGH|BGH|EuGH|BGer)\s/.test(snippet)) return 400;
    if (/§\s*\d+/.test(snippet)) return 300;
    return 200;
  };

  for (const r of ranked.slice(0, MAX_SOURCES)) {
    const parts = [`[${r.provider}] ${r.title}`];
    if (r.doc_ref) parts.push(`Ref: ${r.doc_ref}`);
    if (r.date) parts.push(`Datum: ${r.date}`);
    if (r.pinpoint) parts.push(`Fundstelle: ${r.pinpoint}`);
    if (r.url) parts.push(`URL: ${r.url}`);

    if (r.snippet && r.snippet.length > 100) {
      let compressed = r.snippet
        .replace(/^#{1,4}\s+/gm, "")
        .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

      const maxForThisSource = getMaxWordsForSource(r);
      const snippetWords = compressed.split(/\s+/).length;
      const effectiveWords = Math.min(snippetWords, maxForThisSource);

      if (totalWords + effectiveWords <= MAX_WORDS) {
        const text = snippetWords > maxForThisSource
          ? compressed.split(/\s+/).slice(0, maxForThisSource).join(" ") + " [...]"
          : compressed;
        parts.push(`\nINHALT:\n${text}`);
        totalWords += effectiveWords;
      } else {
        const remaining = MAX_WORDS - totalWords;
        if (remaining > 40) {
          const truncated = compressed.split(/\s+/).slice(0, remaining).join(" ");
          parts.push(`\nINHALT (gekürzt):\n${truncated}...`);
          totalWords = MAX_WORDS;
        }
      }
    } else if (r.snippet) {
      parts.push(`Auszug: ${r.snippet.slice(0, 200)}`);
    }

    lines.push(`- ${parts.join(" | ")}`);
  }

  return lines.join("\n");
}

/** Structured source payload for server-side numbered source maps. */
function buildSourceItems(
  results: { provider: string; results: RetrievalResult[]; latencyMs?: number }[],
  queryComplexity: "simple" | "medium" | "complex" = "medium",
  activeJurisdictionFilter?: string[]
): ChatSourceItem[] {
  const allResults = results.flatMap(r => r.results);
  if (allResults.length === 0) return [];

  let realResults = allResults.filter(r => r.score > 0.55 && !r.doc_ref?.startsWith("FALLBACK") && isEvidentiaryRetrievalResult(r));
  if (realResults.length === 0) {
    realResults = allResults.filter(r => r.score > 0.45 && !r.doc_ref?.startsWith("FALLBACK") && isEvidentiaryRetrievalResult(r));
  }
  if (realResults.length === 0) return [];

  const withContent = realResults.filter(r => (r.snippet?.length || 0) >= 100 || (r.evidence_status === "verified_document" && r.score >= 0.95));
  if (withContent.length > 0) realResults = withContent;

  if (activeJurisdictionFilter && activeJurisdictionFilter.length === 1) {
    const activeJ = activeJurisdictionFilter[0];
    realResults = realResults.filter(r => {
      const srcJ = providerToJurisdiction(r.provider);
      return !srcJ || srcJ === activeJ || srcJ === "EU";
    });
    if (realResults.length === 0) return [];
  }

  const seen = new Map<string, RetrievalResult>();
  for (const r of realResults) {
    const urlKey = r.url?.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase() || "";
    const titleKey = r.title?.toLowerCase().replace(/[^a-zäöüß0-9]/g, "").slice(0, 60) || "";
    const key = urlKey || titleKey || `unknown-${seen.size}`;
    const existing = seen.get(key);
    if (!existing || (r.snippet?.length || 0) > (existing.snippet?.length || 0)) {
      seen.set(key, r);
    }
  }

  const ranked = Array.from(seen.values()).map(r => {
    let rankScore = r.score;
    if (typeof r.relevance === "number") rankScore += r.relevance * 1.5;
    const snippet = r.snippet || "";
    if (snippet.length > 200) rankScore += 0.3;
    if (snippet.length > 500) rankScore += 0.2;
    if (/RS\d{5,}/.test(snippet)) rankScore += 0.4;
    if (/(?:OGH|VfGH|VwGH|BVwG)\s/.test(snippet)) rankScore += 0.2;
    if (/§\s*\d+/.test(snippet)) rankScore += 0.15;
    if (/\b(?:Leitsatz|Rechtssatz)\b/i.test(snippet)) rankScore += 0.5;
    return { ...r, rankScore };
  }).sort((a, b) => b.rankScore - a.rankScore);

  const MAX_SOURCES = queryComplexity === "complex" ? 8 : 6;
  return ranked.slice(0, MAX_SOURCES).map(r => ({
    provider: r.provider,
    title: r.title || "",
    url: r.url || "",
    doc_ref: r.doc_ref || "",
    date: r.date || "",
    pinpoint: r.pinpoint || "",
    snippet: (r.snippet || "").slice(0, 1600),
    score: r.score,
    relevance: r.relevance,
    evidence_status: r.evidence_status || "verified_document",
  }));
}

/** Assess query complexity for dynamic token budgets */
function assessQueryComplexity(text: string, jurisdiction: string[]): "simple" | "medium" | "complex" {
  const isMultiJurisdiction = jurisdiction.length > 1;
  const hasLegalKeywords = /\b(tatbestand|anspruch|haftung|subsumtion|gutachten|prüfung|voraussetzung|rechtsfolge)\b/i.test(text);
  const isLong = text.length > 200;
  const hasMultipleQuestions = (text.match(/\?/g) || []).length > 1;

  if (isMultiJurisdiction && (hasLegalKeywords || isLong)) return "complex";
  if (hasLegalKeywords || isLong || hasMultipleQuestions) return "medium";
  return "simple";
}

export interface QuotaExceeded {
  type: "queries" | "uploads" | "pseudonymizations";
  message: string;
}

export interface UseChatSendResult {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  streamingContent: string;
  isStreaming: boolean;
  thinkingSteps: ThinkingStep[];
  isThinking: boolean;
  sourceResults: { provider: string; results: RetrievalResult[]; latencyMs?: number }[];
  setSourceResults: React.Dispatch<React.SetStateAction<{ provider: string; results: RetrievalResult[]; latencyMs?: number }[]>>;
  sourceResultsMap: Record<string, { provider: string; results: RetrievalResult[] }[]>;
  isSearchingSources: boolean;
  citationAnalysisMap: Record<string, CitationAnalysis>;
  documentDetectionMap: Record<string, DocumentDetection>;
  activeChatId: string | null;
  setActiveChatId: (chatId: string | null) => void;
  justCreatedRef: React.MutableRefObject<string | null>;
  quotaExceeded: QuotaExceeded | null;
  setQuotaExceeded: React.Dispatch<React.SetStateAction<QuotaExceeded | null>>;
  handleSend: (text: string, fileIds: string[]) => Promise<void>;
  handleStop: () => void;
  resetState: () => void;
}

export function useChatSend(
  filters: ChatFilters,
  currentMatterId: string | null,
  privacyNoStore: boolean,
): UseChatSendResult {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const thinkingCleanupRef = useRef<(() => void) | null>(null);

  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  const [sourceResults, setSourceResults] = useState<
    { provider: string; results: RetrievalResult[]; latencyMs?: number }[]
  >([]);
  const [sourceResultsMap, setSourceResultsMap] = useState<
    Record<string, { provider: string; results: RetrievalResult[] }[]>
  >({});
  const [isSearchingSources, setIsSearchingSources] = useState(false);
  const [citationAnalysisMap, setCitationAnalysisMap] = useState<Record<string, CitationAnalysis>>({});
  const [documentDetectionMap, setDocumentDetectionMap] = useState<Record<string, DocumentDetection>>({});
  const [quotaExceeded, setQuotaExceeded] = useState<QuotaExceeded | null>(null);

  const justCreatedRef = useRef<string | null>(null);

  const resetState = useCallback(() => {
    setSourceResults([]);
    setSourceResultsMap({});
    setCitationAnalysisMap({});
    setDocumentDetectionMap({});
    setThinkingSteps([]);
    setIsThinking(false);
    setStreamingContent("");
    setIsStreaming(false);
    // ⚠️ Important: also drop the in-flight retrieval indicator. Without
    // this, switching chats during a search left the right SourcesPanel
    // permanently stuck on the loading spinner because the previous
    // chat's retrieval was still resolving in the background.
    setIsSearchingSources(false);
    setQuotaExceeded(null);
  }, []);

  // Mirror activeChatId in a ref so the async send/retrieval flow can
  // check synchronously whether the user has switched chats since the
  // request started. If they have, results from the now-stale request
  // should NOT pollute the now-active chat's right-panel state.
  const activeChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const selectActiveChat = useCallback((chatId: string | null) => {
    activeChatIdRef.current = chatId;
    setActiveChatId(chatId);
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    thinkingCleanupRef.current?.();

    // Partial response recovery: save what we have so far
    setStreamingContent(prev => {
      if (prev && prev.trim().length > 20) {
        const partialMsg: ChatMessage = {
          id: crypto.randomUUID(),
          chat_id: activeChatId || "",
          role: "assistant",
          content: { text: prev + "\n\n⚠️ *Antwort abgebrochen*" },
          created_at: new Date().toISOString(),
        } as ChatMessage;
        setMessages(msgs => [...msgs, partialMsg]);
      }
      return "";
    });

    setIsStreaming(false);
    setIsThinking(false);
    setThinkingSteps(prev => prev.map(s => ({ ...s, status: "done" as const })));
  }, [activeChatId]);

  const handleSend = useCallback(
    async (text: string, fileIds: string[]) => {
      if (!user || !activeWorkspace) return;

      // Hard quota check: block if query limit is 100% reached
      try {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const monthStart = startOfMonth.toISOString();

        const [planRes, queriesRes] = await Promise.all([
          supabase
            .from("plans")
            .select("monthly_queries_limit")
            .eq("workspace_id", activeWorkspace.id)
            .single(),
          supabase
            .from("usage_ledger")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", activeWorkspace.id)
            .gte("created_at", monthStart),
        ]);

        const limit = (planRes.data as any)?.monthly_queries_limit || 25;
        const used = queriesRes.count || 0;

        if (limit < 999999 && used >= limit) {
          setQuotaExceeded({
            type: "queries",
            message: `${used}/${limit}`,
          });
          return;
        }
      } catch (e) {
        console.warn("[quota-check] Failed, proceeding:", e);
      }

      let currentChatId = activeChatId;

      if (!currentChatId) {
        const chat = await createChat(activeWorkspace.id, user.id, filters);
        if (!chat) {
          toast({ title: "Fehler", description: "Chat konnte nicht erstellt werden.", variant: "destructive" });
          return;
        }
        currentChatId = chat.id;
        selectActiveChat(currentChatId);
        justCreatedRef.current = currentChatId;
        navigate({ pathname: `/app/chat/${currentChatId}`, search: location.search }, { replace: true });

        if (currentMatterId) {
          await assignChatToMatter(currentChatId, currentMatterId);
        }
      }

      // ============================================================
      // Document Grounding: Load extracted text for uploaded files
      // ============================================================
      let documentContext = "";
      if (fileIds.length > 0) {
        try {
          const { data: docChunks } = await supabase
            .from("legal_documents")
            .select("title, content, chunk_index, metadata")
            .eq("source_provider", "UPLOAD")
            .in("metadata->>file_id", fileIds)
            .order("title")
            .order("chunk_index", { ascending: true })
            .limit(100);

          if (docChunks && docChunks.length > 0) {
            // Group by file
            const byFile = new Map<string, { title: string; chunks: string[] }>();
            for (const chunk of docChunks) {
              const fileId = (chunk.metadata as any)?.file_id || "unknown";
              if (!byFile.has(fileId)) {
                byFile.set(fileId, { title: chunk.title, chunks: [] });
              }
              byFile.get(fileId)!.chunks.push(chunk.content);
            }

            const parts: string[] = [];
            for (const [, file] of byFile) {
              const fullText = file.chunks.join("\n\n");
              // Truncate per file to keep context manageable
              const truncated = fullText.length > 15000
                ? fullText.slice(0, 15000) + "\n\n[... Dokument gekürzt ...]"
                : fullText;
              parts.push(`=== DOKUMENT: ${file.title} ===\n\n${truncated}`);
            }
            documentContext = parts.join("\n\n---\n\n");
            console.log(`[doc-grounding] Loaded ${docChunks.length} chunks from ${byFile.size} files (${documentContext.length} chars)`);
          }
        } catch (e) {
          console.warn("[doc-grounding] Failed to load document context:", e);
        }
      }

      // Also load documents already attached to this chat
      if (!documentContext && currentChatId) {
        try {
          const { data: chatFiles } = await supabase
            .from("files")
            .select("id")
            .eq("chat_id", currentChatId)
            .limit(20);

          if (chatFiles && chatFiles.length > 0) {
            const chatFileIds = chatFiles.map((f: any) => f.id);
            const { data: docChunks } = await supabase
              .from("legal_documents")
              .select("title, content, chunk_index, metadata")
              .eq("source_provider", "UPLOAD")
              .in("metadata->>file_id", chatFileIds)
              .order("title")
              .order("chunk_index", { ascending: true })
              .limit(100);

            if (docChunks && docChunks.length > 0) {
              const byFile = new Map<string, { title: string; chunks: string[] }>();
              for (const chunk of docChunks) {
                const fileId = (chunk.metadata as any)?.file_id || "unknown";
                if (!byFile.has(fileId)) {
                  byFile.set(fileId, { title: chunk.title, chunks: [] });
                }
                byFile.get(fileId)!.chunks.push(chunk.content);
              }

              const parts: string[] = [];
              for (const [, file] of byFile) {
                const fullText = file.chunks.join("\n\n");
                const truncated = fullText.length > 15000
                  ? fullText.slice(0, 15000) + "\n\n[... Dokument gekürzt ...]"
                  : fullText;
                parts.push(`=== DOKUMENT: ${file.title} ===\n\n${truncated}`);
              }
              documentContext = parts.join("\n\n---\n\n");
              console.log(`[doc-grounding] Loaded ${docChunks.length} chunks from chat files (${documentContext.length} chars)`);
            }
          }
        } catch (e) {
          console.warn("[doc-grounding] Failed to load chat file context:", e);
        }
      }

      const msgContent = fileIds.length > 0 ? text + `\n\n[${fileIds.length} Datei(en) angehängt]` : text;
      let userMsg: ChatMessage;
      if (privacyNoStore) {
        userMsg = {
          id: crypto.randomUUID(),
          chat_id: currentChatId,
          role: "user",
          content: { text: msgContent },
          created_at: new Date().toISOString(),
        } as ChatMessage;
        setMessages(prev => [...prev, userMsg]);
      } else {
        const persisted = await insertMessage(currentChatId, "user", msgContent);
        if (!persisted) return;
        userMsg = persisted;
        setMessages(prev => [...prev, userMsg]);
      }

      const isFollowUp = messages.length > 0;
      const detectedDraft = isDraftIntent(text);
      const effectiveFilters = detectedDraft && filters.mode !== "draft"
        ? { ...filters, mode: "draft" as const }
        : filters;
      const steps = generateThinkingSteps(text, effectiveFilters, isFollowUp);
      setThinkingSteps(steps);
      setIsThinking(true);
      const thinkingCtrl = createThinkingController(steps, setThinkingSteps);
      thinkingCleanupRef.current = () => thinkingCtrl.cleanup();

      const isExamMode = filters.mode === "exam";
      const isDraftMode = detectedDraft || filters.mode === "draft";

      // Animate thinking steps in background
      const animateStepsInBackground = async () => {
        const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
        if (isExamMode) {
          const examSteps = ["assess", "topic", "generate"];
          for (const id of examSteps) {
            if (!steps.find(s => s.id === id)) continue;
            thinkingCtrl.advanceStep(id, "active");
            await wait(400 + Math.random() * 300);
            thinkingCtrl.advanceStep(id, "done");
          }
        } else if (isDraftMode) {
          const draftSteps = ["assess", "check-context", "clarify"];
          for (const id of draftSteps) {
            if (!steps.find(s => s.id === id)) continue;
            thinkingCtrl.advanceStep(id, "active");
            await wait(400 + Math.random() * 300);
            thinkingCtrl.advanceStep(id, "done");
          }
        } else {
          const quickSteps = ["assess", "jurisdiction", "review-file", "terms"];
          for (const id of quickSteps) {
            if (!steps.find(s => s.id === id)) continue;
            thinkingCtrl.advanceStep(id, "active");
            await wait(300 + Math.random() * 200);
            thinkingCtrl.advanceStep(id, "done");
          }
          thinkingCtrl.advanceStep("search-sources", "active");
        }
      };

      const animationPromise = animateStepsInBackground();

      // Follow-up retrieval enhancement: enrich query with conversation context
      // Extract key legal terms and topics from previous messages for better search
      const legalKeywordsRe = /\b(tatbestand|anspruch|haftung|schadenersatz|kündigung|vertrag|klage|betrug|diebstahl|körperverletzung|mord|totschlag|nötigung|erpressung|untreue|insolvenz|vollstreckung|berufung|revision|verjährung|gewährleistung|mangel|rücktritt|anfechtung|widerruf|voraussetzung|rechtsfolge|subsumtion|gutachten|prüfung|delik|straftat|ordnungswidrigkeit|verwaltungsrecht|arbeitsrecht|mietrecht|familienrecht|erbrecht|gesellschaftsrecht|handelsrecht|steuerrecht|sozialrecht|verfassungsrecht|fahrlässigkeit|vorsatz|schuld|rechtswidrigkeit|kausalität|zurechnung|beweislast|frist|rechtsmittel|beschwerde)\b|§|Art\./i;
      const isSimpleFollowUp = isFollowUp && text.length < 50 && !legalKeywordsRe.test(text) && !text.includes("?");

      // Build enriched search query for follow-ups
      let searchQuery = text;
      if (isFollowUp && !isSimpleFollowUp) {
        const contextTerms = buildFollowUpSearchQuery(text, messages);
        if (contextTerms) {
          searchQuery = contextTerms;
          console.log(`[retrieval] Enriched follow-up query: "${searchQuery}"`);
        }
      }

      let retrievalResults: { provider: string; results: RetrievalResult[]; latencyMs?: number }[] = [];
      if (!isExamMode && !isDraftMode && !isSimpleFollowUp) {
        setIsSearchingSources(true);
        try {
          retrievalResults = await searchProviders(searchQuery, {
            jurisdiction: filters.jurisdiction,
            sources: filters.sources,
            autoRouter: filters.autoRouter,
            legalArea: filters.legalArea,
          }, activeWorkspace?.id);
          // Apply to the right-panel ONLY if the user is still viewing
          // the chat this search was started for. Otherwise the results
          // belong to a chat the user navigated away from and would
          // pollute the panel of the chat they're now reading.
          if (activeChatIdRef.current === currentChatId) {
            setSourceResults(retrievalResults);
          }
        } catch (e) {
          console.error("Retrieval failed:", e);
        } finally {
          // The loading indicator must clear regardless of which chat
          // the user is on now — this is the request's own bookkeeping.
          if (activeChatIdRef.current === currentChatId) {
            setIsSearchingSources(false);
          }
        }
      }

      await animationPromise;

      if (!isExamMode && !isDraftMode) {
        const postSteps = ["search-sources", "extract-content", "cross-reference", "subsumption", "evaluate"];
        for (const id of postSteps) {
          if (!steps.find(s => s.id === id)) continue;
          thinkingCtrl.advanceStep(id, "done");
        }
      }

      // Build source context + structured source payload with dynamic budget
      // (empty for exam/draft). The server uses sourceItems as the canonical
      // source map; sourceContext is kept temporarily for legacy verification.
      const queryComplexity = assessQueryComplexity(text, filters.jurisdiction);
      let sourceContext = (isExamMode || isDraftMode) ? "" : buildSourceContext(retrievalResults, queryComplexity, filters.jurisdiction);
      const sourceItems = (isExamMode || isDraftMode) ? [] : buildSourceItems(retrievalResults, queryComplexity, filters.jurisdiction);
      thinkingCtrl.advanceStep("prepare", "active");

      setIsStreaming(true);
      setStreamingContent("");
      let fullResponse = "";
      let thinkingDone = false;
      const thinkingStartedAt = Date.now();
      let responseRevealScheduled: ReturnType<typeof setTimeout> | null = null;
      let responseVisible = false;

      const revealResponsePhase = () => {
        if (responseVisible) return;
        responseVisible = true;
        if (!thinkingDone) {
          thinkingDone = true;
          thinkingCtrl.completeAll();
          setIsThinking(false);
        }
        // Optimization #6: Don't strip disclaimer during reveal — only in onDone
        setStreamingContent(fullResponse);
      };

      const clearRevealTimer = () => {
        if (!responseRevealScheduled) return;
        clearTimeout(responseRevealScheduled);
        responseRevealScheduled = null;
      };

      const controller = new AbortController();
      abortRef.current = controller;

      // Context window management: truncate old messages with LLM summary
      const rawApiMessages = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content.text,
      }));

      // Request LLM summary for old messages (async, with fallback)
      let llmSummary: string | undefined;
      if (rawApiMessages.length > MAX_CONTEXT_MESSAGES) {
        const oldMessages = rawApiMessages.slice(0, -MAX_CONTEXT_MESSAGES);
        llmSummary = await requestLLMSummary(oldMessages, currentChatId || undefined);
      }
      const apiMessages = truncateMessages(rawApiMessages, llmSummary);

      // Build vault context for vault mode
      let vaultContext: string | undefined;
      if (filters.mode === "vault" && currentMatterId && activeWorkspace) {
        try {
          const matterFiles = await fetchMatterFiles(currentMatterId, activeWorkspace.id);
          if (matterFiles.length > 0) {
            vaultContext = matterFiles.map(f => `- ${f.name} (${f.mime}, ${(f.size / 1024).toFixed(1)} KB)`).join("\n");
          }
        } catch (e) {
          console.error("Failed to load matter files for vault context:", e);
        }
      }

      // =================================================================
      // Stream AI response with autonomous tool calling (server-side)
      // The AI agent decides which tools to use via native function calling
      // =================================================================
      const toolFoundSources: any[] = [];
      // Numbered source map sent by the server (Harvey-style citation
      // architecture). The chat function emits this as an SSE event
      // BEFORE any text content, so it's populated by the time the
      // stream finishes and onDone runs the scrub/render pipeline.
      let serverSourceMap: SourceMapEntry[] = [];

      try {
        await new Promise<void>((resolve, reject) => {
          streamChat({
            messages: apiMessages,
            mode: filters.mode,
            jurisdiction: filters.jurisdiction,
            sources: filters.sources,
            sourceContext,
            sourceItems,
            documentContext,
            legalArea: filters.legalArea,
            vaultContext,
            workspaceId: activeWorkspace?.id,
            chatId: currentChatId || undefined,
            messageId: userMsg.id,
            signal: controller.signal,
            onSourceMap: (sources) => {
              serverSourceMap = sources;
              console.log(`[chat] Received source_map with ${sources.length} entries`);
            },
            onModeSwitch: (from, to, label) => {
              console.log(`[mode-switch] Auto: ${from} → ${to}`);
              // Update chat filters in DB
              if (currentChatId) {
                updateChatFilters(currentChatId, { ...filters, mode: to as any });
              }
              toast({
                title: "Modus gewechselt",
                description: `Automatisch auf ${label} umgestellt.`,
              });
            },
            onToolStart: (name, args) => {
              console.log(`[tool] Agent calling: ${name}`, args);
              setIsThinking(true);
              const detail = args?.query || args?.norm || args?.file_name || "";
              setThinkingSteps(prev => [...prev, {
                id: `tool-${name}-${Date.now()}`,
                label: name === "search_law" ? `Recherchiere: ${detail.slice(0, 50)}`
                     : name === "lookup_norm" ? `Schlage nach: ${detail.slice(0, 50)}`
                     : name === "analyze_document" ? `Analysiere: ${detail.slice(0, 50)}`
                     : name,
                status: "active" as const,
              }]);
            },
            onToolDone: (name, count, sources) => {
              console.log(`[tool] ${name} done: ${count} results`);
              setThinkingSteps(prev => prev.map(s =>
                s.id.startsWith(`tool-${name}`) && s.status === "active"
                  ? { ...s, status: "done" as const, label: s.label + ` (${count})` }
                  : s
              ));
              if (sources && sources.length > 0) {
                const mapped = sources.map((s: any) => ({
                  doc_ref: s.doc_ref || "",
                  title: s.title || "",
                  date: s.date || s.doc_date || "",
                  url: s.url || s.source_url || "",
                  score: s.score || s.combined_score || 0.5,
                  highlights: [s.snippet?.slice(0, 300) || s.content?.slice(0, 300) || ""],
                  provider: s.provider || s.source_provider || name,
                  snippet: s.snippet || s.content?.slice(0, 500) || "",
                  evidence_status: s.evidence_status || "verified_document",
                }));
                toolFoundSources.push(...mapped);
                // Same chat-id guard as the main retrieval path: a tool
                // result that arrives after the user navigated to a
                // different chat must NOT show up in the new chat's
                // right-panel. The sourceResultsMap (keyed by message
                // id) is still updated below and stays correct for
                // historical viewing of THIS chat.
                if (activeChatIdRef.current === currentChatId) {
                  setSourceResults(prev => [...prev, { provider: `TOOL:${name}`, results: mapped, latencyMs: 0 }]);
                }
              }
            },
            onDelta: (chunk) => {
              fullResponse += chunk;

              if (!responseVisible) {
                const elapsed = Date.now() - thinkingStartedAt;
                if (elapsed >= MIN_THINKING_PHASE_MS) {
                  revealResponsePhase();
                } else if (!responseRevealScheduled) {
                  responseRevealScheduled = setTimeout(() => {
                    responseRevealScheduled = null;
                    revealResponsePhase();
                  }, MIN_THINKING_PHASE_MS - elapsed);
                }
                return;
              }

              // Optimization #6: Don't strip disclaimer during streaming — only in onDone
              setStreamingContent(fullResponse);
            },
            onDone: async () => {
              clearRevealTimer();
              revealResponsePhase();
              thinkingCtrl.completeAll();
              setIsThinking(false);
              const cleanedResponse = stripTrailingLegalDisclaimer(fullResponse);
              const initialResponse = cleanedResponse || fullResponse.trim();
              if (!initialResponse) {
                setIsStreaming(false);
                setStreamingContent("");
                toast({ title: "Fehler", description: "Keine Antwort erhalten. Bitte versuchen Sie es erneut.", variant: "destructive" });
                resolve();
                return;
              }

              // Three-step post-generation pipeline (Harvey-style citations):
              //   1. analyzeCitations → flag free-form Aktenzeichen / RS / GZ
              //   2. applyCitationScrub with sourceMap → either rewrite a
              //      free-form cite to its matching [Quelle N] token, OR
              //      delete it silently if no match exists
              //   3. renderSourceTokens → turn [Quelle N] (server-emitted +
              //      scrubber-rewritten) into clickable footnote links
              //
              // Everything runs BEFORE persistence so the DB never stores a
              // hallucinated cite or a stray [Quelle N] token. Default mode
              // is "delete" (no warning banner, no marker) — clean answer.
              let responseToPersist = initialResponse;
              let scrubRemovedCount = 0;
              if (!isExamMode) {
                try {
                  const allSourcesForScrub = [
                    ...retrievalResults.flatMap(sr =>
                      sr.results.map(r => ({
                        provider: sr.provider,
                        title: r.title || "",
                        url: r.url,
                        doc_ref: r.doc_ref || "",
                        snippet: r.snippet || "",
                        date: r.date || "",
                      }))
                    ),
                    ...toolFoundSources.map(s => ({
                      provider: s.provider || "TOOL",
                      title: s.title || "",
                      url: s.url || "",
                      doc_ref: s.doc_ref || "",
                      snippet: s.snippet || "",
                      date: s.date || "",
                    })),
                  ];
                  const preAnalysis = analyzeCitations(initialResponse, sourceContext, allSourcesForScrub);
                  // Pass ALL hard-type citations (case_ref / rs_number /
                  // ecli / bge / celex / njw) to the scrubber, not just
                  // the ones flagged as fabricated. In the Harvey-style
                  // architecture even a "verified" free-form cite is
                  // wrong — the model should have used [Quelle N]. The
                  // scrubber tries to match each against the sourceMap
                  // and rewrites to [Quelle N] where possible, deletes
                  // where not. Paragraph / article cites stay free-form.
                  const HARD_TYPES = new Set(["case_ref", "rs_number", "ecli", "bge", "celex", "njw"]);
                  const allHardCites = preAnalysis.citations.filter(c => HARD_TYPES.has(c.type));
                  const scrub = applyCitationScrub(
                    initialResponse,
                    allHardCites,
                    { sourceMap: serverSourceMap },
                  );
                  let stagedText = scrub.text;
                  scrubRemovedCount = scrub.removedCount;
                  if (scrub.removedCount > 0 || scrub.rewrittenCount > 0) {
                    console.warn(`[scrub-citations] Removed ${scrub.removedCount}, rewrote ${scrub.rewrittenCount} citation(s).`);
                  }

                  // Render [Quelle N] tokens → footnote links. Runs even
                  // when the scrubber didn't touch anything, because the
                  // LLM may have emitted tokens directly (intended path).
                  if (serverSourceMap.length > 0) {
                    const rendered = renderSourceTokens(stagedText, serverSourceMap);
                    stagedText = rendered.text;
                    if (rendered.replaced > 0 || rendered.unmapped > 0) {
                      console.log(`[render-source-tokens] replaced=${rendered.replaced}, unmapped=${rendered.unmapped}, parens-stripped=${rendered.parentheticalsStripped}`);
                    }
                  }

                  if (sourceContext && sourceContext.trim().length > 200) {
                    const verificationAnalysis = analyzeCitations(stagedText, sourceContext, allSourcesForScrub);
                    const verification = await verifyAnswer(stagedText, sourceContext, verificationAnalysis.citations);
                    if (verification && !verification.verified && verification.repaired_text?.trim()) {
                      console.warn(`[verify-answer] Applied repaired response with ${verification.issues?.length || 0} issue(s).`);
                      stagedText = verification.repaired_text.trim();
                    }
                  }
                  responseToPersist = stagedText;
                } catch (e) {
                  console.error("[scrub-citations] Pre-persist pipeline failed (non-critical):", e);
                }
              }
              let assistantMsg: ChatMessage | null = null;
              if (privacyNoStore) {
                assistantMsg = {
                  id: crypto.randomUUID(),
                  chat_id: currentChatId!,
                  role: "assistant",
                  content: { text: responseToPersist },
                  created_at: new Date().toISOString(),
                } as ChatMessage;
                setMessages(prev => [...prev, assistantMsg!]);
              } else {
                const optimisticId = `__assistant_pending__${Date.now()}`;
                const optimisticMsg = {
                  id: optimisticId,
                  chat_id: currentChatId!,
                  role: "assistant",
                  content: { text: responseToPersist },
                  created_at: new Date().toISOString(),
                } as ChatMessage;
                setMessages(prev => [...prev, optimisticMsg]);

                assistantMsg = await insertMessage(currentChatId!, "assistant", responseToPersist);
                if (assistantMsg) {
                  setMessages(prev => prev.map(m => m.id === optimisticId ? assistantMsg! : m));
                }
              }

              setIsStreaming(false);
              setStreamingContent("");

              // LLM-based chat title generation
              if (messages.length === 0 && text.length > 5) {
                generateChatTitle(text, responseToPersist, currentChatId!);
              }
              if (justCreatedRef.current === currentChatId) {
                justCreatedRef.current = null;
              }

              // Store sources for this specific assistant message
              if (assistantMsg) {
                const allSourceGroups = [...retrievalResults, ...toolFoundSources.length > 0 ? [{ provider: "TOOL", results: toolFoundSources, latencyMs: 0 }] : []];
                if (allSourceGroups.length > 0) {
                  setSourceResultsMap(prev => ({ ...prev, [assistantMsg.id]: allSourceGroups.map(sr => ({ provider: sr.provider, results: sr.results })) }));
                }
              }

              // Document detection — use effective mode (isDraftMode detects draft intent even from research mode)
              if (assistantMsg) {
                const effectiveMode = isDraftMode ? "draft" : filters.mode;
                const detection = detectDocumentContent(responseToPersist, text, effectiveMode);
                if (detection.isDocument) {
                  setDocumentDetectionMap(prev => ({ ...prev, [assistantMsg.id]: detection }));
                }
              }

              // Citation analysis — skip for exam mode
              if (!isExamMode) {
                try {
                  const allSources = [
                    ...retrievalResults.flatMap(sr =>
                      sr.results.map(r => ({
                        provider: sr.provider,
                        title: r.title || "",
                        url: r.url,
                        doc_ref: r.doc_ref || "",
                        snippet: r.snippet || "",
                        date: r.date || "",
                      }))
                    ),
                    ...toolFoundSources.map(s => ({
                      provider: s.provider || "TOOL",
                      title: s.title || "",
                      url: s.url || "",
                      doc_ref: s.doc_ref || "",
                      snippet: s.snippet || "",
                      date: s.date || "",
                    })),
                  ];
                  const analysis = analyzeCitations(responseToPersist, sourceContext, allSources);
                  if (assistantMsg) {
                    setCitationAnalysisMap(prev => ({ ...prev, [assistantMsg.id]: analysis }));
                  }
                  if (analysis.verification.fabricatedSuspects.length > 0) {
                    console.warn("[citation-engine] Suspected fabricated citations:",
                      analysis.verification.fabricatedSuspects.map(c => c.normalized));
                  }
                  if (analysis.freshnessWarnings.length > 0) {
                    console.info("[citation-engine] Freshness warnings:",
                      analysis.freshnessWarnings.map(w => w.warning));
                  }
                } catch (e) {
                  console.error("[citation-engine] Analysis failed:", e);
                }
              }
              resolve();
            },
            onError: async (error) => {
              clearRevealTimer();
              thinkingCtrl.completeAll();
              setIsThinking(false);
              setIsStreaming(false);
              setStreamingContent("");

              // Detect session expired — prompt re-login
              if (/Sitzung abgelaufen|erneut an/i.test(error)) {
                toast({
                  title: "Sitzung abgelaufen",
                  description: "Bitte laden Sie die Seite neu oder melden Sie sich erneut an.",
                  variant: "destructive",
                });
                resolve();
                return;
              }
              if (justCreatedRef.current === currentChatId) {
                justCreatedRef.current = null;
              }

              // Detect quota exceeded errors
              if (/Limit erreicht/i.test(error) || /upgraden Sie/i.test(error)) {
                const type = /Upload/i.test(error) ? "uploads" as const
                  : /Pseudonymis/i.test(error) ? "pseudonymizations" as const
                  : "queries" as const;
                setQuotaExceeded({ type, message: error });
                resolve();
                return;
              }

              const errorText = `⚠️ **Fehler:** ${error}`;
              if (privacyNoStore) {
                const localErrorMsg: ChatMessage = {
                  id: crypto.randomUUID(),
                  chat_id: currentChatId!,
                  role: "assistant",
                  content: { text: errorText },
                  created_at: new Date().toISOString(),
                } as ChatMessage;
                setMessages(prev => [...prev, localErrorMsg]);
              } else {
                const errorMsg = await insertMessage(currentChatId!, "assistant", errorText);
                if (errorMsg) setMessages(prev => [...prev, errorMsg]);
              }
              toast({ title: "Fehler", description: error, variant: "destructive" });
              reject(new Error(error));
            },
          });
        });
      } catch (e: any) {
        clearRevealTimer();
        if (e.name !== "AbortError") {
          thinkingCtrl.completeAll();
          setIsThinking(false);
          setIsStreaming(false);
          setStreamingContent("");
          toast({ title: "Fehler", description: "Verbindung unterbrochen.", variant: "destructive" });
        }
      }
    },
    [user, activeWorkspace, activeChatId, filters, messages, navigate, location.search, currentMatterId, privacyNoStore]
  );

  return {
    messages,
    setMessages,
    streamingContent,
    isStreaming,
    thinkingSteps,
    isThinking,
    sourceResults,
    setSourceResults,
    sourceResultsMap,
    isSearchingSources,
    citationAnalysisMap,
    documentDetectionMap,
    activeChatId,
    setActiveChatId: selectActiveChat,
    justCreatedRef,
    quotaExceeded,
    setQuotaExceeded,
    handleSend,
    handleStop,
    resetState,
  };
}

/** Generate a concise chat title via dedicated lightweight edge function */
async function generateChatTitle(userQuery: string, aiResponse: string, chatId: string) {
  try {
    const { data, error } = await supabase.functions.invoke("title-gen", {
      body: {
        query: userQuery.slice(0, 200),
        response_start: aiResponse.slice(0, 200),
      },
    });

    if (!error && data?.title) {
      updateChatTitle(chatId, data.title);
      return;
    }

    // Fallback: use first 50 chars
    const fallback = userQuery.length > 50 ? userQuery.slice(0, 50) + "…" : userQuery;
    updateChatTitle(chatId, fallback);
  } catch (e) {
    const fallback = userQuery.length > 50 ? userQuery.slice(0, 50) + "…" : userQuery;
    updateChatTitle(chatId, fallback);
  }
}

/** Answer Verification Loop — blocking pre-persistence check */
async function verifyAnswer(
  responseText: string,
  sourceContext: string,
  citations: ExtractedCitation[],
): Promise<{ verified: boolean; issues?: any[]; repaired_text?: string } | null> {
  try {
    const { data, error } = await supabase.functions.invoke("verify-answer", {
      body: {
        response_text: responseText.slice(0, 8000),
        source_context: sourceContext.slice(0, 5000),
        citations: citations.slice(0, 20).map(c => ({
          type: c.type,
          normalized: c.normalized,
          verified: c.verified,
        })),
      },
    });

    if (error || !data) {
      console.warn("[verify-answer] Invocation failed:", error);
      return null;
    }

    if (!data.verified && data.issues?.length > 0) {
      console.warn("[verify-answer] Issues found before persistence:", data.issues);
    } else {
      console.log("[verify-answer] Response verified before persistence");
    }
    return data;
  } catch (e) {
    console.warn("[verify-answer] Error:", e);
    return null;
  }
}
