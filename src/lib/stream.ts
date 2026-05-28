import { supabase, SUPABASE_URL_RESOLVED, SUPABASE_KEY_RESOLVED } from "@/lib/supabase-safe";

const CHAT_URL = `${SUPABASE_URL_RESOLVED}/functions/v1/chat`;

interface StreamChatParams {
  messages: { role: string; content: string }[];
  mode: string;
  jurisdiction: string[];
  sources: string[];
  sourceContext?: string;
  sourceItems?: {
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
  }[];
  documentContext?: string;
  legalArea?: string;
  vaultContext?: string;
  workspaceId?: string;
  chatId?: string;
  messageId?: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
  onToolStart?: (name: string, args: any) => void;
  onToolDone?: (name: string, count: number, sources?: any[]) => void;
  onModeSwitch?: (from: string, to: string, label: string) => void;
  /** Numbered source map for Harvey-style [Quelle N] citation rendering.
   *  Emitted by the server BEFORE any text chunks so the frontend has
   *  the index→URL map ready when it post-processes the response. */
  onSourceMap?: (sources: { index: number; provider: string; title: string; url: string; doc_ref?: string; evidence_status?: "verified_document" | "search_utility" | "fallback" }[]) => void;
  signal?: AbortSignal;
}

/**
 * Get a valid auth token, refreshing the session if needed.
 * Returns null if no authenticated session is available.
 */
async function getAuthToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      // Check if token expires within the next 60 seconds
      const expiresAt = data.session.expires_at;
      const nowSec = Math.floor(Date.now() / 1000);
      if (expiresAt && expiresAt - nowSec < 60) {
        // Token is about to expire — refresh proactively
        console.info("[stream] Token expiring soon, refreshing session...");
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (!error && refreshed.session?.access_token) {
          return refreshed.session.access_token;
        }
        console.warn("[stream] Session refresh failed, using current token:", error?.message);
      }
      return data.session.access_token;
    }

    // No session — try refreshing (might have a valid refresh token in storage)
    console.info("[stream] No active session, attempting refresh...");
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && refreshed.session?.access_token) {
      return refreshed.session.access_token;
    }

    console.warn("[stream] No valid session available:", error?.message);
    return null;
  } catch (e) {
    console.error("[stream] getAuthToken error:", e);
    return null;
  }
}

/**
 * Force a session refresh and return a fresh token.
 * Used after receiving a 401/403 to recover from stale tokens.
 */
async function forceRefreshToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) {
      console.info("[stream] Session refreshed successfully after auth error");
      return data.session.access_token;
    }
    console.warn("[stream] Force refresh failed:", error?.message);
    return null;
  } catch (e) {
    console.error("[stream] forceRefreshToken error:", e);
    return null;
  }
}

export async function streamChat({ messages, mode, jurisdiction, sources, sourceContext, sourceItems, documentContext, legalArea, vaultContext, workspaceId, chatId, messageId, onDelta, onDone, onError, onToolStart, onToolDone, onModeSwitch, onSourceMap, signal }: StreamChatParams) {
  const MAX_RETRIES = 2;
  let lastError = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) return;

    // On retry after auth error, force refresh the token
    const token = attempt > 0 && (lastError.includes("Unauthorized") || lastError.includes("401") || lastError.includes("403"))
      ? await forceRefreshToken()
      : await getAuthToken();

    if (!token) {
      onError("Sitzung abgelaufen. Bitte melden Sie sich erneut an.");
      return;
    }

    let resp: Response;
    try {
      resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_KEY_RESOLVED,
        },
        body: JSON.stringify({ messages, mode, jurisdiction, sources, sourceContext, source_items: sourceItems, document_context: documentContext, legal_area: legalArea, vault_context: vaultContext, workspace_id: workspaceId, chat_id: chatId, message_id: messageId }),
        signal,
      });
    } catch (e: any) {
      if (e.name === "AbortError") throw e;
      lastError = "Netzwerkfehler: " + (e.message || "Verbindung fehlgeschlagen");
      console.error(`[stream] Attempt ${attempt + 1} network error:`, e);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      onError(lastError);
      return;
    }

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({ error: "Verbindungsfehler" }));
      lastError = errorData.error || `Fehler ${resp.status}`;
      console.error(`[stream] Attempt ${attempt + 1} HTTP error:`, resp.status, lastError);

      // Auth errors: retry with refreshed token
      if ((resp.status === 401 || resp.status === 403) && attempt < MAX_RETRIES) {
        console.info(`[stream] Auth error ${resp.status}, will refresh token and retry...`);
        lastError = `Unauthorized`;
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Server errors: retry with backoff
      if (resp.status >= 500 && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      // For auth errors that exhausted retries, give a clear message
      if (resp.status === 401 || resp.status === 403) {
        onError("Sitzung abgelaufen. Bitte laden Sie die Seite neu oder melden Sie sich erneut an.");
        return;
      }

      onError(lastError);
      return;
    }

    if (!resp.body) {
      lastError = "Keine Antwort vom Server erhalten";
      console.error(`[stream] Attempt ${attempt + 1}: no response body`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      onError(lastError);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let streamDone = false;
    let receivedContent = false;

    try {
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            // Handle custom events from backend
            if (parsed.type === "mode_switch") {
              onModeSwitch?.(parsed.from, parsed.to, parsed.label);
              continue;
            }
            if (parsed.type === "tool_start") {
              onToolStart?.(parsed.name, parsed.args);
              continue;
            }
            if (parsed.type === "tool_done") {
              onToolDone?.(parsed.name, parsed.count || 0, parsed.sources);
              continue;
            }
            if (parsed.type === "source_map") {
              onSourceMap?.(parsed.sources || []);
              continue;
            }
            // Check for error in stream
            if (parsed.error) {
              console.error("[stream] Error in SSE data:", parsed.error);
              lastError = typeof parsed.error === "string" ? parsed.error : parsed.error.message || "KI-Fehler";
              continue;
            }
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              receivedContent = true;
              onDelta(content);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              receivedContent = true;
              onDelta(content);
            }
          } catch { /* ignore */ }
        }
      }

      // If we got content, success
      if (receivedContent) {
        onDone();
        return;
      }

      // No content received — retry
      lastError = lastError || "Leere Antwort vom KI-Modell erhalten";
      console.warn(`[stream] Attempt ${attempt + 1}: stream completed but no content received`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }

      onError(lastError);
      return;
    } catch (e: any) {
      if (e.name === "AbortError") throw e;
      lastError = "Verbindung unterbrochen — bitte erneut versuchen";
      console.error(`[stream] Attempt ${attempt + 1} stream read error:`, e);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      onError(lastError);
      return;
    }
  }
}
