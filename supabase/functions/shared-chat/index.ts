import { makeCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token || token.length < 10) {
      return new Response(JSON.stringify({ error: "Ungültiger Token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Look up the shared chat
    const { data: share, error: shareErr } = await sb
      .from("shared_chats")
      .select("chat_id, is_active, expires_at")
      .eq("token", token)
      .single();

    if (shareErr || !share) {
      return new Response(JSON.stringify({ error: "Dieser Link ist ungültig." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!share.is_active) {
      return new Response(JSON.stringify({ error: "Dieser Link wurde deaktiviert." }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Dieser Link ist abgelaufen." }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch chat title
    const { data: chat } = await sb
      .from("chats")
      .select("title")
      .eq("id", share.chat_id)
      .single();

    // Fetch messages
    const { data: messages } = await sb
      .from("messages")
      .select("id, role, content, created_at")
      .eq("chat_id", share.chat_id)
      .order("created_at", { ascending: true })
      .limit(200);

    return new Response(
      JSON.stringify({
        title: chat?.title || "Recherche",
        messages: messages || [],
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("[shared-chat] Error:", e);
    return new Response(JSON.stringify({ error: "Interner Fehler" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
