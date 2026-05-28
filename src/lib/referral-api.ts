import { supabase } from "@/integrations/supabase/client";

const REFERRAL_STORAGE_KEY = "ref_code";

export function storeReferralCode(code: string) {
  try {
    localStorage.setItem(REFERRAL_STORAGE_KEY, code.toUpperCase());
  } catch {}
}

export function getStoredReferralCode(): string | null {
  try {
    return localStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredReferralCode() {
  try {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {}
}

async function invokeReferral(action: string, params: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await supabase.functions.invoke("referral", {
    body: { action, ...params },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export async function generateReferralCode(): Promise<string> {
  const data = await invokeReferral("generate");
  return data.code;
}

export async function trackReferral(refCode: string) {
  const data = await invokeReferral("track", { ref_code: refCode });
  clearStoredReferralCode();
  return data;
}

export interface ReferralStats {
  total_referrals: number;
  converted: number;
  total_earnings_cents: number;
  paid_out_cents: number;
  referrals: Array<{
    id: string;
    status: string;
    created_at: string;
    converted_at: string | null;
  }>;
  payouts: Array<{
    amount_cents: number;
    currency: string;
    status: string;
    created_at: string;
  }>;
}

export async function getReferralStats(): Promise<ReferralStats> {
  return invokeReferral("stats");
}
