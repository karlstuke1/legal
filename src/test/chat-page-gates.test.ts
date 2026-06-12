import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * UI state-transition regressions. These aren't component tests (ChatPage
 * has too many runtime dependencies to mount cleanly here) — they're
 * source-level structural guards that catch the specific *kind* of bug
 * I've historically shipped by accident: a gate condition being
 * removed or loosened. If a future refactor trips one of these, whoever
 * breaks it gets a failing test immediately instead of the user seeing
 * the regression in production.
 */

describe("ChatPage state-transition gates", () => {
  const source = readFileSync(
    resolve(__dirname, "../pages/ChatPage.tsx"),
    "utf8",
  );

  it("does NOT render the fixed SourcesPanel anymore (sources are inline + per-answer sheet)", () => {
    // The right-side panel was replaced by inline citation labels plus the
    // per-answer "Quellen (N)" sheet (MessageSourcesSheet). Re-introducing
    // the fixed panel would duplicate the inline citations and resurrect
    // the stale-on-follow-up bug it had.
    expect(source).not.toContain("<SourcesPanel");
    expect(source).not.toMatch(/import\s*\{[^}]*SourcesPanel[^}]*\}\s*from/);
  });
});

describe("MessageBubble per-answer sources gates", () => {
  const source = readFileSync(
    resolve(__dirname, "../components/chat/MessageBubble.tsx"),
    "utf8",
  );

  it("renders the sources sheet only when the message actually has sources", () => {
    // No "Quellen (0)" noise under answers without retrieval (exam mode,
    // drafts, plain conversational replies).
    const sheetIdx = source.indexOf("<MessageSourcesSheet");
    expect(sheetIdx, "MessageBubble must render a MessageSourcesSheet").toBeGreaterThan(-1);
    const contextBefore = source.slice(Math.max(0, sheetIdx - 200), sheetIdx);
    expect(contextBefore, "sheet must be gated on sourceResults.length > 0").toMatch(/sourceResults\.length\s*>\s*0/);
  });
});

describe("MessageSourcesSheet internal gate", () => {
  const source = readFileSync(
    resolve(__dirname, "../components/chat/MessageSourcesSheet.tsx"),
    "utf8",
  );

  it("returns null when the normalized source count is zero", () => {
    // Groups can exist while every result is deduped/empty — the count
    // check uses the same normalization as the body, so trigger label
    // and sheet content can never disagree.
    expect(source).toMatch(/totalResults\s*===\s*0\)\s*return null/);
  });
});

describe("use-chat-send follow-up source sync", () => {
  const source = readFileSync(
    resolve(__dirname, "../hooks/use-chat-send.ts"),
    "utf8",
  );

  it("onDone pushes the merged source groups into sourceResults (guarded by chat id)", () => {
    // Regression for the tester-reported bug: follow-up answers' sources
    // (especially server-seeded ones) only landed in sourceResultsMap and
    // every consumer of sourceResults kept showing the previous turn.
    const idx = source.indexOf("setSourceResults(allSourceGroups)");
    expect(idx, "onDone must sync sourceResults with allSourceGroups").toBeGreaterThan(-1);
    const contextBefore = source.slice(Math.max(0, idx - 300), idx);
    expect(contextBefore, "the sync must keep the stale-chat guard").toMatch(
      /activeChatIdRef\.current\s*===\s*currentChatId/,
    );
  });
});
