import { makeCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  extractMessageContent,
  openRouterChatCompletion,
  parseJsonObject,
  strictJsonSchema,
} from "../_shared/openrouter.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PSEUDONYMIZE_SCHEMA = strictJsonSchema("pseudonymize_result", {
  type: "object",
  properties: {
    pseudonymized_text: { type: "string" },
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          replacement: { type: "string" },
          category: { type: "string", enum: ["person", "company", "address", "phone", "email", "bank", "date", "other"] },
        },
        required: ["original", "replacement", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["pseudonymized_text", "entities"],
  additionalProperties: false,
});

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

  const supabaseUrl2 = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl2, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  try {
    const body = await req.json();
    const { file_id, workspace_id, text: rawText } = body as { file_id?: string; workspace_id?: string; text?: string };
    // Two input modes:
    //   A) file-based  → { file_id, workspace_id } — existing flow, full document parse
    //   B) text-based  → { text, workspace_id }    — fast inline pseudonymization for
    //                                                chat messages before they hit the LLM.
    //                                                Used by auto-pseudonymize-chat (RAO § 9 mitigation).
    const isTextMode = !file_id && typeof rawText === "string" && rawText.length > 0;

    if (!workspace_id || !UUID_RE.test(workspace_id)) {
      return new Response(JSON.stringify({ error: "Invalid workspace_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isTextMode && (!file_id || !UUID_RE.test(file_id))) {
      return new Response(JSON.stringify({ error: "Invalid file_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (isTextMode && rawText!.length > 20_000) {
      return new Response(JSON.stringify({ error: "Text too large (max 20k chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limiting: 10 requests per minute per user
    {
      const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
      const { count } = await supabase
        .from("rate_limit_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("endpoint", "pseudonymize")
        .gte("created_at", oneMinAgo);
      if (count && count >= 10) {
        return new Response(
          JSON.stringify({ error: "Zu viele Anfragen. Bitte warten Sie einen Moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      await supabase.from("rate_limit_log").insert({ user_id: userId, endpoint: "pseudonymize" });
    }

    // Verify workspace membership
    const { data: membership } = await supabase
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

    // Quota: file-mode counts against the monthly pseudonymizations_limit.
    // Text-mode (per chat message) is bounded by the per-minute rate-limit
    // above (10/min) — fine-grained enough to keep cost in check without
    // a separate plan tier.
    if (!isTextMode) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [planRes, usageRes] = await Promise.all([
        supabase
          .from("plans")
          .select("monthly_pseudonymizations_limit")
          .eq("workspace_id", workspace_id)
          .single(),
        supabase
          .from("pseudonymization_logs")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspace_id)
          .gte("created_at", startOfMonth.toISOString()),
      ]);

      const limit = (planRes.data as any)?.monthly_pseudonymizations_limit || 5;
      const used = usageRes.count || 0;

      if (used >= limit) {
        return new Response(
          JSON.stringify({
            error: `Pseudonymisierungs-Limit erreicht (${used}/${limit}). Bitte upgraden Sie Ihren Plan.`,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch file (file-mode only — text-mode uses rawText directly).
    const { data: file } = isTextMode
      ? { data: null as { name: string; mime: string; storage_path: string } | null }
      : await supabase
          .from("files")
          .select("name, mime, storage_path")
          .eq("id", file_id)
          .single();

    if (!isTextMode && !file) {
      return new Response(JSON.stringify({ error: "Datei nicht gefunden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download file content (file-mode only).
    const fileData = isTextMode
      ? null
      : (await supabase.storage.from("workspace-files").download((file as any).storage_path)).data;

    if (!isTextMode && !fileData) {
      return new Response(JSON.stringify({ error: "Datei konnte nicht geladen werden" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let text = isTextMode ? rawText! : "";
    // File-mode only: extract text by MIME. Text-mode skips this block entirely.
    if (!isTextMode && (file as any).mime === "text/plain") {
      text = await fileData!.text();
    } else if (!isTextMode && (file as any).mime === "application/pdf") {
      const raw = await fileData!.text();
      const matches = raw.match(/\(([^)]+)\)/g);
      text = matches ? matches.map((m: string) => m.slice(1, -1)).join(" ").slice(0, 15000) : "";
    } else if (
      !isTextMode &&
      (file as any).mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const arrayBuffer = await fileData!.arrayBuffer();
      const rawStr = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(arrayBuffer));
      const textMatches = rawStr.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
      text = textMatches
        ? textMatches.map((m: string) => m.replace(/<[^>]+>/g, "")).join(" ").slice(0, 15000)
        : "";
    }

    if (!text.trim()) {
      return new Response(
        JSON.stringify({ error: "Kein Text extrahierbar aus dieser Datei." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call AI for pseudonymization
    const aiResponse = await openRouterChatCompletion({
      messages: [
        {
          role: "system",
          content: `Du bist ein Pseudonymisierungs-Experte. Ersetze im folgenden Text alle personenbezogenen Daten durch Platzhalter:
- Natürliche Personen: [Person A], [Person B], etc.
- Unternehmen: [Unternehmen A], [Unternehmen B], etc.
- Adressen: [Adresse A], [Adresse B], etc.
- Telefonnummern: [Telefon A], etc.
- E-Mail-Adressen: [E-Mail A], etc.
- Bankdaten (IBAN etc.): [IBAN A], etc.
- Geburtsdaten: [Geburtsdatum A], etc.

Behalte den restlichen Text EXAKT bei. Gib ZUSÄTZLICH eine Liste der gefundenen Entitäten zurück.`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      responseFormat: PSEUDONYMIZE_SCHEMA,
      maxTokens: 12000,
      reasoningEffort: "low",
      requireParameters: true,
    });

    if (!aiResponse.ok) {
      const t = await aiResponse.text();
      console.error("AI error:", aiResponse.status, t);
      return new Response(JSON.stringify({ error: "KI-Fehler bei der Pseudonymisierung" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const result = parseJsonObject(extractMessageContent(aiData));

    // Log pseudonymization. Text-mode is per-message and would flood the
    // log table at chat scale — only persist file-mode runs (which are
    // user-driven, low-frequency, and quota-bound).
    if (!isTextMode) {
      await supabase.from("pseudonymization_logs").insert({
        workspace_id,
        file_id,
        original_text: null,
        pseudonymized_text: result.pseudonymized_text?.slice(0, 5000),
        entities_found: result.entities || [],
      });
    }

    return new Response(
      JSON.stringify({
        pseudonymized_text: result.pseudonymized_text,
        entities: result.entities || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("pseudonymize error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
