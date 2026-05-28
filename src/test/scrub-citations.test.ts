import { describe, it, expect } from "vitest";
import {
  scrubFabricatedCitations,
  applyCitationScrub,
  buildScrubNotice,
} from "../lib/scrub-citations";
import type { ExtractedCitation } from "../lib/citation-engine";
import type { SourceMapEntry } from "../lib/render-source-tokens";

function fakeCit(raw: string, normalized?: string, type: ExtractedCitation["type"] = "case_ref"): ExtractedCitation {
  return {
    type,
    raw,
    normalized: normalized ?? raw,
    jurisdiction: "AT",
    verified: false,
  };
}

// ============================================================================
// Default "delete" mode — used by the Harvey-style pipeline
// ============================================================================

describe("scrubFabricatedCitations — default delete mode (no marker)", () => {
  it("deletes a fabricated GZ silently (no marker, no banner)", () => {
    const text = "Quelle: OGH 6 Ob 110/20d";
    const { text: out, removed } = scrubFabricatedCitations(text, [fakeCit("6 Ob 110/20d")]);
    expect(out).not.toContain("6 Ob 110/20d");
    expect(out).not.toContain("(unverifiziert)");
    expect(out).not.toContain("Quelle:");
    expect(removed.length).toBe(1);
  });

  it("deletes a fabricated RS-number silently", () => {
    const text = "Vgl. RS0034331 zur Verjährung.";
    const { text: out } = scrubFabricatedCitations(text, [fakeCit("RS0034331", "RS0034331", "rs_number")]);
    expect(out).not.toContain("RS0034331");
    expect(out).not.toContain("(unverifiziert)");
    expect(out).toContain("Vgl.");
    expect(out).toContain("Verjährung");
  });

  it("removes empty Quelle: stubs left behind", () => {
    const text = "Foo. Quelle: RS0034544. Bar.";
    const { text: out } = scrubFabricatedCitations(text, [fakeCit("RS0034544", "RS0034544", "rs_number")]);
    expect(out).not.toMatch(/Quelle:\s*\./);
    expect(out).toContain("Foo");
    expect(out).toContain("Bar");
  });

  it("collapses doubled spaces and stray punctuation after deletion", () => {
    const text = "Die Sache (siehe 6 Ob 110/20d) ist klar.";
    const { text: out } = scrubFabricatedCitations(text, [fakeCit("6 Ob 110/20d")]);
    expect(out).not.toContain("6 Ob 110/20d");
    expect(out).not.toMatch(/\(\s*\)/);
    expect(out).not.toMatch(/[ \t]{2,}/);
  });

  it("deletes the WHOLE markdown link when its text or URL contains a suspect", () => {
    const text = "Quelle: [OGH 4 Ob 170/08i](https://ris.bka.gv.at/Dokument.wxe?Dokumentnummer=JJT_20090225_OGH0002_0040OB00170_08I0000_000)";
    const { text: out } = scrubFabricatedCitations(text, [fakeCit("4 Ob 170/08i")]);
    expect(out).not.toContain("4 Ob 170/08i");
    expect(out).not.toContain("ris.bka.gv.at");
    expect(out).not.toContain("JJT_");
  });

  it("REGRESSION 2026-05-20: Quelle: OGH followed by newline (not end-of-string) gets cleaned up", () => {
    // Production bug: when an answer paragraph ends with the dangling
    // court prefix and a newline (`Quelle: OGH\n\nNächster Absatz`),
    // the cleanup pass left the stub behind because the regex `$`
    // anchor without `m` flag only matches end-of-STRING, not
    // end-of-line. Now we use `m` flag so multi-line stubs vanish.
    const text = "Erster Absatz.\nQuelle: OGH 6 Ob 110/20d\n\nZweiter Absatz.";
    const { text: out } = scrubFabricatedCitations(text, [fakeCit("6 Ob 110/20d")]);
    expect(out).not.toContain("Quelle: OGH");
    expect(out).not.toContain("6 Ob 110/20d");
    expect(out).toContain("Erster Absatz.");
    expect(out).toContain("Zweiter Absatz.");
  });

  it("REGRESSION 2026-05-20: pipe-separated multi-cite Quelle: line with all cites scrubbed", () => {
    // Real production output: the old chat function prompts the LLM to
    // format multi-cite lines as `Quelle: [link1] | [link2]`. When both
    // links get scrubbed, just the pipe divider survives → "Quelle: OGH | ".
    // This was breaking the m-flag fix from PR #28 because the pipe
    // isn't in the punctuation set.
    const text = `Erste Aussage.
Quelle: OGH 6 Ob 110/20d | OGH 1 Ob 150/05v

Zweite Aussage.`;
    const suspects = [fakeCit("6 Ob 110/20d"), fakeCit("1 Ob 150/05v")];
    const { text: out } = scrubFabricatedCitations(text, suspects);
    expect(out).not.toContain("Quelle: OGH");
    expect(out).not.toContain("|");
    expect(out).not.toContain("6 Ob 110/20d");
    expect(out).not.toContain("1 Ob 150/05v");
    expect(out).toContain("Erste Aussage.");
    expect(out).toContain("Zweite Aussage.");
  });

  it("REGRESSION 2026-05-20: multi-paragraph answer with several Quelle: OGH stubs", () => {
    // Mirrors the user-pasted production answer where 4 paragraphs all
    // ended with `\nQuelle: OGH` after the GZs were deleted.
    const text = `Erste Aussage über Verjährung.
Quelle: OGH 6 Ob 110/20d

Zweite Aussage über Beweissicherung.
Quelle: OGH 1 Ob 150/05v

Dritte Aussage über Streitverkündung.
Quelle: OGH 7 Ob 5/10s`;
    const suspects = [
      fakeCit("6 Ob 110/20d"),
      fakeCit("1 Ob 150/05v"),
      fakeCit("7 Ob 5/10s"),
    ];
    const { text: out } = scrubFabricatedCitations(text, suspects);
    expect(out).not.toContain("Quelle: OGH");
    expect(out).not.toContain("6 Ob 110/20d");
    expect(out).not.toContain("1 Ob 150/05v");
    expect(out).not.toContain("7 Ob 5/10s");
    expect(out).toContain("Erste Aussage");
    expect(out).toContain("Zweite Aussage");
    expect(out).toContain("Dritte Aussage");
  });
});

