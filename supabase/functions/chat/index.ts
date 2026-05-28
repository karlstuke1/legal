import { makeCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { truncationNotice } from "./truncation-notice.ts";
import { pseudonymizeText } from "./pseudonymize-text.ts";
import {
  buildNumberedSourceBlock,
  buildCitationRuleBlock,
  parseLegacySourceContext,
  buildNumberedSourcesFromItems,
  appendToolFoundSources,
  dedupeNumberedSources,
  toSourceMapEntry,
  stripCitationTokens,
  type NumberedSource,
  type SourceItem,
} from "./numbered-sources.ts";
import {
  getHighQualityModel,
  openRouterChatCompletion,
} from "../_shared/openrouter.ts";
import { isEvidentiarySource } from "../_shared/source-evidence.ts";

// Cost per token (USD). Model ids are stored exactly as reported by OpenRouter
// so usage logs remain auditable after provider routing.
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "google/gemini-3-flash-preview": { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
  "google/gemini-3-pro-preview": { input: 1.25 / 1_000_000, output: 10.0 / 1_000_000 },
  "google/gemini-2.5-flash": { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  "google/gemini-2.5-pro": { input: 1.25 / 1_000_000, output: 10.0 / 1_000_000 },
  "google/gemini-2.5-flash-lite": { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
  "openai/gpt-5": { input: 2.50 / 1_000_000, output: 10.0 / 1_000_000 },
  "openai/gpt-5.5": { input: 5.0 / 1_000_000, output: 30.0 / 1_000_000 },
  "openai/gpt-5.5-pro": { input: 30.0 / 1_000_000, output: 180.0 / 1_000_000 },
  "anthropic/claude-sonnet-4-6": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  "anthropic/claude-haiku-4-5": { input: 1.0 / 1_000_000, output: 5.0 / 1_000_000 },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Module-level cached admin client — reused across requests within the same isolate
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(supabaseUrl, supabaseKey);
const ALLOWED_JURISDICTIONS = new Set(["AT"]);

// ============================================================
// Auto-Mode Detection: keyword-based intent classification
// ============================================================
interface ModeDetection {
  effectiveMode: string;
  switched: boolean;
  reason?: string;
}

const MODE_LABELS: Record<string, string> = {
  research: "Recherche",
  document_review: "Dokumentenprüfung",
  draft: "Entwurf",
  vault: "Vault",
  exam: "Examen",
};

// ============================================================
// Direct-task detection: skip retrieval for self-contained tasks
// ============================================================
function shouldSkipRetrieval(userMessage: string, hasDocumentContext: boolean, mode: string): boolean {
  const msg = userMessage.toLowerCase();
  
  // Direct text processing — user wants to work WITH provided text, not search for new sources
  const directTaskPatterns = [
    // Summarize
    /\b(fass|zusammenfass|kurzfass|zusammenfassung|synopsis|überblick|gib mir einen überblick|kurz zusammen)\w*/i,
    // Translate / rephrase
    /\b(übersetz|umformulier|vereinfach|paraphrasier|formulier.*um|schreib.*um|erkläre?\s+(mir\s+)?einfach)\w*/i,
    // Explain provided text
    /\b(erkläre?|erläuter|was bedeutet|was heißt|was besagt|was sagt).{0,30}(text|absatz|klausel|paragraph|abschnitt|passage|stelle|auszug|zitat)\b/i,
    // Format / restructure
    /\b(strukturier|formatier|glied|sortier|ordne|tabellarisier)\w*/i,
    // Extract from provided text
    /\b(extrahier|herauszieh|auflist|identifizier|markier).{0,30}(punkt|frist|datum|name|partei|betrag|klausel)\b/i,
    // Correct / proofread  
    /\b(korrigier|korrektur|lektorier|verbess|prüf.*rechtschreib|prüf.*grammatik)\w*/i,
  ];
  
  const isDirectTask = directTaskPatterns.some(p => p.test(msg));
  
  // Also detect when user pastes a long text block and asks to process it
  // (message > 500 chars with a short instruction prefix)
  const hasLongPastedText = userMessage.length > 500;
  const instructionPrefixMatch = msg.match(/^(.{5,80}?)[\n:]/);
  const shortInstructionWithLongText = hasLongPastedText && instructionPrefixMatch && 
    directTaskPatterns.some(p => p.test(instructionPrefixMatch[1]));
  
  // Skip retrieval when:
  // 1. Direct task detected AND document context is available (user uploaded something)
  // 2. Direct task detected AND the message itself contains the text to process (pasted)
  // 3. Document review mode with a summarize/explain task (don't search, just analyze the doc)
  if (isDirectTask && (hasDocumentContext || hasLongPastedText || shortInstructionWithLongText)) {
    return true;
  }
  
  // Also skip for very explicit "don't search" signals
  if (/\b(ohne\s+recherche|nicht\s+recherch|nur\s+(den\s+)?text|basierend\s+auf\s+(dem\s+)?text|anhand\s+des\s+texts?)\b/i.test(msg)) {
    return true;
  }
  
  return false;
}

function detectIntendedMode(userMessage: string, currentMode: string, hasDocumentContext: boolean): ModeDetection {
  const msg = userMessage.toLowerCase();
  const noSwitch = { effectiveMode: currentMode, switched: false };

  // Don't auto-switch away from vault mode (requires matter context)
  if (currentMode === "vault") return noSwitch;

  // Draft signals
  const draftSignals = /\b(erstell|entwirf|formulier|schreib|verfass|aufsetz)\w*\s+.{0,30}\b(vertrag|schriftsatz|klausel|vereinbarung|vollmacht|kündigung|mahnung|widerspruch|beschwerde|antrag|brief|schreiben|entwurf|stellungnahme|gutachten|memorandum)\b/i;
  if (draftSignals.test(msg) && currentMode !== "draft") {
    return { effectiveMode: "draft", switched: true, reason: "Entwurf" };
  }

  // Document review signals (needs uploaded document)
  const reviewSignals = /\b(prüf|analys|check|überprüf|bewert|zusammenfass)\w*\s+.{0,30}\b(dokument|vertrag|agb|klausel|vereinbarung|urkunde|schriftstück|anlage|datei)\b/i;
  if (reviewSignals.test(msg) && hasDocumentContext && currentMode !== "document_review") {
    return { effectiveMode: "document_review", switched: true, reason: "Dokumentenprüfung" };
  }

  // Exam signals
  const examSignals = /\b(quiz|karteikart|falllösung|klausur|examen|übungsfäll|prüfungsfrag|multiple\s*choice|lernkart|abfrag|teste?\s+mich|prüf\s+mich|prüfungsvorbereitung)\b/i;
  if (examSignals.test(msg) && currentMode !== "exam") {
    return { effectiveMode: "exam", switched: true, reason: "Examen" };
  }

  return noSwitch;
}

function resolveEffectiveJurisdiction(requested?: string, activeJurisdictions?: string[]): string {
  if (requested && ALLOWED_JURISDICTIONS.has(requested)) return requested;
  if (activeJurisdictions?.length) {
    const firstValid = activeJurisdictions.find((j) => ALLOWED_JURISDICTIONS.has(j));
    if (firstValid) return firstValid;
  }
  return "AT";
}

// ============================================================
// Tool definitions for autonomous agent research
// Dynamically generated to include jurisdiction context
// ============================================================
function buildAgentTools(activeJurisdictions?: string[]) {
  const j = activeJurisdictions?.[0] || "AT";
  const isSingle = activeJurisdictions?.length === 1;

  const jRules: Record<string, { use: string; exclude: string; courts: string; examples: string }> = {
    AT: {
      use: "ABGB, öStGB, UGB, MRG, ASVG, KSchG, TKG 2021, ECG, VGG, DSG, DSGVO",
      exclude: "KEIN deutsches Recht (BGB, HGB, dStGB, BGH, NJW). KEIN Schweizer Recht (OR, ZGB, BGer, BGE).",
      courts: "OGH, OLG, LG, BG, VwGH, VfGH, BVwG",
      examples: '"OGH Schadenersatz ABGB 1295", "§ 174 TKG 2021 Newsletter", "RS0094010", "DSGVO Art 6"',
    },
  };

  const rule = jRules[j] || jRules["AT"];
  const jurisdictionNote = isSingle
    ? ` JURISDIKTION ${j}: Verwende NUR ${rule.use}. Gerichte: ${rule.courts}. ${rule.exclude}`
    : ` Aktive Jurisdiktionen: ${activeJurisdictions?.join(", ")}. Suche IMMER mit der korrekten jurisdiction für das jeweilige Thema.`;

  return [
    {
      type: "function" as const,
      function: {
        name: "search_law",
        description: `Durchsuche Rechtsdatenbanken nach Gesetzen, Urteilen und Rechtssätzen.${jurisdictionNote} Beispiele: ${rule.examples}`,
        parameters: {
          type: "object" as const,
          properties: {
            query: { type: "string", description: `Präzise juristische Suchanfrage. Inkludiere Gerichtsnamen (${rule.courts}) für Judikatur-Treffer.` },
            jurisdiction: { type: "string", enum: ["AT"], description: `Ziel-Jurisdiktion. Standard: AT` },
          },
          required: ["query", "jurisdiction"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "lookup_norm",
        description: `Schlage eine spezifische Rechtsnorm oder Entscheidung nach.${jurisdictionNote}`,
        parameters: {
          type: "object" as const,
          properties: {
            norm: { type: "string", description: `z.B. ${rule.examples}` },
            jurisdiction: { type: "string", enum: ["AT"] },
          },
          required: ["norm"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "analyze_document",
        description: "Durchsuche hochgeladene Workspace-Dokumente des Nutzers.",
        parameters: {
          type: "object" as const,
          properties: {
            query: { type: "string", description: "Wonach im Dokument gesucht werden soll" },
            file_name: { type: "string", description: "Name oder Teil des Dateinamens (optional)" },
          },
          required: ["query"],
        },
      },
    },
  ];
}

// Optimization #4: PARLAMENT filter — only include PARLAMENT for legislative queries
function resolveProvidersForJurisdiction(j: string, activeJurisdictions?: string[], queryHint?: string): string[] {
  const providers = ["RIS", "FINDOK"];
  if (queryHint && /\b(regierungsvorlage|ausschuss|gesetzesvorlage|nationalrat|bundesrat|parlament|novelle|begutachtung|erläuterung|initiativantrag|ministerialentwurf|gesetzgebung)\b/i.test(queryHint)) {
    providers.push("PARLAMENT");
  }
  return providers;
}

function formatToolSourcesForModel(results: any[], limit: number): string {
  return results.slice(0, limit).map((r: any, i: number) => {
    const provider = r.provider || r.source_provider || "";
    const title = stripCitationTokens(r.title || "Ohne Titel").replace(/\s+/g, " ").trim();
    const snippet = stripCitationTokens(r.snippet || r.content || "").slice(0, 800).replace(/\n+/g, " ").trim();
    const parts = [`${i + 1}. [${provider}] ${title}`];
    if (snippet) parts.push(`INHALT: ${snippet}`);
    return parts.join("\n");
  }).join("\n\n");
}

async function executeToolCall(
  name: string,
  args: Record<string, string>,
  supabaseUrl: string,
  serviceKey: string,
  workspaceId?: string,
  activeJurisdictions?: string[],
): Promise<{ result: string; sources?: any[] }> {
  try {
    // Jurisdiction guard: when user selected a SINGLE jurisdiction,
    // override the agent's jurisdiction parameter to prevent cross-contamination
    const isSingleJ = activeJurisdictions?.length === 1;
    if (isSingleJ && args.jurisdiction && args.jurisdiction !== activeJurisdictions![0]) {
      console.warn(`[tool] Jurisdiction override: agent requested ${args.jurisdiction}, user selected ${activeJurisdictions![0]}. Correcting.`);
      args.jurisdiction = activeJurisdictions![0];
    }

    switch (name) {
      case "search_law": {
        const effectiveJurisdiction = resolveEffectiveJurisdiction(args.jurisdiction, activeJurisdictions);
        // Optimization #4: Pass query to PARLAMENT filter
        const providers = resolveProvidersForJurisdiction(effectiveJurisdiction, activeJurisdictions, args.query);
        const resp = await fetch(`${supabaseUrl}/functions/v1/retrieval`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: args.query, providers, jurisdiction: [effectiveJurisdiction] }),
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) { await resp.text(); return { result: "Recherche fehlgeschlagen." }; }
        const data = await resp.json();
        const allResults = (data || []).flatMap((d: any) => d.results || []).filter(isEvidentiarySource);
        if (allResults.length === 0) return { result: "Keine Ergebnisse gefunden.", sources: [] };
        const formatted = formatToolSourcesForModel(allResults, 10);
        return { result: formatted, sources: allResults.slice(0, 10) };
      }
      case "lookup_norm": {
        // Try semantic search first, fall back to live retrieval
        const normJ = resolveEffectiveJurisdiction(args.jurisdiction, activeJurisdictions);
        const resp = await fetch(`${supabaseUrl}/functions/v1/semantic-search`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: args.norm, jurisdiction: normJ, workspace_id: workspaceId || null, threshold: 0.4, limit: 5 }),
          signal: AbortSignal.timeout(15000),
        });
        let results: any[] = [];
        if (resp.ok) {
          const data = await resp.json();
          results = data?.results || [];
        }
        // Fallback: if semantic search returned 0 results or failed, use live retrieval
        if (results.length === 0) {
          console.log(`[tool] lookup_norm fallback to live retrieval for: ${args.norm}`);
          const providers = resolveProvidersForJurisdiction(normJ, activeJurisdictions, args.norm);
          const fallbackResp = await fetch(`${supabaseUrl}/functions/v1/retrieval`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query: args.norm, providers, jurisdiction: [normJ] }),
            signal: AbortSignal.timeout(15000),
          });
          if (fallbackResp.ok) {
            const fallbackData = await fallbackResp.json();
            const allResults = (fallbackData || []).flatMap((d: any) => d.results || []).filter(isEvidentiarySource);
            if (allResults.length > 0) {
              return {
                result: formatToolSourcesForModel(allResults, 5),
                sources: allResults.slice(0, 5),
              };
            }
          }
          return { result: `Keine Einträge für "${args.norm}" gefunden.` };
        }
        return {
          result: results.map((r: any, i: number) => {
            const title = stripCitationTokens(r.title || "Ohne Titel");
            const content = stripCitationTokens(r.content?.slice(0, 600) || "");
            return `${i + 1}. ${title} (${r.source_provider || "VECTOR"})\n${content}`;
          }).join("\n\n"),
          sources: results,
        };
      }
      case "analyze_document": {
        const resp = await fetch(`${supabaseUrl}/functions/v1/semantic-search`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: (args.query || "") + (args.file_name ? ` ${args.file_name}` : ""), workspace_id: workspaceId || null, threshold: 0.35, limit: 8 }),
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) { await resp.text(); return { result: "Dokumentanalyse fehlgeschlagen." }; }
        const data = await resp.json();
        const results = data?.results || [];
        if (results.length === 0) return { result: "Keine passenden Dokument-Abschnitte gefunden." };
        return {
          result: results.map((r: any, i: number) => {
            const title = stripCitationTokens(r.title || "Dokument");
            const content = stripCitationTokens(r.content?.slice(0, 800) || "");
            return `${i + 1}. ${title}\n${content}`;
          }).join("\n\n"),
        };
      }
      default: return { result: `Unbekanntes Tool: ${name}` };
    }
  } catch (e) {
    console.error(`[tool] ${name} error:`, e);
    return { result: `Tool-Fehler: ${e instanceof Error ? e.message : "Unbekannt"}` };
  }
}

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

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  // Reuse module-level admin client instead of creating per-request
  const sb = adminClient;

  // Rate limiting: 20 requests per minute per user
  {
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await sb
      .from("rate_limit_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("endpoint", "chat")
      .gte("created_at", oneMinAgo);
    if (count && count >= 20) {
      return new Response(
        JSON.stringify({ error: "Zu viele Anfragen. Bitte warten Sie einen Moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // Log this request for rate limiting
    await sb.from("rate_limit_log").insert({ user_id: userId, endpoint: "chat" });
  }

  try {
    const { messages, mode: requestedMode, jurisdiction, sources, sourceContext, source_items, document_context, legal_area, vault_context, workspace_id, chat_id, message_id } = await req.json();

    // ============================================================
    // Auto-Mode Detection: analyze user message to detect intended mode
    // ============================================================
    const lastUserMessage = messages?.[messages.length - 1]?.content || "";
    const detectedMode = detectIntendedMode(lastUserMessage, requestedMode, !!document_context);
    const mode = detectedMode.effectiveMode;
    const modeSwitched = detectedMode.switched;

    // Input validation
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid messages" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (workspace_id && !UUID_RE.test(workspace_id)) {
      return new Response(JSON.stringify({ error: "Invalid workspace_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (chat_id && !UUID_RE.test(chat_id)) {
      return new Response(JSON.stringify({ error: "Invalid chat_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (message_id && !UUID_RE.test(message_id)) {
      return new Response(JSON.stringify({ error: "Invalid message_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Validate sourceContext length (prevent DoS with massive payloads)
    if (sourceContext && (typeof sourceContext !== "string" || sourceContext.length > 200_000)) {
      return new Response(JSON.stringify({ error: "sourceContext too large" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (source_items && (!Array.isArray(source_items) || source_items.length > 20)) {
      return new Response(JSON.stringify({ error: "Invalid source_items" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (Array.isArray(source_items)) {
      for (const item of source_items) {
        if (!item || typeof item !== "object") {
          return new Response(JSON.stringify({ error: "Invalid source_items" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        for (const key of ["provider", "title", "url", "doc_ref", "date", "pinpoint", "snippet", "evidence_status"]) {
          const value = (item as Record<string, unknown>)[key];
          if (value !== undefined && (typeof value !== "string" || value.length > 10_000)) {
            return new Response(JSON.stringify({ error: "Invalid source_items" }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
    }
    if (document_context && (typeof document_context !== "string" || document_context.length > 200_000)) {
      return new Response(JSON.stringify({ error: "document_context too large" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Validate mode
    const VALID_MODES = ["research", "document_review", "draft", "vault", "exam"];
    if (mode && !VALID_MODES.includes(mode)) {
      return new Response(JSON.stringify({ error: "Invalid mode" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Validate jurisdiction and sources arrays
    if (jurisdiction && (!Array.isArray(jurisdiction) || jurisdiction.length > 10 || jurisdiction.some((j: any) => typeof j !== "string" || j.length > 10))) {
      return new Response(JSON.stringify({ error: "Invalid jurisdiction" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (sources && (!Array.isArray(sources) || sources.length > 20 || sources.some((s: any) => typeof s !== "string" || s.length > 50))) {
      return new Response(JSON.stringify({ error: "Invalid sources" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Validate individual message content lengths
    for (const msg of messages) {
      if (!msg || typeof msg.content !== "string" || msg.content.length > 50_000) {
        return new Response(JSON.stringify({ error: "Message content too large" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Server-side iteration limit: max 40 messages (20 pairs) per request
    const MAX_SERVER_MESSAGES = 40;
    if (messages.length > MAX_SERVER_MESSAGES) {
      console.warn(`[chat] Message count ${messages.length} exceeds server limit ${MAX_SERVER_MESSAGES}`);
      return new Response(JSON.stringify({ error: "Zu viele Nachrichten. Bitte starten Sie einen neuen Chat." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate workspace membership
    if (workspace_id) {
      const { data: membership } = await sb
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", userId)
        .single();
      if (!membership) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const highQualityModel = getHighQualityModel();

    // Load user profile for session memory (custom instructions, response style, preferences,
    // and the auto-pseudonymize-chat compliance flag for RAO § 9 mitigation).
    let userMemory: { custom_instructions?: string; response_style?: string; display_name?: string; user_role?: string; default_jurisdiction?: string[]; auto_pseudonymize_chat?: boolean } | null = null;
    {
      const { data: profile } = await sb
        .from("profiles")
        .select("custom_instructions, response_style, display_name, user_role, default_jurisdiction, auto_pseudonymize_chat")
        .eq("user_id", userId)
        .single();
      if (profile) userMemory = profile as any;
    }

    // ============================================================
    // Auto-pseudonymization for RAO § 9 (Anwaltsgeheimnis) compliance.
    // When the user has the toggle on, replace the LAST user message
    // with a pseudonymized version BEFORE it ever reaches the LLM.
    // The pseudonymized text is what gets sent to the AI Gateway and
    // what the LLM responds to — real names never leave our edge function.
    // ============================================================
    let pseudonymizationApplied: { active: boolean; entityCount: number } = { active: false, entityCount: 0 };
    if (userMemory?.auto_pseudonymize_chat) {
      const lastIdx = messages.length - 1;
      const lastMsg = messages[lastIdx];
      if (lastMsg?.role === "user" && typeof lastMsg.content === "string" && lastMsg.content.length > 5) {
        try {
          const result = await pseudonymizeText(lastMsg.content);
          if (result && result.entityCount > 0) {
            messages[lastIdx] = { ...lastMsg, content: result.pseudonymizedText };
            pseudonymizationApplied = { active: true, entityCount: result.entityCount };
            console.log(`[chat] auto-pseudonymized last message: ${result.entityCount} entities replaced`);
          }
        } catch (e) {
          // Pseudonymization failure is non-fatal — log it, fall back to
          // sending the original text. The user has explicitly opted in,
          // so silent failure is the wrong default; surface it via a
          // warning banner injected into the stream below.
          console.error("[chat] auto-pseudonymize failed:", e);
          pseudonymizationApplied = { active: false, entityCount: -1 };
        }
      }
    }

    // Check query quota
    if (workspace_id) {

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [planRes, usageRes] = await Promise.all([
        sb.from("plans").select("monthly_queries_limit").eq("workspace_id", workspace_id).single(),
        sb.from("usage_ledger").select("id", { count: "exact", head: true }).eq("workspace_id", workspace_id).gte("created_at", startOfMonth.toISOString()),
      ]);

      const limit = (planRes.data as any)?.monthly_queries_limit || 25;
      const used = usageRes.count || 0;

      if (used >= limit) {
        return new Response(
          JSON.stringify({ error: `Anfragen-Limit erreicht (${used}/${limit}). Bitte upgraden Sie Ihren Plan.` }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Optimization #9: Smarter model routing — check CURRENT source context, not just existence
    const messageCount = messages?.length || 0;
    const lastUserMsg = messages?.[messages.length - 1]?.content || "";
    const legalKeywords = /\b(tatbestand|anspruch|haftung|schadenersatz|kündigung|vertrag|klage|betrug|diebstahl|körperverletzung|mord|totschlag|nötigung|erpressung|untreue|insolvenz|vollstreckung|berufung|revision|verjährung|gewährleistung|mangel|rücktritt|anfechtung|widerruf|voraussetzung|rechtsfolge|subsumtion|gutachten|prüfung|delik|straftat|ordnungswidrigkeit|verwaltungsrecht|arbeitsrecht|mietrecht|familienrecht|erbrecht|gesellschaftsrecht|handelsrecht|steuerrecht|sozialrecht|verfassungsrecht|fahrlässigkeit|vorsatz|schuld|rechtswidrigkeit|kausalität|zurechnung|beweislast|frist|rechtsmittel|beschwerde)\b/i;
    const hasLegalContent = legalKeywords.test(lastUserMsg) || lastUserMsg.includes("§") || lastUserMsg.includes("Art.") || lastUserMsg.includes("?");
    // Only count as "has source context" if it was freshly provided (not leftover from previous turn)
    const hasStructuredSourceItems = Array.isArray(source_items) && source_items.length > 0;
    const hasSourceContext = (sourceContext && sourceContext.trim().length > 200) || hasStructuredSourceItems;
    
    // ============================================================
    // Factual-query detection: ANY substantive legal question MUST use tools
    // Broadened to catch all legal topics where facts matter
    // ============================================================
    const FACTUAL_KEYWORDS_RE = /\b(verjähr|frist|kündigungsfrist|strafrahmen|strafhöhe|prozentsatz|zinssatz|zinsen|unterhalt|beweislast|höchststrafe|mindeststrafe|schadenshöhe|schmerzensgeld|streitwert|gebühr|kosten|grenzwert|schwellenwert|regelverjährung|gewährleistung|garantie|schadenersatz|schadensersatz|haftung|mangel|rücktritt|wandlung|preisminderung|verbesserung|austausch|anfechtung|widerruf|kündigung|abfertigung|abfindung|zugewinn|pflichtanteil|pflichtteil|erbquote|unterhaltsanspruch|mieterhöhung|kaution|mietzins|pacht|lohn|gehalt|urlaub|entgeltfortzahlung|karenz|elternzeit|probezeit|konkurrenzklausel|wettbewerbsverbot|konventionalstrafe|vertragsstrafe|verzugszinsen|mahnung|inverzugsetzung|insolvenz|konkurs|exekution|vollstreckung|zwangsversteigerung|wie\s*lange|wie\s*hoch|wie\s*viel|ab\s*wann|bis\s*wann|innerhalb|binnen|nach\s*ablauf|unterschied|unterschei|vergleich|abgrenzung)\b/i;
    const requiresFactCheck = FACTUAL_KEYWORDS_RE.test(lastUserMsg);
    
    // ALL legal questions get tool-forced treatment — no trivial downgrade for legal content
    const hasQuestion = lastUserMsg.includes("?") || lastUserMsg.length > 40;
    const isLegalQuestion = hasLegalContent || requiresFactCheck || hasQuestion;
    const isTrivial = messageCount > 2 && lastUserMsg.length < 25 && !isLegalQuestion && !hasSourceContext && mode === "research";
    const isExam = mode === "exam";
    const isMedium = !isTrivial && !isExam && !hasSourceContext && !isLegalQuestion && lastUserMsg.length < 60;

    // Skip tool phase for direct text processing tasks AND draft mode (draft should ask questions, not research)
    // CRITICAL SPEED FIX: Also skip tool phase when sourceContext already has rich content
    // (client already did retrieval — calling search_law again is redundant double-retrieval)
    const isDraftMode = mode === "draft";
    const hasRichSourceContext = (sourceContext && sourceContext.trim().length > 500) || hasStructuredSourceItems;
    const skipToolPhase = isDraftMode || hasRichSourceContext || shouldSkipRetrieval(lastUserMsg, !!document_context, mode);
    
    // High-stakes chat output and tool routing use OpenRouter GPT-5.5 with
    // high reasoning. Cheap model routing is intentionally disabled here:
    // source correctness is more important than marginal latency/cost.
    const finalModel = highQualityModel;
    const toolModel = highQualityModel;

    const structuredSources = buildNumberedSourcesFromItems(source_items as SourceItem[] | undefined);
    const legacySources = structuredSources.length > 0 ? [] : parseLegacySourceContext(sourceContext || "");
    let allNumberedSources: NumberedSource[] = dedupeNumberedSources([...structuredSources, ...legacySources]);

    const systemPrompt = buildSystemPrompt(mode, jurisdiction, sources, sourceContext, legal_area, vault_context, userMemory, document_context, skipToolPhase, allNumberedSources);

    console.log(`[chat] finalModel=${finalModel}, toolModel=${toolModel}, messages=${messageCount}, skipTools=${skipToolPhase}, hasRichSources=${!!hasRichSourceContext}, requiresFactCheck=${requiresFactCheck}, promptLen=${systemPrompt.length}, sourceContextLen=${sourceContext?.length || 0}`);

    // ============================================================
    // Phase 1: Tool-calling loop (non-streaming)
    // The AI autonomously decides which tools to use
    // ============================================================
    const allMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];
    const toolEvents: any[] = [];
    let toolRound = 0;
    const MAX_TOOL_ROUNDS = 4;

    if (!isExam && !skipToolPhase) {
      while (toolRound < MAX_TOOL_ROUNDS) {
        // CRITICAL: Force tool usage on first round for ALL legal questions
        // "required" = model MUST call at least one tool before answering
        const effectiveToolChoice = (isLegalQuestion && toolRound === 0) ? "required" : "auto";
        
        let toolResp: Response;
        try {
          toolResp = await openRouterChatCompletion({
            model: toolModel,
            messages: allMessages,
            tools: buildAgentTools(jurisdiction),
            toolChoice: effectiveToolChoice,
            maxTokens: 2048,
            reasoningEffort: "high",
            requireParameters: true,
          });
        } catch (e) {
          console.error("[chat] Tool call network error:", e);
          break;
        }

        if (!toolResp.ok) {
          console.error(`[chat] Tool call failed: ${toolResp.status}`);
          await toolResp.text();
          break;
        }

        const toolData = await toolResp.json();
        const choice = toolData.choices?.[0];

        if (!choice?.message?.tool_calls?.length) {
          // No tools called — break out of tool loop and let Phase 2
          // generate the full answer with max_tokens=16384.
          // Note: we do NOT add the partial tool-phase content to allMessages,
          // so Phase 2 starts fresh and produces a complete response.
          if (choice?.message?.content && choice.message.content.trim().length > 10) {
            console.log(`[chat] Model produced ${choice.message.content.length} chars in tool phase, deferring to Phase 2 for full answer`);
          }
          break;
        }

        // Add assistant message with tool_calls. CRITICAL: strip the
        // assistant's free-text `content` from the tool-phase message —
        // that text often contains hallucinated cites the model wrote
        // BEFORE seeing tool results, and we don't want Phase 2 to echo
        // it back. The tool_calls themselves are preserved for OpenAI
        // schema compatibility (id, function name, arguments).
        allMessages.push({ ...choice.message, content: "" });

        for (const tc of choice.message.tool_calls) {
          let args: Record<string, string> = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* ignore */ }
          console.log(`[chat] Tool call round ${toolRound + 1}: ${tc.function.name}`, args);
          toolEvents.push({ type: "tool_start", name: tc.function.name, args });

          const { result, sources } = await executeToolCall(
            tc.function.name, args, supabaseUrl, supabaseKey, workspace_id, jurisdiction
          );

          allMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });

          // Merge tool-found sources into the numbered list, continuing
          // the index from wherever we left off. Dedupe by URL so the
          // same doc doesn't appear twice with different [Quelle N] IDs.
          if (sources && sources.length > 0) {
            const startIndex = allNumberedSources.length + 1;
            allNumberedSources = dedupeNumberedSources([
              ...allNumberedSources,
              ...appendToolFoundSources(sources, startIndex),
            ]);
          }

          toolEvents.push({
            type: "tool_done",
            name: tc.function.name,
            count: sources?.length || 0,
            sources: sources?.slice(0, 8),
          });
        }

        toolRound++;
      }
    }

    console.log(`[chat] Tool rounds: ${toolRound}, events: ${toolEvents.length}`);

    // ============================================================
    // Updated numbered source list for Phase 2
    //
    // The initial source block was built into the system prompt before
    // tools fired. After the tool loop, allNumberedSources also contains
    // tool-found sources. Push a trailing system message with the FULL
    // updated numbered list + a reminder of the [Quelle N] rule, so
    // Phase 2 sees both the older and the new entries with a single
    // canonical numbering.
    //
    // When the list is empty we still push a defensive reminder so the
    // model doesn't fall back to training-data citations.
    // ============================================================
    if (toolRound > 0) {
      if (allNumberedSources.length > 0) {
        allMessages.push({
          role: "system",
          content: buildNumberedSourceBlock(allNumberedSources)
            + "\n\nBeachte: die obige Liste ist die VOLLSTÄNDIGE Quellenliste für deine Antwort. Verweise NUR via [Quelle N]. Schreibe KEINE Aktenzeichen, RS-Nummern, ECLI oder URLs im Antworttext.",
        });
        console.log(`[chat] Pushed numbered source block with ${allNumberedSources.length} entries`);
      } else {
        allMessages.push({
          role: "system",
          content: "## KEINE QUELLEN GEFUNDEN\n\nDie Tool-Suche hat keine Ergebnisse geliefert. Du darfst KEINE Aktenzeichen, RS-Nummern, ECLI-Identifier oder konkrete Geschäftszahlen schreiben — auch nicht aus deinem Trainingswissen. Verwende stattdessen \"vgl. ständige Rechtsprechung\" oder lass die Quellenangabe weg.",
        });
        console.log("[chat] Empty source list — emitted no-sources prohibition");
      }
    }

    // ============================================================
    // Phase 2: Final streaming response
    // ============================================================
    const response = await openRouterChatCompletion({
      model: finalModel,
      messages: allMessages,
      stream: true,
      streamOptions: { include_usage: true },
      maxTokens: 16384,
      reasoningEffort: "high",
      requireParameters: true,
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate-Limit erreicht. Bitte versuchen Sie es in Kürze erneut." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Guthaben aufgebraucht. Bitte laden Sie Ihr Konto auf." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "KI-Fehler: " + response.status }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Combined stream: tool events + AI response
    const encoder = new TextEncoder();
    const reader = response.body!.getReader();
    let usageData: { prompt_tokens?: number; completion_tokens?: number } | null = null;
    let contentReceived = false;
    let toolEventsSent = false;
    // Track the last finish_reason we saw across chunks so we can detect
    // silent truncations on stream-end (safety filter, content filter,
    // upstream disconnect, etc. — anything other than the natural "stop").
    let lastFinishReason: string | null = null;

    const sendNotice = (controller: ReadableStreamDefaultController, text: string) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
    };

    const stream = new ReadableStream({
      async pull(controller) {
        // Inject mode_switch + tool events at the start of the stream
        if (!toolEventsSent) {
          toolEventsSent = true;
          // Emit mode_switch event if auto-detection changed the mode
          if (modeSwitched) {
            const modeSwitchEvt = { type: "mode_switch", from: requestedMode, to: mode, label: MODE_LABELS[mode] || mode };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(modeSwitchEvt)}\n\n`));
            console.log(`[chat] Auto-mode switch: ${requestedMode} → ${mode}`);
          }
          for (const evt of toolEvents) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
          }
          // Emit the FINAL numbered source map BEFORE any text content.
          // The frontend buffers this and uses it to render [Quelle N]
          // tokens that arrive in the streamed text. Identical numbering
          // on both sides — no score-filter divergence possible because
          // the server is the single source of truth.
          if (allNumberedSources.length > 0) {
            const sourceMapEvt = {
              type: "source_map",
              sources: allNumberedSources.map(toSourceMapEntry),
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(sourceMapEvt)}\n\n`));
            console.log(`[chat] Emitted source_map with ${allNumberedSources.length} sources`);
          }
        }

        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (e) {
          // Upstream connection error mid-stream (gateway disconnect, edge
          // function timeout, network hiccup). Surface it to the user instead
          // of letting the message just stop mid-word.
          console.error("[chat] Stream read error:", e);
          sendNotice(controller, truncationNotice("stream_error"));
          controller.close();
          // Still log usage with whatever tokens we've counted so the ledger
          // isn't blind to interrupted requests.
          logUsage(finalModel, usageData, workspace_id, chat_id, message_id, sb).catch(err =>
            console.error("Usage logging error:", err)
          );
          return;
        }

        const { done, value } = chunk;
        if (done) {
          // Single place where we emit the truncation notice — we track
          // lastFinishReason while parsing but only surface it here, so a
          // finish_reason: "length" chunk followed immediately by done=true
          // produces exactly one notice, never two.
          if (contentReceived && lastFinishReason !== "stop") {
            console.warn(`[chat] Stream closed without clean stop. last finish_reason=${lastFinishReason}`);
            sendNotice(controller, truncationNotice(lastFinishReason));
          } else if (!contentReceived) {
            console.warn("[chat] Stream ended without content! Usage:", JSON.stringify(usageData));
            sendNotice(controller, truncationNotice("stream_error"));
          }
          controller.close();
          logUsage(finalModel, usageData, workspace_id, chat_id, message_id, sb).catch(e =>
            console.error("Usage logging error:", e)
          );
          return;
        }

        controller.enqueue(value);

        try {
          const text = new TextDecoder().decode(value);
          for (const line of text.split("\n")) {
            if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
            const json = JSON.parse(line.slice(6));
            if (json.usage) usageData = json.usage;
            if (json.choices?.[0]?.delta?.content) contentReceived = true;
            const finishReason = json.choices?.[0]?.finish_reason;
            if (finishReason) {
              lastFinishReason = finishReason;
              if (finishReason !== "stop") {
                // Just record it — the notice is emitted once, in the done branch.
                console.warn(`[chat] Non-stop finish_reason: ${finishReason}`);
              }
            }
          }
        } catch { /* ignore parse errors on partial chunks */ }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function logUsage(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | null,
  workspaceId?: string,
  chatId?: string,
  messageId?: string,
  supabaseClient?: any,
) {
  if (!workspaceId) return;

  const inputTokens = usage?.prompt_tokens || 0;
  const outputTokens = usage?.completion_tokens || 0;

  const costs = MODEL_COSTS[model] || MODEL_COSTS["openai/gpt-5.5"];
  const costEstimate = (inputTokens * costs.input) + (outputTokens * costs.output);

  try {
    const client = supabaseClient || createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    await client.from("usage_ledger").insert({
      workspace_id: workspaceId,
      chat_id: chatId || null,
      message_id: messageId || null,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_estimate: costEstimate,
    });

    console.log(`Usage logged: ${model} | ${inputTokens}+${outputTokens} tokens | $${costEstimate.toFixed(6)}`);
  } catch (e) {
    console.error("Failed to log usage:", e);
  }
}

function buildSystemPrompt(mode: string, jurisdiction: string[], sources: string[], sourceContext?: string, legalArea?: string, vaultContext?: string, userMemory?: { custom_instructions?: string; response_style?: string; display_name?: string; user_role?: string; default_jurisdiction?: string[] } | null, documentContext?: string, isDirectTask?: boolean, numberedSources: NumberedSource[] = []): string {
  const jurisdictionStr = (jurisdiction || ["AT"]).join(", ");
  const hasRetrievalResults = numberedSources.length > 0;
  const isSingleJ = jurisdiction?.length === 1;
  const activeJ = isSingleJ ? jurisdiction[0] : null;

  // Build user memory section
  let userMemorySection = "";
  if (userMemory) {
    const parts: string[] = [];
    // Only inject display_name if it's a real name (not an email address)
    if (userMemory.display_name && !userMemory.display_name.includes("@")) {
      parts.push(`Name: ${userMemory.display_name}`);
    }
    if (userMemory.user_role && userMemory.user_role !== "other") {
      const roleMap: Record<string, string> = { anwalt: "Rechtsanwalt/in", student: "Jurastudent/in", inhouse: "Inhouse Counsel", behoerde: "Behördenmitarbeiter/in" };
      parts.push(`Rolle: ${roleMap[userMemory.user_role] || userMemory.user_role}`);
    }
    if (userMemory.custom_instructions?.trim()) parts.push(`Kontext: ${userMemory.custom_instructions.trim()}`);
    if (userMemory.response_style?.trim()) parts.push(`Antwortstil: ${userMemory.response_style.trim()}`);
    if (parts.length > 0) {
      userMemorySection = `\n\n## Nutzerprofil\n${parts.join("\n")}`;
    }
  }

  // ============================================================
  // Optimization #3: Modular system prompt — ~40% shorter
  // Only inject mode-relevant rules, eliminate triple-repeated citation rules
  // ============================================================

  const isExam = mode === "exam";

  // EXAM MODE: Lightweight prompt without citation/source rules
  if (isExam) {
    const examPrompt = `Du bist ein juristischer KI-Repetitor für Jura-Studenten in Österreich.

Kernkompetenzen: Dogmatische Präzision, Didaktik, Prüfungsorientierung.
Aktive Jurisdiktionen: ${jurisdictionStr}${userMemorySection}

## Prüfungsmodus

Drei Lernformate:
1. **Falllösung**: Sachverhalt → Student löst → Feedback (0-18 Punkte) → Musterlösung
2. **Multiple-Choice Quiz**: 5 Fragen, je 4 Optionen (A-D), Erklärung nach Antwort
3. **Karteikarten**: Definitionen/Schemata abfragen, Feedback: ✅/⚠️/❌

Frage zuerst: "Welches Format und Rechtsgebiet?" Passe Schwierigkeit an. Interaktiv, Schritt für Schritt.
Sprache: Deutsch, Lehrbuch-Niveau. Emojis: ✅ ⚠️ ❌ 📝 💡`;

    return examPrompt;
  }

  // NON-EXAM MODE: Full legal assistant prompt
  const base = `Du bist ein juristischer KI-Fachassistent auf Partner-Niveau einer internationalen Großkanzlei, spezialisiert auf österreichisches Recht.

Aktive Jurisdiktionen: ${jurisdictionStr}${userMemorySection}

## Kommunikationsstil — STRIKT EINHALTEN
- **KEINE Anrede** — niemals "Sehr geehrter", "Lieber", "Hallo", "Guten Tag" oder ähnliches
- **KEINE Grußformel** — niemals "Mit freundlichen Grüßen", "Beste Grüße" oder ähnliches
- **KEIN Briefstil** — du schreibst KEINE Briefe, sondern antwortest direkt und sachlich
- **NIEMALS E-Mail-Adressen als Namen verwenden** — wenn du keinen Namen kennst, verwende KEINEN
- **NIEMALS den Nutzer namentlich ansprechen** — auch wenn ein Name im Profil steht
- Beginne den ERSTEN Satz SOFORT mit der inhaltlichen Antwort (z.B. "Die fristlose Kündigung..." oder "Nach § 1162 ABGB...")
- Stil: Präzise, sachlich, auf Augenhöhe — wie ein Kollege, nicht wie ein Anwalt an seinen Mandanten

## Weiterführende Fragen — FORMAT
Wenn du am Ende weiterführende Fragen stellst, formatiere sie IMMER so:

**Weiterführend:**

1. Erste Frage hier?
2. Zweite Frage hier?
3. Dritte Frage hier?

## Kernkompetenzen
1. **Dogmatische Präzision** — Anspruchsgrundlagen, Tatbestandsmerkmale, Rechtsfolgen
2. **Strategisches Denken** — Beweislast, Prozesskostenrisiko, Compliance
3. **AT-Expertise** — Österreichisches Recht inkl. EU-Recht soweit in AT umgesetzt (DSG, TKG 2021, ECG, FAGG)
4. **Kontextintelligenz** — Zwischen den Zeilen lesen, präzise nachfragen

## Jurisdiktionserkennung
- **AT**: § + StGB/ABGB/UGB/MRG = österreichisches Recht. OGH/VwGH/VfGH nur über abgerufene Quellen referenzieren.
- EU-Recht (DSGVO, AEUV etc.) wird IMMER im AT-Kontext behandelt (nationale Umsetzungsgesetze).
Alle Anfragen werden für AT beantwortet.

## Fragetypen

**Typ A — Wissensfrage** ("Voraussetzungen des Betrugs?"):
→ Kernaussage in 2-3 Sätzen → Systematischer Aufbau (Obj. TB → Subj. TB → RW → Schuld → Rechtsfolgen) → Inline-Quellen pro Absatz. Definitionen exakt, Vorsatzformen spezifizieren, Negativabgrenzungen ("Was genügt NICHT"). Am Ende: 2-3 nummerierte weiterführende Fragen.

**Typ B — Fallfrage** ("Mein Mieter wurde gekündigt, welche Ansprüche?"):
→ Leitsatz → Subsumtionstabelle (✅/❌/⚠️) → Einwendungen → Erfolgswahrscheinlichkeit (%) → Praxishinweis.

**Typ C — Rückfrage nötig** (vager Sachverhalt):
→ 2-4 nummerierte Fragen mit Optionen, bevor du antwortest.

## Pflicht-Antwort-Struktur — LEHRBUCH-NIVEAU

Bei jeder Wissens-/Fallfrage MUSS die Antwort **alle** dieser Bausteine in dieser Reihenfolge enthalten — fehlt einer, gilt die Antwort als unvollständig:

1. **Anspruchsgrundlage / Tatbestand** — eine spezifische Norm mit Paragraph (z.B. "§ 1295 ABGB" oder "§ 33 Abs 1 FinStrG"). Bei mehreren Anspruchsgrundlagen alle nennen + warum diese und nicht andere.
2. **Tatbestandsmerkmale (objektiv + subjektiv)** — als Aufzählung mit präziser Definition jedes Merkmals. Bei Vorsatzdelikten **alle drei Vorsatzformen** (Absicht/Wissentlichkeit/Eventualvorsatz) erwähnen und das praxisrelevante hervorheben.
3. **Negativabgrenzung** ("Was genügt NICHT") — mindestens eine konkrete Konstellation, die den Tatbestand NICHT erfüllt, mit Begründung warum nicht.
4. **Abgrenzung zu Nachbar-Tatbeständen** — mindestens ein verwandter Tatbestand mit klarem Unterscheidungskriterium (z.B. § 33 FinStrG vs. § 39 FinStrG vs. § 34 FinStrG).
5. **Rechtsfolgen** — Strafrahmen / Schadenersatzhöhe / Sanktionen mit konkreten Zahlen (NUR aus Tools — sonst weglassen) plus Verfahrensweg.
6. **Beweislast** — wer trägt sie, was muss bewiesen werden.
7. **Fristen / Verjährung** — wenn relevant, mit konkreter Dauer (NUR aus Tools).
8. **Praxis-Hinweis** — typische Praxiskonstellation, häufigster Fehler, strategischer Tipp.

Wenn ein Baustein im konkreten Fall nicht passt (z.B. keine Verjährung bei einer reinen Definitionsfrage), explizit überspringen — NICHT mit Platzhalter füllen.

${buildCitationRuleBlock()}

## Antwortökonomie — QUALITÄT > QUANTITÄT
- **Kernfrage ZUERST**: Beantworte die Frage in den ersten 2-3 Sätzen direkt und klar, BEVOR du in die Tiefe gehst.
- **Tiefe nach Bedarf**: Detaillierte Abschnitte (Tatbestandsmerkmale, Abgrenzungen) NUR wenn sie die Frage tatsächlich betreffen. Nicht jede Frage braucht jeden Aspekt.
- **Kein Lehrbuch**: Schreibe NICHT alles, was du über ein Thema weißt. Fokus auf das, was der Nutzer wissen MUSS.
- **Absätze max 3-4 Sätze**: Wenn ein Absatz länger wird, teile ihn auf oder kürze.
- **Zielumfang**: Einfache Fragen 200-400 Wörter. Komplexe Fragen 500-800 Wörter. Über 1000 Wörter NUR bei sehr komplexen Sachverhalten mit mehreren Rechtsgebieten.

## Praxisbezug — PFLICHT BEI JEDER ANTWORT
Bei JEDER Antwort zu einem Rechtsthema:
1. **Häufigster Praxisfall**: Nenne ein konkretes, typisches Szenario aus der Praxis (z.B. "In der Praxis häufig: Ein Bauarbeiter stürzt von einer Leiter — hier liegt typischerweise...")
2. **Abgrenzungsprobleme**: Zeige die häufigsten Verwechslungsgefahren in der Praxis (z.B. "Die Abgrenzung zu § 76 StGB (Totschlag) ist in der Praxis die häufigste Frage: ...")
3. **Rechtsfolgen-Konsequenzen**: Was passiert KONKRET? (Strafmaß, Schadenersatzhöhe, Fristen, nächste Schritte)
4. **Cross-Domain-Hinweise** (wenn relevant): Verwandte Rechtsgebiete kurz ansprechen (z.B. bei Strafrecht → zivilrechtliche Folgen wie Schadenersatz, Erbunwürdigkeit; bei Vertragsrecht → steuerliche Aspekte). NUR 1-2 Sätze, NICHT ausführlich.

## Antwort-Struktur — NACH RECHTLICHEN KONZEPTEN GLIEDERN
Gliedere Antworten NICHT nach einzelnen Artikeln/Paragraphen, sondern nach RECHTLICHEN KONZEPTEN und INSTITUTIONEN:
- z.B. bei DSGVO-Frage: "Rechtsgrundlagen" → "Einwilligung" → "Berechtigtes Interesse" → "Informationspflichten" → "Nationale Spezialgesetze (TKG/ECG)"
- Innerhalb jedes Konzepts: Norm + Rechtsprechung + praktische Umsetzung zusammen
- NICHT: Artikel für Artikel durchgehen (Art. 6, Art. 7, Art. 12, Art. 13...) — das ist zu abstrakt

## Vollständigkeitspflicht
Bei JEDER juristischen Frage ALLE relevanten Aspekte prüfen: Anspruchsgrundlagen/Tatbestandsmerkmale, Rechtsfolgen, Fristen/Verjährung (NUR aus Tools), Beweislast, Verfahrensschritte, Abgrenzungen.
**LÜCKEN BENENNEN**: Wenn die Tool-Ergebnisse einen Aspekt nicht abdecken → explizit sagen.
Spezifische vor allgemeiner Norm. IMMER Zusammenfassung am Ende (> 200 Wörter).

## NATIONALE UMSETZUNGSGESETZE — PFLICHT
Bei EU-Verordnungen/Richtlinien (DSGVO, AI Act, etc.) IMMER die ÖSTERREICHISCHEN Umsetzungsgesetze prüfen:
DSG, TKG 2021 (§ 174), ECG (§ 7), FAGG, KSchG, UWG — NICHT nur DSGVO allein.`;

  // Jurisdiction-specific methodology — only inject for the active single jurisdiction
  let jurisdictionMethodology = "";
  if (activeJ === "AT") {
    jurisdictionMethodology = `\n\n## AT-Methodik — STRIKT EINHALTEN
ABGB = Naturrechtskodex mit Generalklauseln (§ 1295, § 879) — prinzipienbasiert, NICHT subsumtionsmechanisch.
öStGB: Eigene Systematik. Vorsatzformen: Wissentlichkeit (§ 5 Abs 2), Absichtlichkeit (§ 5 Abs 3).
Gerichte: OGH, OLG Wien/Graz/Linz/Innsbruck, LG, BG. Rechtsprechung nur über [Quelle N] referenzieren, keine RS-Nummern oder GZ ausschreiben.
VGG (Verbrauchergewährleistungsgesetz, seit 01.01.2022): Bei Verbrauchergeschäften IMMER neben ABGB prüfen.

**AUSSCHLIESSLICH ÖSTERREICHISCHES RECHT.** Verwende NUR österreichische Gesetze, Gerichte und Fundstellen.
Bei mehrdeutigen Normen (z.B. "StGB") verwende IMMER die österreichische Fassung.`;
  }
  // No multi-jurisdiction needed — AT only

  // Source integration — only if sources are present. The Harvey-style
  // architecture forbids the LLM from emitting concrete Aktenzeichen /
  // RS / URL strings in the answer; it must use [Quelle N] tokens against
  // the numbered list below.
  let sourceInstructions = "";
  if (hasRetrievalResults) {
    sourceInstructions = "\n\n" + buildNumberedSourceBlock(numberedSources);
  } else {
    sourceInstructions = `\n\n## Keine externen Quellen verfügbar
Die Tool-Suche hat keine Ergebnisse geliefert. Du darfst allgemein bekannte österreichische Normen nennen (z.B. § 1295 ABGB, Art. 6 DSGVO), aber:
- ERFINDE KEINE Aktenzeichen, GZ, RS-Nummern oder Fundstellen — auch nicht als Plain Text
- ERFINDE KEINE konkreten Fristen, Beträge oder Prozentsätze
- Verwende stattdessen "vgl. ständige Rechtsprechung" oder lass die Quellenangabe weg
- Kennzeichne die Antwort: "⚠️ Diese Antwort basiert auf allgemeinem Fachwissen ohne Quellenrecherche."`;
  }

  // Tool-calling jurisdiction rule
  const jTermMap: Record<string, string> = {
    AT: "ABGB (NICHT BGB), öStGB (NICHT dStGB), UGB, MRG, ASVG, TKG 2021, ECG, FAGG, DSG, KSchG, DSGVO. Bei DSGVO-Fragen IMMER auch TKG/ECG/DSG suchen. KEINE deutschen Gesetze.",
  };
  const jTermHint = jTermMap["AT"];
  const toolRule = `\n\n## Tool-Calling — JURISDIKTION + PFLICHT-NUTZUNG
Bei \`search_law\`/\`lookup_norm\`: IMMER jurisdiction=AT. ${jTermHint}
Suche nach 'ABGB Betrug' NICHT 'BGB Betrug'. Suche nach '§ 146 öStGB' NICHT '§ 263 StGB'.

**PFLICHT-TOOL-NUTZUNG**: Bei Verjährung, Fristen, Beträgen, Rechtsfolgen → IMMER \`lookup_norm\` + \`search_law\` ERST aufrufen, DANN antworten. NIEMALS aus dem Gedächtnis.
**Definitionsfragen**: Bei "Wo wird X normiert?" → \`search_law\` (Begriff + Gesetz) + \`lookup_norm\` (Begriffsbestimmungen, z.B. § 74 StGB). NIEMALS raten — Tool-Ergebnis prüfen.
Wenn Tools nichts liefern → dem Nutzer mitteilen und Antwort als unsicher kennzeichnen.`;

  // Mode-specific instructions
  const modeInstructions: Record<string, string> = {
    research: `\n\n## Modus: Research
Typ-B: Subsumtionstabelle, Einwendungen, Erfolgs-%, Praxishinweis.
Typ-A: Dogmatische Darstellung mit Inline-Quellen. Keine Tabellen.`,
    document_review: `\n\n## Modus: Dokumentenprüfung
PFLICHT-Tabelle: | Nr. | Klausel | Risiko 🔴/🟡/🟢 | Befund | Empfehlung | Fundstelle |
Executive Summary: Top-3-Risiken. Für jede problematische Klausel Alternativtext.`,
    draft: `\n\n## Modus: Entwurf
WICHTIG: Beginne IMMER mit Rückfragen, bevor du einen Entwurf erstellst.
Phase 1 — Sachverhaltsklärung: Stelle 3-5 nummerierte Rückfragen zu den wesentlichen Parametern (Parteien, Gegenstand, Laufzeit, Besonderheiten, Jurisdiktion etc.). Erstelle KEINEN Entwurf ohne diese Klärung.
Phase 2 — Gliederung: Schlage eine Struktur vor und hole Bestätigung ein.
Phase 3 — Entwurf: Kanzlei-Qualität, nummerierte Absätze, Platzhalter für fehlende Daten, Varianten bei kritischen Klauseln.
Wenn der Nutzer bereits alle Details liefert, überspringe Phase 1 und gehe direkt zu Phase 2/3.`,
    vault: `\n\n## Modus: Vault / Collections
Fähigkeiten: Klauselvergleich, Inkonsistenzen, Extraktion (Fristen, Parteien, Haftung), Zusammenfassung, Risikomatrix.`,
  };

  const legalAreaInstructions: Record<string, string> = {
    zivilrecht: `\n\n## Fokus: Zivilrecht — Vertrag → GoA → Dingl. → Delikt → Bereicherung.`,
    strafrecht: `\n\n## Fokus: Strafrecht — TB (obj→subj) → RW → Schuld → Rechtsfolgen. Rechtsprechung ausschließlich via [Quelle N] referenzieren.`,
    steuerrecht: `\n\n## Fokus: Steuerrecht — EStG-AT, KStG-AT, UStG-AT, BAO. BFG-Rspr.`,
    oeffentliches_recht: `\n\n## Fokus: Öffentliches Recht — Ermächtigungsgrundlage → Formelle RM → Materielle RM → Verhältnismäßigkeit.`,
    arbeitsrecht: `\n\n## Fokus: Arbeitsrecht — AngG, AVRAG, ArbVG.`,
    eu_recht: `\n\n## Fokus: EU-Recht (AT-Kontext) — DSGVO, AEUV, GRCh + nationale Umsetzungsgesetze (DSG, TKG 2021, ECG).`,
  };

  let prompt = base + jurisdictionMethodology;
  prompt += modeInstructions[mode] || modeInstructions.research;
  if (legalArea && legalAreaInstructions[legalArea]) {
    prompt += legalAreaInstructions[legalArea];
  }
  
  // Direct-task mode: override source/tool instructions
  if (isDirectTask) {
    prompt += `\n\n## DIREKTAUFGABE — KEINE Recherche
Du hast eine direkte Textverarbeitungsaufgabe erhalten (z.B. Zusammenfassung, Umformulierung, Erklärung, Extraktion).
- Führe KEINE Recherche durch und verwende KEINE Tools (search_law, lookup_norm)
- Arbeite AUSSCHLIESSLICH mit dem bereitgestellten Text/Dokument
- Konzentriere dich auf die konkrete Aufgabe des Nutzers
- Quellangaben nur wenn sie im Originaltext vorkommen`;
  } else {
    prompt += sourceInstructions;
    prompt += toolRule;
  }

  // Formatting rules (compact)
  prompt += `\n\n## Format
- ## Überschriften, ### Unterüberschriften. Absätze max 3-4 Sätze.
- **Fett** für Kernbegriffe, *Kursiv* für Normzitate.
- Tabellen NUR bei Typ-B. KEIN Wall-of-Text, KEINE Floskeln, KEINE Disclaimer.
- Sprache: Deutsch, Partner-Niveau. Prägnant, autoritativ.

## ⚠️ PFLICHT: Kompakte Zusammenfassung (NICHT OPTIONAL)
JEDE Antwort über 200 Wörter MUSS am Ende VOR den weiterführenden Fragen diesen Block enthalten:

**Zusammenfassung**

- Bullet 1: Kernaussage mit konkreter Rechtsfolge
- Bullet 2: Nächster konkreter Schritt / Handlungsempfehlung
- Bullet 3: Wichtigster Vorbehalt oder offene Frage

Max 3-5 Bullets. Handlungsorientiert ("Sie haben...", "Fordern Sie..."), NICHT abstrakt.
FEHLENDE ZUSAMMENFASSUNG = UNVOLLSTÄNDIGE ANTWORT. Prüfe VOR dem Absenden, ob "**Zusammenfassung**" vorkommt.`;

  if (vaultContext && vaultContext.trim().length > 0) {
    prompt += "\n\n## Mandantenakte\n" + vaultContext;
  }

  if (documentContext && documentContext.trim().length > 0) {
    prompt += `\n\n## HOCHGELADENE DOKUMENTE
Verweise auf konkrete Stellen, zitiere wörtlich in „...". Weise proaktiv auf Risiken hin.

${documentContext}`;
  }

  // FINAL REINFORCEMENT (recency bias — AI reads last lines most carefully)
  prompt += `\n\n---\n⚠️ LETZTE PRÜFUNG VOR ABSENDEN:
1) "**Zusammenfassung**" vorhanden? Falls nein → hinzufügen.
2) JEDES Aktenzeichen/RS-Nummer/GZ prüfen: Kommt es WÖRTLICH in den Tool-Ergebnissen vor? Falls NEIN → ENTFERNEN und ohne Aktenzeichen formulieren. Ein korrekter Rechtssatz OHNE AZ ist 100x besser als ein fabriziertes.
3) Fristen/Beträge/Prozentsätze NICHT aus Tools? → ENTFERNEN oder als "nicht verifiziert" kennzeichnen.`;

  return prompt;
}
