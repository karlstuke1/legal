/**
 * Truncation-notice renderer
 *
 * When the Phase-2 LLM stream ends without a clean `finish_reason: "stop"`,
 * we append a German-language notice to the streamed message so the user
 * knows *why* the answer was cut short (safety filter, length limit,
 * gateway disconnect, …) instead of staring at half a sentence.
 *
 * Pure function, no runtime dependencies — imports cleanly into both the
 * Deno edge function and Node-based vitest tests.
 *
 * Invariant enforced by the caller: the notice is emitted exactly ONCE,
 * in the `done` branch of the stream pull loop. The chunk-parsing branch
 * only tracks `lastFinishReason`. This prevents the double-notice bug
 * where a `finish_reason: "length"` chunk followed immediately by
 * `done=true` would otherwise trigger the notice twice.
 */

// Rendered as a blockquote so the frontend's existing markdown styling
// gives it a subtle bordered callout appearance (border-l on the left,
// muted background) — clearly distinct from the answer prose without
// needing a separate component. Each notice stands on its own line to
// reset any enclosing list/paragraph context from a truncated response.
function callout(message: string): string {
  return `\n\n> ⚠️ ${message}`;
}

export function truncationNotice(reason: string | null | undefined): string {
  switch (reason) {
    case "length":
      return callout("**Antwort wegen Längenlimit gekürzt** — bitte gezielter nachfragen oder den letzten Punkt einzeln vertiefen.");
    case "content_filter":
    case "safety":
    case "SAFETY":
    case "RECITATION":
      return callout(`**Antwort vom Sicherheitsfilter gestoppt** (${reason}). Bitte Frage neutraler formulieren.`);
    case "tool_calls":
    case "function_call":
      // Shouldn't happen in Phase 2 but worth surfacing.
      return callout("**Antwort vorzeitig beendet** — Tool-Call im Antwortstream.");
    case "stream_error":
      return callout("**Verbindung zum Modell unterbrochen.** Bitte neu generieren.");
    case null:
    case undefined:
      return callout("**Antwort unerwartet beendet.** Keine Abschluss-Meldung vom Modell — bitte neu generieren.");
    default:
      return callout(`**Antwort vorzeitig beendet** (${reason}). Bitte neu generieren.`);
  }
}
