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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getUser();
    if (claimsError || !claimsData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.user.id;
    const sb = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's workspaces where they are owner
    const { data: ownedWorkspaces } = await sb
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .eq("role", "owner");

    const ownedWsIds = (ownedWorkspaces || []).map((w: any) => w.workspace_id);

    // Get all workspaces the user is a member of
    const { data: allMemberships } = await sb
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId);

    const allWsIds = (allMemberships || []).map((w: any) => w.workspace_id);

    // Delete in order: messages -> chats -> files -> matters -> workspace data -> profile -> workspace -> auth
    for (const wsId of allWsIds) {
      // Get chats in workspace
      const { data: chats } = await sb.from("chats").select("id").eq("workspace_id", wsId);
      const chatIds = (chats || []).map((c: any) => c.id);

      if (chatIds.length > 0) {
        // Delete messages and citations for these chats
        for (const chatId of chatIds) {
          const { data: msgs } = await sb.from("messages").select("id").eq("chat_id", chatId);
          const msgIds = (msgs || []).map((m: any) => m.id);
          if (msgIds.length > 0) {
            await sb.from("citations").delete().in("message_id", msgIds);
            await sb.from("message_feedback").delete().in("message_id", msgIds);
            await sb.from("usage_ledger").delete().in("message_id", msgIds);
          }
          await sb.from("messages").delete().eq("chat_id", chatId);
        }
        await sb.from("chats").delete().eq("workspace_id", wsId);
      }

      // Delete files
      await sb.from("files").delete().eq("workspace_id", wsId);

      // Delete matter data
      const { data: matters } = await sb.from("matters").select("id").eq("workspace_id", wsId);
      if (matters && matters.length > 0) {
        const matterIds = matters.map((m: any) => m.id);
        await sb.from("matter_notes").delete().eq("workspace_id", wsId);
        await sb.from("matter_tags").delete().eq("workspace_id", wsId);
        // Delete analysis results and analyses
        const { data: analyses } = await sb.from("matter_analyses").select("id").eq("workspace_id", wsId);
        if (analyses && analyses.length > 0) {
          const analysisIds = analyses.map((a: any) => a.id);
          await sb.from("matter_analysis_results").delete().in("analysis_id", analysisIds);
        }
        await sb.from("matter_analyses").delete().eq("workspace_id", wsId);
        await sb.from("matters").delete().eq("workspace_id", wsId);
      }

      // Delete pseudonymization logs
      await sb.from("pseudonymization_logs").delete().eq("workspace_id", wsId);

      // Delete usage and retrieval logs
      await sb.from("usage_ledger").delete().eq("workspace_id", wsId);

      // Delete audit logs
      await sb.from("audit_logs").delete().eq("workspace_id", wsId);

      // Delete workspace-scoped legal documents
      await sb.from("legal_documents").delete().eq("workspace_id", wsId);

      // Delete workspace invitations
      await sb.from("workspace_invitations").delete().eq("workspace_id", wsId);

      // Delete plans (only for owned workspaces)
      if (ownedWsIds.includes(wsId)) {
        await sb.from("plans").delete().eq("workspace_id", wsId);
      }
    }

    // Delete retrieval logs linked to user's messages
    if (allWsIds.length > 0) {
      for (const wsId of allWsIds) {
        const { data: chats } = await sb.from("chats").select("id").eq("workspace_id", wsId).eq("created_by", userId);
        const chatIds = (chats || []).map((c: any) => c.id);
        if (chatIds.length > 0) {
          for (const chatId of chatIds) {
            const { data: msgs } = await sb.from("messages").select("id").eq("chat_id", chatId);
            const msgIds = (msgs || []).map((m: any) => m.id);
            if (msgIds.length > 0) {
              await sb.from("retrieval_logs").delete().in("message_id", msgIds);
            }
          }
        }
      }
    }

    // Remove workspace memberships
    await sb.from("workspace_members").delete().eq("user_id", userId);

    // Delete owned workspaces
    if (ownedWsIds.length > 0) {
      await sb.from("workspaces").delete().in("id", ownedWsIds);
    }

    // Delete profile
    await sb.from("profiles").delete().eq("user_id", userId);

    // Delete user roles
    await sb.from("user_roles").delete().eq("user_id", userId);

    // Delete referral data
    const { data: userReferrals } = await sb.from("referrals").select("id").eq("referrer_id", userId);
    if (userReferrals && userReferrals.length > 0) {
      const refIds = userReferrals.map((r: any) => r.id);
      await sb.from("referral_payouts").delete().in("referral_id", refIds);
    }
    await sb.from("referral_payouts").delete().eq("referrer_id", userId);
    await sb.from("referrals").delete().eq("referrer_id", userId);
    await sb.from("referrals").delete().eq("referred_user_id", userId);
    await sb.from("referral_codes").delete().eq("user_id", userId);

    // Delete audit logs without workspace (user-level)
    await sb.from("audit_logs").delete().eq("user_id", userId).is("workspace_id", null);

    // Delete the auth user
    const { error: deleteError } = await sb.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Failed to delete auth user:", deleteError);
      return new Response(
        JSON.stringify({ error: "Kontodaten teilweise gelöscht, Auth-Löschung fehlgeschlagen." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[delete-account] User ${userId} fully deleted`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("delete-account error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
