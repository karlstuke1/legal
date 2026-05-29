import type { ChatMessage } from "@/lib/types";

export const STREAM_DRAFT_SUFFIX = "\n\n*Antwort wird noch erstellt. Falls die Seite neu geladen wurde, kann dieser Stand unvollständig sein.*";
export const STREAM_INTERRUPTED_SUFFIX = "\n\n*Antwort wurde unterbrochen. Bitte ggf. neu generieren.*";

const ACTIVE_MARKER = "Antwort wird noch erstellt";
const INTERRUPTED_MARKER = "Antwort wurde unterbrochen";
const RECOVERY_WINDOW_MS = 5 * 60 * 1000;

export type StreamingDraftState = "active" | "interrupted" | null;

export function getStreamingDraftState(text: string | undefined | null): StreamingDraftState {
  if (!text) return null;
  if (text.includes(ACTIVE_MARKER)) return "active";
  if (text.includes(INTERRUPTED_MARKER)) return "interrupted";
  return null;
}

export function stripStreamingDraftMarkers(text: string): string {
  return text
    .replace(STREAM_DRAFT_SUFFIX, "")
    .replace(STREAM_INTERRUPTED_SUFFIX, "")
    .replace(/\n\n\*Antwort wird noch erstellt\.[\s\S]*?\*$/m, "")
    .replace(/\n\n\*Antwort wurde unterbrochen\.[\s\S]*?\*$/m, "")
    .trimEnd();
}

export function hasRecoverableStreamingDraft(messages: ChatMessage[], now = Date.now()): boolean {
  return messages.some((msg) => {
    if (msg.role !== "assistant") return false;
    if (!getStreamingDraftState(msg.content?.text)) return false;
    const createdAt = Date.parse(msg.created_at || "");
    if (!Number.isFinite(createdAt)) return true;
    return now - createdAt <= RECOVERY_WINDOW_MS;
  });
}
