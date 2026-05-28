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

  it("does NOT render SourcesPanel on the welcome screen (messages.length === 0)", () => {
    // The welcome screen should stay clean — an empty sources sidebar
    // next to "Wie kann ich helfen?" is UX noise, not utility. The panel
    // mounts as soon as the first message is sent (messages.length > 0).
    // This was the user's specific complaint on 2026-04-24: panel visible
    // with empty state on welcome screen.
    const sourcesPanelIdx = source.indexOf("<SourcesPanel");
    expect(sourcesPanelIdx, "ChatPage must render a SourcesPanel").toBeGreaterThan(-1);

    // Grab a generous window of context before the JSX — the gate
    // expression lives on the same line or one line above.
    const contextBefore = source.slice(Math.max(0, sourcesPanelIdx - 200), sourcesPanelIdx);

    // Gate must reference messages.length > 0 specifically. `messages.length`
    // alone (truthy check on a number) would be a different behavior that
    // still renders on the welcome screen, so we assert the strict form.
    expect(contextBefore, "SourcesPanel must be gated on messages.length > 0").toMatch(/messages\.length\s*>\s*0/);

    // Exam mode should still be excluded (separate business rule).
    expect(contextBefore).toMatch(/mode\s*!==\s*"exam"/);
  });
});