// ============================================================================
// New: match-first-then-delete with sourceMap
// ============================================================================

const SOURCE_MAP: SourceMapEntry[] = [
  { index: 1, url: "https://example.test/1", title: "OGH 4 Ob 170/08i Rechtssatz" },
  { index: 2, url: "https://example.test/2", title: "RS0094010 — Verjährung" },
  { index: 3, url: "https://example.test/3", title: "§ 1497 ABGB" },
  { index: 4, url: "https://example.test/4", title: "Quelle ohne Ref im Titel", doc_ref: "6 Ob 140/18h" },
];

describe("scrubFabricatedCitations — match-first-then-delete with sourceMap", () => {
  it("REWRITES a 'fabricated' cite to [Quelle N] when it matches a source title", () => {
    // Model emitted "OGH 4 Ob 170/08i" as plain text but a source with
    // exactly that title IS in the numbered list. Rather than deleting,
    // we rewrite to [Quelle 1] so the renderer turns it into a real link.
    const text = "Vgl. 4 Ob 170/08i zum Aufrechnungsverbot.";
    const { text: out, removed, rewritten } = scrubFabricatedCitations(
      text,
      [fakeCit("4 Ob 170/08i")],
      { sourceMap: SOURCE_MAP },
    );
    expect(out).toContain("[Quelle 1]");
    expect(out).not.toContain("4 Ob 170/08i");
    expect(rewritten.length).toBe(1);
    expect(removed.length).toBe(0);
  });

  it("REWRITES an RS-number that matches a source", () => {
    const text = "Siehe RS0094010 zur Frist.";
    const { text: out, rewritten, removed } = scrubFabricatedCitations(
      text,
      [fakeCit("RS0094010", "RS0094010", "rs_number")],
      { sourceMap: SOURCE_MAP },
    );
    expect(out).toContain("[Quelle 2]");
    expect(out).not.toContain("RS0094010");
    expect(rewritten.length).toBe(1);
    expect(removed.length).toBe(0);
  });

  it("REWRITES a case reference that only matches sourceMap.doc_ref", () => {
    const text = "Vgl. 6 Ob 140/18h zur Haftung.";
    const { text: out, rewritten, removed } = scrubFabricatedCitations(
      text,
      [fakeCit("6 Ob 140/18h")],
      { sourceMap: SOURCE_MAP },
    );
    expect(out).toContain("[Quelle 4]");
    expect(rewritten.length).toBe(1);
    expect(removed.length).toBe(0);
  });

  it("DELETES a cite that has no match in sourceMap (fall-through)", () => {
    const text = "Vgl. 99 Ob 999/99z (komplett erfunden).";
    const { text: out, removed, rewritten } = scrubFabricatedCitations(
      text,
      [fakeCit("99 Ob 999/99z")],
      { sourceMap: SOURCE_MAP },
    );
    expect(out).not.toContain("99 Ob 999/99z");
    expect(out).not.toContain("[Quelle");
    expect(removed.length).toBe(1);
    expect(rewritten.length).toBe(0);
  });

  it("handles a mix: rewrite one, delete the other", () => {
    const text = "Vgl. 4 Ob 170/08i und 99 Ob 999/99z.";
    const { text: out, removed, rewritten } = scrubFabricatedCitations(
      text,
      [fakeCit("4 Ob 170/08i"), fakeCit("99 Ob 999/99z")],
      { sourceMap: SOURCE_MAP },
    );
    expect(out).toContain("[Quelle 1]");
    expect(out).not.toContain("4 Ob 170/08i");
    expect(out).not.toContain("99 Ob 999/99z");
    expect(rewritten.length).toBe(1);
    expect(removed.length).toBe(1);
  });

  it("REGRESSION 2026-05-20: matches case in URL even when only URL contains the cite", () => {
    const text = "Quelle: [OGH 4 Ob 170/08i](https://example.test/1)";
    const { text: out, rewritten } = scrubFabricatedCitations(
      text,
      [fakeCit("4 Ob 170/08i")],
      { sourceMap: SOURCE_MAP },
    );
    expect(out).toContain("[Quelle 1]");
    expect(out).not.toContain("4 Ob 170/08i");
    expect(rewritten.length).toBe(1);
  });
});

