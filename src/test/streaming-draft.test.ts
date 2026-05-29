import { describe, expect, it } from "vitest";
import {
  getStreamingDraftState,
  hasRecoverableStreamingDraft,
  STREAM_DRAFT_SUFFIX,
  STREAM_INTERRUPTED_SUFFIX,
  stripStreamingDraftMarkers,
} from "@/lib/streaming-draft";
import type { ChatMessage } from "@/lib/types";

function assistant(text: string, createdAt = new Date().toISOString()): ChatMessage {
  return {
    id: crypto.randomUUID(),
    chat_id: crypto.randomUUID(),
    role: "assistant",
    content: { text },
    created_at: createdAt,
  } as ChatMessage;
}

describe("streaming draft helpers", () => {
  it("detects active and interrupted persisted draft markers", () => {
    expect(getStreamingDraftState(`Teilantwort${STREAM_DRAFT_SUFFIX}`)).toBe("active");
    expect(getStreamingDraftState(`Teilantwort${STREAM_INTERRUPTED_SUFFIX}`)).toBe("interrupted");
    expect(getStreamingDraftState("Fertige Antwort")).toBe(null);
  });

  it("strips persisted draft markers from rendered/copied answer text", () => {
    expect(stripStreamingDraftMarkers(`Teilantwort${STREAM_DRAFT_SUFFIX}`)).toBe("Teilantwort");
    expect(stripStreamingDraftMarkers(`Teilantwort${STREAM_INTERRUPTED_SUFFIX}`)).toBe("Teilantwort");
  });

  it("polls only recent draft-marked assistant messages for recovery", () => {
    const now = Date.parse("2026-05-29T10:00:00.000Z");
    const recent = assistant(`Teilantwort${STREAM_DRAFT_SUFFIX}`, "2026-05-29T09:58:00.000Z");
    const stale = assistant(`Alte Teilantwort${STREAM_DRAFT_SUFFIX}`, "2026-05-29T09:40:00.000Z");
    const final = assistant("Fertige Antwort", "2026-05-29T09:59:00.000Z");

    expect(hasRecoverableStreamingDraft([recent], now)).toBe(true);
    expect(hasRecoverableStreamingDraft([stale], now)).toBe(false);
    expect(hasRecoverableStreamingDraft([final], now)).toBe(false);
  });
});
