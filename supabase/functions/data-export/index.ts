import { makeCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email;
    const sb = createClient(supabaseUrl, serviceKey);

    // 1. Profile
    const { data: profile } = await sb
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    // 2. Workspace memberships
    const { data: memberships } = await sb
      .from("workspace_members")
      .select("workspace_id, role, created_at")
      .eq("user_id", userId);

    const wsIds = (memberships || []).map((m: any) => m.workspace_id);

    // 3. Workspaces
    let workspaces: any[] = [];
    if (wsIds.length > 0) {
      const { data } = await sb.from("workspaces").select("id, name, created_at").in("id", wsIds);
      workspaces = data || [];
    }

    // 4. Chats
    let chats: any[] = [];
    if (wsIds.length > 0) {
      const { data } = await sb
        .from("chats")
        .select("id, title, mode, jurisdiction, sources, matter_id, created_at, updated_at, workspace_id")
        .in("workspace_id", wsIds)
        .eq("created_by", userId)
        .order("created_at", { ascending: false });
      chats = data || [];
    }

    // 5. Messages for user's chats
    const chatIds = chats.map((c: any) => c.id);
    let messages: any[] = [];
    if (chatIds.length > 0) {
      // Batch in chunks of 50 to avoid query limits
      for (let i = 0; i < chatIds.length; i += 50) {
        const batch = chatIds.slice(i, i + 50);
        const { data } = await sb
          .from("messages")
          .select("id, chat_id, role, content, created_at")
          .in("chat_id", batch)
          .order("created_at", { ascending: true });
        if (data) messages.push(...data);
      }
    }

    // 6. Citations for those messages
    const msgIds = messages.map((m: any) => m.id);
    let citations: any[] = [];
    if (msgIds.length > 0) {
      for (let i = 0; i < msgIds.length; i += 50) {
        const batch = msgIds.slice(i, i + 50);
        const { data } = await sb
          .from("citations")
          .select("id, message_id, provider, title, doc_ref, url, pinpoint, snippet, doc_date, created_at")
          .in("message_id", batch);
        if (data) citations.push(...data);
      }
    }

    // 7. Feedback
    const { data: feedback } = await sb
      .from("message_feedback")
      .select("id, message_id, rating, comment, metadata, created_at")
      .eq("user_id", userId);

    // 8. Files metadata (no actual file content)
    let files: any[] = [];
    if (wsIds.length > 0) {
      const { data } = await sb
        .from("files")
        .select("id, name, mime, size, chat_id, matter_id, workspace_id, created_at")
        .in("workspace_id", wsIds)
        .eq("uploaded_by", userId);
      files = data || [];
    }

    // 9. Audit logs
    let auditLogs: any[] = [];
    if (wsIds.length > 0) {
      const { data } = await sb
        .from("audit_logs")
        .select("id, action, resource_type, resource_id, metadata, created_at, workspace_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1000);
      auditLogs = data || [];
    }

    // 10. Usage ledger
    let usage: any[] = [];
    if (wsIds.length > 0) {
      const { data } = await sb
        .from("usage_ledger")
        .select("id, model, input_tokens, output_tokens, cost_estimate, chat_id, created_at, workspace_id")
        .in("workspace_id", wsIds)
        .order("created_at", { ascending: false })
        .limit(1000);
      usage = data || [];
    }

    // 11. Matters
    let matters: any[] = [];
    if (wsIds.length > 0) {
      const { data } = await sb
        .from("matters")
        .select("id, name, status, workspace_id, created_at")
        .in("workspace_id", wsIds);
      matters = data || [];
    }

    // 11b. Matter notes
    let matterNotes: any[] = [];
    if (wsIds.length > 0) {
      const { data } = await sb
        .from("matter_notes")
        .select("id, matter_id, content, created_by, workspace_id, created_at, updated_at")
        .in("workspace_id", wsIds)
        .eq("created_by", userId);
      matterNotes = data || [];
    }

    // 11c. Matter tags
    let matterTags: any[] = [];
    if (wsIds.length > 0) {
      const { data } = await sb
        .from("matter_tags")
        .select("id, matter_id, label, color, workspace_id, created_at")
        .in("workspace_id", wsIds);
      matterTags = data || [];
    }

    // 11d. Matter analyses
    let matterAnalyses: any[] = [];
    let matterAnalysisResults: any[] = [];
    if (wsIds.length > 0) {
      const { data } = await sb
        .from("matter_analyses")
        .select("id, matter_id, type, status, summary, workspace_id, created_at, updated_at")
        .in("workspace_id", wsIds);
      matterAnalyses = data || [];

      const analysisIds = (matterAnalyses || []).map((a: any) => a.id);
      if (analysisIds.length > 0) {
        for (let i = 0; i < analysisIds.length; i += 50) {
          const batch = analysisIds.slice(i, i + 50);
          const { data: results } = await sb
            .from("matter_analysis_results")
            .select("id, analysis_id, file_id, doc_date, doc_summary, file_name_suggestion, included, sort_order, created_at")
            .in("analysis_id", batch);
          if (results) matterAnalysisResults.push(...results);
        }
      }
    }

    // 12. Pseudonymization logs
    let pseudoLogs: any[] = [];
    if (wsIds.length > 0) {
      const { data } = await sb
        .from("pseudonymization_logs")
        .select("id, file_id, entities_found, workspace_id, created_at")
        .in("workspace_id", wsIds)
        .limit(500);
      pseudoLogs = data || [];
    }

    // 13. Referral data
    const [referralCodesRes, referralsRes] = await Promise.all([
      sb.from("referral_codes").select("*").eq("user_id", userId),
      sb.from("referrals").select("*").eq("referrer_id", userId),
    ]);

    const exportPayload = {
      _meta: {
        exported_at: new Date().toISOString(),
        format_version: "1.0",
        legal_basis: "Art. 15 & Art. 20 DSGVO",
        note: "Vollständiger Datenexport aller personenbezogenen Daten.",
      },
      user: {
        id: userId,
        email: userEmail,
      },
      profile: profile || null,
      workspace_memberships: memberships || [],
      workspaces,
      chats,
      messages,
      citations,
      feedback: feedback || [],
      files_metadata: files,
      audit_logs: auditLogs,
      usage_ledger: usage,
      matters,
      matter_notes: matterNotes,
      matter_tags: matterTags,
      matter_analyses: matterAnalyses,
      matter_analysis_results: matterAnalysisResults,
      pseudonymization_logs: pseudoLogs,
      referral_codes: referralCodesRes.data || [],
      referrals: referralsRes.data || [],
    };

    console.log(`[data-export] Export for user ${userId}: ${chats.length} chats, ${messages.length} messages, ${files.length} files`);

    return new Response(JSON.stringify(exportPayload, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("data-export error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