// ============================================================================
// Legacy "marker" mode — backward-compat for existing tests
// ============================================================================

describe("scrubFabricatedCitations — legacy marker mode (opt-in)", () => {
  it("replaces with (unverifiziert) when mode: 'marker'", () => {
    const text = "Quelle: OGH 6 Ob 110/20d";
    const { text: out } = scrubFabricatedCitations(text, [fakeCit("6 Ob 110/20d")], { mode: "marker" });
    expect(out).toContain("(unverifiziert)");
    expect(out).not.toContain("6 Ob 110/20d");
  });

  it("dedupes suspects by raw form", () => {
    const text = "RS0034331 ist falsch. Auch RS0034331.";
    const { removed } = scrubFabricatedCitations(text, [
      fakeCit("RS0034331", "RS0034331", "rs_number"),
      fakeCit("RS0034331", "RS0034331", "rs_number"),
    ], { mode: "marker" });
    expect(removed.length).toBe(1);
  });

  it("skips suspects with raw shorter than 3 chars (safety)", () => {
    const text = "AB ist eine Abkürzung.";
    const { text: out, removed } = scrubFabricatedCitations(text, [fakeCit("AB")], { mode: "marker" });
    expect(out).toBe(text);
    expect(removed).toEqual([]);
  });

  it("escapes regex metacharacters in the raw form", () => {
    const text = "Siehe § 75 StGB für Mord.";
    const { text: out } = scrubFabricatedCitations(text, [
      fakeCit("§ 75 StGB", "§ 75 StGB", "paragraph"),
    ], { mode: "marker" });
    expect(out).toContain("(unverifiziert)");
    expect(out).not.toContain("§ 75 StGB");
  });
});

// ============================================================================
// buildScrubNotice (legacy banner — only used in marker mode)
// ============================================================================

