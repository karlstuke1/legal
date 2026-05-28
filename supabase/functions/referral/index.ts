import { makeCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

Deno.serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const { action, ...params } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await userClient.auth.getUser();
      userId = data?.user?.id ?? null;
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // === GENERATE ===
    if (action === "generate") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await admin
        .from("referral_codes").select("code").eq("user_id", userId).maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ code: existing.code }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let code = "";
      for (let i = 0; i < 5; i++) {
        code = generateCode();
        const { data: clash } = await admin
          .from("referral_codes").select("id").eq("code", code).maybeSingle();
        if (!clash) break;
      }

      const { error } = await admin.from("referral_codes").insert({ user_id: userId, code });
      if (error) throw error;

      return new Response(JSON.stringify({ code }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === TRACK ===
    if (action === "track") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { ref_code } = params;
      if (!ref_code || typeof ref_code !== "string") {
        return new Response(JSON.stringify({ error: "Missing ref_code" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: refCode } = await admin
        .from("referral_codes").select("user_id").eq("code", ref_code.toUpperCase()).maybeSingle();

      if (!refCode) {
        return new Response(JSON.stringify({ error: "Invalid referral code" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (refCode.user_id === userId) {
        return new Response(JSON.stringify({ error: "Self-referral not allowed" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existingRef } = await admin
        .from("referrals").select("id").eq("referred_user_id", userId).maybeSingle();

      if (existingRef) {
        return new Response(JSON.stringify({ ok: true, already_tracked: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await admin.from("referrals").insert({
        referrer_id: refCode.user_id, referred_user_id: userId, status: "pending",
      });
      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === STATS ===
    if (action === "stats") {
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: referrals } = await admin
        .from("referrals").select("id, status, created_at, converted_at")
        .eq("referrer_id", userId).order("created_at", { ascending: false });

      const { data: payouts } = await admin
        .from("referral_payouts").select("amount_cents, currency, status, created_at")
        .eq("referrer_id", userId).order("created_at", { ascending: false });

      const totalReferrals = referrals?.length ?? 0;
      const converted = referrals?.filter((r) => r.status === "converted" || r.status === "paid").length ?? 0;
      const totalEarningsCents = payouts?.reduce((sum, p) => sum + p.amount_cents, 0) ?? 0;
      const paidOutCents = payouts?.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount_cents, 0) ?? 0;

      return new Response(
        JSON.stringify({
          total_referrals: totalReferrals, converted,
          total_earnings_cents: totalEarningsCents, paid_out_cents: paidOutCents,
          referrals: referrals ?? [], payouts: payouts ?? [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === CONVERT ===
    if (action === "convert") {
      const { referred_user_id, amount_cents, currency = "eur" } = params;

      if (!referred_user_id || !amount_cents) {
        return new Response(JSON.stringify({ error: "Missing params" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: referral } = await admin
        .from("referrals").select("id, referrer_id")
        .eq("referred_user_id", referred_user_id).maybeSingle();

      if (!referral) {
        return new Response(JSON.stringify({ ok: false, reason: "No referral found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await admin.from("referrals")
        .update({ status: "converted", converted_at: new Date().toISOString() })
        .eq("id", referral.id);

      const commission = Math.round(amount_cents * 0.2);
      await admin.from("referral_payouts").insert({
        referrer_id: referral.referrer_id, referral_id: referral.id,
        amount_cents: commission, currency, status: "pending",
      });

      return new Response(
        JSON.stringify({ ok: true, commission_cents: commission }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const corsHeaders = makeCorsHeaders(req);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
