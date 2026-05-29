import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { truncationNotice } from "../../supabase/functions/chat/truncation-notice";

describe("truncationNotice — renders a specific German notice for each cause", () => {
  it("length: hints at narrowing the question", () => {
    const out = truncationNotice("length");
    expect(out).toContain("Längenlimit");
    expect(out).toContain("gezielter nachfragen");
  });

  it("safety-family reasons produce the filter notice (one arm per variant)", () => {
    for (const reason of ["content_filter", "safety", "SAFETY", "RECITATION"]) {
      const out = truncationNotice(reason);
      expect(out).toContain("Sicherheitsfilter");
      expect(out).toContain(reason);
      expect(out).toContain("neutraler formulieren");
    }
  });

  it("stream_error tells the user to retry", () => {
    const out = truncationNotice("stream_error");
    expect(out).toContain("Verbindung");
    expect(out).toContain("neu generieren");
  });

  it("tool-call reasons surface a distinct message", () => {
    expect(truncationNotice("tool_calls")).toContain("Tool-Call");
    expect(truncationNotice("function_call")).toContain("Tool-Call");
  });

  it("null / undefined → 'unerwartet beendet' with retry prompt", () => {
    for (const reason of [null, undefined] as const) {
      const out = truncationNotice(reason);
      expect(out).toContain("unerwartet beendet");
      expect(out).toContain("neu generieren");
    }
  });

  it("unknown reasons fall through with the raw reason visible", () => {
    const out = truncationNotice("weird_future_reason_xyz");
    expect(out).toContain("weird_future_reason_xyz");
    expect(out).toContain("vorzeitig beendet");
  });

  it("every notice starts with a blank line so it separates from prior content", () => {
    for (const reason of ["length", "safety", "stream_error", null, "other"]) {
      expect(truncationNotice(reason).startsWith("\n\n")).toBe(true);
    }
  });

  it("every notice uses the ⚠️ marker for consistent UI rendering", () => {
    for (const reason of ["length", "safety", "content_filter", "stream_error", null, "tool_calls", "xyz"]) {
      expect(truncationNotice(reason)).toContain("⚠️");
    }
  });
});

describe("chat stream handler — single-emission invariant", () => {
  // Regression guard for the double-notice bug: when a chunk with
  // finish_reason: "length" was parsed, the old code called sendNotice()
  // in the parse branch AND again in the done branch. Users saw the
  // warning twice. Invariant: sendNotice for truncationNotice(reason)
  // must be called from exactly one place — the done branch.
  it("invokes sendNotice(truncationNotice(…)) only inside the done / catch branches, never during chunk parsing", () => {
    const source = readFileSync(
      resolve(__dirname, "../../supabase/functions/chat/index.ts"),
      "utf8",
    );

    // Every call site of sendNotice with truncationNotice as argument.
    const callSites = Array.from(source.matchAll(/sendNotice\s*\([^)]*truncationNotice\s*\([^)]*\)\s*\)/g));
    expect(callSites.length).toBeGreaterThanOrEqual(2); // done + catch

    // None of those call sites may sit inside the chunk-parsing block
    // (the one guarded by `for (const line of text.split("\n"))`).
    const parseBlockStart = source.indexOf('for (const line of text.split("\\n"))');
    const parseBlockEnd = source.indexOf("/* ignore parse errors on partial chunks */");
    expect(parseBlockStart).toBeGreaterThan(0);
    expect(parseBlockEnd).toBeGreaterThan(parseBlockStart);

    for (const m of callSites) {
      const pos = m.index ?? -1;
      const inParseBlock = pos >= parseBlockStart && pos <= parseBlockEnd;
      expect(inParseBlock, `sendNotice at index ${pos} is inside the chunk-parsing block — would emit duplicate notices`).toBe(false);
    }
  });

  it("logs usage from BOTH the done branch and the stream-read catch branch", () => {
    // Missing logUsage on stream-read error was a reported bug — verify both
    // exit paths call it.
    const source = readFileSync(
      resolve(__dirname, "../../supabase/functions/chat/index.ts"),
      "utf8",
    );
    const callSites = Array.from(source.matchAll(/logUsage\s*\(\s*finalModel/g));
    expect(callSites.length).toBeGreaterThanOrEqual(2);
  });

  it("does not convert upstream streamed provider errors into assistant content", () => {
    const source = readFileSync(
      resolve(__dirname, "../../supabase/functions/chat/index.ts"),
      "utf8",
    );

    expect(source).toContain("upstreamStreamError");
    expect(source).toContain("OpenRouter can return provider errors as SSE");
    expect(source).toContain("do not append a synthetic content notice");

    const errorBranch = source.slice(
      source.indexOf("if (upstreamStreamError)"),
      source.indexOf("} else {", source.indexOf("if (upstreamStreamError)")),
    );
    expect(errorBranch).not.toContain("sendNotice(controller");
  });
});
