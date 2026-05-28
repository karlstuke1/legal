/**
 * Shared helper for calling Supabase Edge Functions via direct fetch.
 * Uses the same auth-based mechanism as stream.ts to avoid
 * FunctionsFetchError issues with supabase.functions.invoke().
 */

import { supabase } from "@/lib/supabase-safe";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function getAuthToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      const expiresAt = data.session.expires_at;
      const nowSec = Math.floor(Date.now() / 1000);
      if (expiresAt && expiresAt - nowSec < 60) {
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (!error && refreshed.session?.access_token) {
          return refreshed.session.access_token;
        }
      }
      return data.session.access_token;
    }
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && refreshed.session?.access_token) {
      return refreshed.session.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Call an edge function by name and return the parsed JSON response.
 * Retries once on auth errors with a refreshed token.
 */
export async function invokeEdgeFunction<T = any>(
  functionName: string,
  body: Record<string, unknown>,
  options?: { timeoutMs?: number }
): Promise<T> {
  const url = `${SUPABASE_URL}/functions/v1/${functionName}`;
  const timeoutMs = options?.timeoutMs ?? 30000;

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAuthToken();
    if (!token) throw new Error("Nicht authentifiziert");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (resp.status === 401 || resp.status === 403) {
        if (attempt === 0) {
          // Refresh and retry
          const { data } = await supabase.auth.refreshSession();
          if (data.session?.access_token) continue;
        }
        throw new Error(`Auth error ${resp.status}`);
      }

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        throw new Error(`Edge function ${functionName} returned ${resp.status}: ${errBody.slice(0, 200)}`);
      }

      return await resp.json() as T;
    } catch (e: any) {
      clearTimeout(timer);
      if (e.name === "AbortError") {
        throw new Error(`Edge function ${functionName} timed out after ${timeoutMs}ms`);
      }
      if (attempt === 0 && (e.message?.includes("401") || e.message?.includes("403"))) {
        continue;
      }
      throw e;
    }
  }

  throw new Error(`Edge function ${functionName} failed after retries`);
}
