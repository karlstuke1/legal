import { makeCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json();
  const { action } = body;

  // --- VALIDATE TOKEN (public) ---
  if (action === "validate") {
    const { token } = body;
    if (!token || typeof token !== "string" || token.length > 128) {
      return new Response(JSON.stringify({ error: "Token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: inv, error } = await supabaseAdmin
      .from("workspace_invitations")
      .select("*, workspaces(name)")
      .eq("token", token)
      .eq("status", "pending")
      .single();

    if (error || !inv) {
      return new Response(
        JSON.stringify({ error: "Einladung ungültig oder abgelaufen." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check expiry
    if (new Date(inv.expires_at) < new Date()) {
      await supabaseAdmin
        .from("workspace_invitations")
        .update({ status: "expired" })
        .eq("id", inv.id);
      return new Response(
        JSON.stringify({ error: "Einladung abgelaufen." }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        workspace_name: (inv as any).workspaces?.name || "Workspace",
        email: inv.email,
        role: inv.role,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // --- ACCEPT INVITATION (authenticated) ---
  if (action === "accept") {
    const { token } = body;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: claimsErr } = await userClient.auth.getUser();
    if (claimsErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { data: inv, error: invErr } = await supabaseAdmin
      .from("workspace_invitations")
      .select("*")
      .eq("token", token)
      .eq("status", "pending")
      .single();

    if (invErr || !inv) {
      return new Response(
        JSON.stringify({ error: "Einladung ungültig." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (new Date(inv.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Einladung abgelaufen." }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Add user to workspace
    const { error: memberErr } = await supabaseAdmin
      .from("workspace_members")
      .insert({
        workspace_id: inv.workspace_id,
        user_id: userId,
        role: inv.role,
      });

    if (memberErr) {
      // Might already be a member
      if (memberErr.code === "23505") {
        // Duplicate — already member, just accept
      } else {
        return new Response(
          JSON.stringify({ error: "Fehler beim Beitritt zum Workspace." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Mark invitation as accepted
    await supabaseAdmin
      .from("workspace_invitations")
      .update({ status: "accepted" })
      .eq("id", inv.id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // --- CREATE INVITATION (authenticated, admin/owner) ---
  const { workspace_id, email, role } = body;

  // Validate email format and length
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== "string" || email.length > 255 || !EMAIL_RE.test(email)) {
    return new Response(JSON.stringify({ error: "Ungültige E-Mail-Adresse." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate role enum
  const VALID_ROLES = ["owner", "admin", "member", "viewer"];
  if (role && !VALID_ROLES.includes(role)) {
    return new Response(JSON.stringify({ error: "Ungültige Rolle." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate workspace_id UUID
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!workspace_id || !UUID_RE.test(workspace_id)) {
    return new Response(JSON.stringify({ error: "Ungültige Workspace-ID." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData2, error: claimsErr } = await userClient.auth.getUser();
  if (claimsErr || !userData2?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData2.user.id;

  // Check role
  const { data: wsRole } = await supabaseAdmin.rpc("get_workspace_role", {
    _user_id: userId,
    _workspace_id: workspace_id,
  });

  if (!wsRole || !["owner", "admin"].includes(wsRole)) {
    return new Response(JSON.stringify({ error: "Keine Berechtigung." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check seats limit
  const { data: plan } = await supabaseAdmin
    .from("plans")
    .select("seats_limit")
    .eq("workspace_id", workspace_id)
    .single();

  const { count: memberCount } = await supabaseAdmin
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace_id);

  const { count: pendingCount } = await supabaseAdmin
    .from("workspace_invitations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace_id)
    .eq("status", "pending");

  const seatsLimit = plan?.seats_limit || 2;
  const totalUsed = (memberCount || 0) + (pendingCount || 0);

  if (totalUsed >= seatsLimit) {
    return new Response(
      JSON.stringify({ error: `Platz-Limit erreicht (${seatsLimit}). Bitte upgraden Sie Ihren Plan.` }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Create invitation
  const { data: invitation, error: invErr } = await supabaseAdmin
    .from("workspace_invitations")
    .insert({
      workspace_id,
      email,
      role: role || "member",
      invited_by: userId,
    })
    .select("token")
    .single();

  if (invErr) {
    return new Response(
      JSON.stringify({ error: "Einladung konnte nicht erstellt werden." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // TODO: Send email via Lovable API with invite link
  // For now, return the token so the frontend can show the link
  return new Response(
    JSON.stringify({
      success: true,
      token: invitation.token,
      invite_url: `${req.headers.get("origin") || ""}/invite/${invitation.token}`,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