describe("buildScrubNotice", () => {
  it("returns empty string when nothing was removed", () => {
    expect(buildScrubNotice([])).toBe("");
  });

  it("renders a singular notice for one removal", () => {
    const notice = buildScrubNotice([fakeCit("6 Ob 110/20d")]);
    expect(notice).toContain("1 unverifiziertes Zitat entfernt");
    expect(notice).toContain("⚠️");
  });

  it("renders a plural notice for multiple removals", () => {
    const notice = buildScrubNotice([
      fakeCit("6 Ob 110/20d"),
      fakeCit("RS0034331", "RS0034331", "rs_number"),
    ]);
    expect(notice).toContain("2 unverifiziertes Zitate entfernt");
  });

  it("does NOT inline the removed Aktenzeichen (would re-link them to 0-Treffer-pages)", () => {
    const notice = buildScrubNotice([
      fakeCit("6 Ob 110/20d"),
      fakeCit("RS0034331", "RS0034331", "rs_number"),
    ]);
    expect(notice).not.toContain("6 Ob 110/20d");
    expect(notice).not.toContain("RS0034331");
  });
});

// ============================================================================
// applyCitationScrub (high-level wrapper)
// ============================================================================

describe("applyCitationScrub", () => {
  it("default mode (delete) emits no banner even when removals happen", () => {
    const text = "Vgl. 6 Ob 110/20d und RS0034331 zur Frist.";
    const { text: out, removedCount } = applyCitationScrub(text, [
      fakeCit("6 Ob 110/20d"),
      fakeCit("RS0034331", "RS0034331", "rs_number"),
    ]);
    expect(removedCount).toBe(2);
    expect(out).not.toContain("⚠️");
    expect(out).not.toContain("unverifiziert");
    expect(out).not.toContain("6 Ob 110/20d");
    expect(out).not.toContain("RS0034331");
  });

  it("marker mode emits banner above the body", () => {
    const text = "Vgl. 6 Ob 110/20d zur Frist.";
    const { text: out, removedCount } = applyCitationScrub(text, [fakeCit("6 Ob 110/20d")], { mode: "marker" });
    expect(removedCount).toBe(1);
    expect(out).toContain("⚠️");
    expect(out).toContain("(unverifiziert)");
  });

  it("sourceMap match-first: rewrites legitimate cites instead of deleting", () => {
    const text = "Vgl. 4 Ob 170/08i zum Aufrechnungsverbot.";
    const { text: out, removedCount, rewrittenCount } = applyCitationScrub(
      text,
      [fakeCit("4 Ob 170/08i")],
      { sourceMap: SOURCE_MAP },
    );
    expect(removedCount).toBe(0);
    expect(rewrittenCount).toBe(1);
    expect(out).toContain("[Quelle 1]");
  });

  it("REGRESSION 2026-05-18: Verjährungs-Antwort with 4 cross-ref hallucinations", () => {
    // Original bug: 4 OGH GZ + RS numbers from training data. With default
    // delete mode + no sourceMap matches: clean removal, no markers, no banner.
    const llmResponse = `Nein, gerichtliche Schritte unterbrechen die Verjährung nicht.

Antrag auf Beweissicherung: dient nur der Sicherung von Beweismitteln. Quelle: OGH 1 Ob 150/05v; RS0034544.

Antrag auf Verfahrenshilfe: Quelle: OGH 7 Ob 5/10s; RS0034437.`;

    const suspects = [
      fakeCit("1 Ob 150/05v"),
      fakeCit("7 Ob 5/10s"),
      fakeCit("RS0034544", "RS0034544", "rs_number"),
      fakeCit("RS0034437", "RS0034437", "rs_number"),
    ];

    const { text: out, removedCount } = applyCitationScrub(llmResponse, suspects);
    expect(removedCount).toBe(4);
    expect(out).not.toContain("1 Ob 150/05v");
    expect(out).not.toContain("7 Ob 5/10s");
    expect(out).not.toContain("RS0034544");
    expect(out).not.toContain("RS0034437");
    expect(out).not.toContain("⚠️");
    expect(out).not.toContain("unverifiziert");
    // Substance survives
    expect(out).toContain("Nein, gerichtliche Schritte");
    expect(out).toContain("Beweissicherung");
    expect(out).toContain("Verfahrenshilfe");
  });
});
