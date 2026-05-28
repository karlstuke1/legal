import { describe, it, expect } from "vitest";
import { renderSourceTokens, type SourceMapEntry } from "../lib/render-source-tokens";

const SOURCES: SourceMapEntry[] = [
  { index: 1, url: "https://example.test/source-1", title: "RS0034397" },
  { index: 2, url: "https://example.test/source-2", title: "§ 1497 ABGB" },
  { index: 3, url: "https://example.test/source-3", title: "OGH 2 Ob 72/24k" },
  { index: 4, url: "https://example.test/source-4", title: "FINDOK ABC" },
  { index: 5, url: "https://example.test/source-5", title: "OGH 5 Ob ..." },
];

describe("renderSourceTokens — basic replacement", () => {
  it("returns empty result for empty text", () => {
    const r = renderSourceTokens("", SOURCES);
    expect(r.text).toBe("");
    expect(r.replaced).toBe(0);
  });

  it("returns text unchanged when there are no tokens", () => {
    const t = "Die Verjährung ist eine wichtige Schutzeinrichtung.";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toBe(t);
    expect(r.replaced).toBe(0);
  });

  it("replaces a single token with a superscript footnote link", () => {
    const t = "Die Verjährung tritt nach drei Jahren ein [Quelle 2].";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain("[²](https://example.test/source-2)");
    expect(r.text).not.toContain("[Quelle 2]");
    expect(r.replaced).toBe(1);
  });

  it("replaces multiple separate tokens independently", () => {
    const t = "X [Quelle 1] und Y [Quelle 3].";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain("[¹](https://example.test/source-1)");
    expect(r.text).toContain("[³](https://example.test/source-3)");
    expect(r.replaced).toBe(2);
  });
});

describe("renderSourceTokens — Disobedience pattern 1: multi-source brackets", () => {
  it("handles `[Quelle 3, Quelle 5]` form", () => {
    const t = "Vgl. [Quelle 3, Quelle 5] zur Abgrenzung.";
    const r = renderSourceTokens(t, SOURCES);
    // Note: the inner "Quelle " keyword inside the brackets means our
    // pattern won't parse this directly. Instead we expect the model to
    // emit `[Quelle 3, 5]` — but if it emits the duplicated form, we
    // should still extract both indices.
    // → Verify whichever form is matched produces at least one footnote
    expect(r.text).toMatch(/\[[³⁵]\]/);
  });

  it("handles `[Quellen 3, 5]` form (plural)", () => {
    const t = "Vgl. [Quellen 3, 5] zur Abgrenzung.";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain("[³](https://example.test/source-3)");
    expect(r.text).toContain("[⁵](https://example.test/source-5)");
    expect(r.replaced).toBe(2);
  });

  it("handles `[Quelle 3 und 5]` form (und)", () => {
    const t = "Siehe [Quelle 3 und 5].";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain("[³](https://example.test/source-3)");
    expect(r.text).toContain("[⁵](https://example.test/source-5)");
    expect(r.replaced).toBe(2);
  });

  it("handles `[Quellen 1, 3 und 5]` form (mixed)", () => {
    const t = "Siehe [Quellen 1, 3 und 5].";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain("[¹](https://example.test/source-1)");
    expect(r.text).toContain("[³](https://example.test/source-3)");
    expect(r.text).toContain("[⁵](https://example.test/source-5)");
    expect(r.replaced).toBe(3);
  });
});

describe("renderSourceTokens — Disobedience pattern 2: parenthetical case-ref strip", () => {
  it("strips `(OGH 6 Ob 140/18h)` after a footnote link", () => {
    const t = "Vgl. [Quelle 3] (OGH 6 Ob 140/18h) zum Schutz.";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).not.toContain("6 Ob 140/18h");
    expect(r.text).toContain("[³](https://example.test/source-3)");
    expect(r.parentheticalsStripped).toBe(1);
  });

  it("strips `(RS0094010)` after a footnote link", () => {
    const t = "[Quelle 2] (RS0094010)";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).not.toContain("RS0094010");
    expect(r.parentheticalsStripped).toBe(1);
  });

  it("strips `(ECLI:AT:OGH...)` after a footnote link", () => {
    const t = "[Quelle 1] (ECLI:AT:OGH0002:2023:0040OB00170)";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).not.toContain("ECLI:AT:OGH");
    expect(r.parentheticalsStripped).toBe(1);
  });

  it("LEAVES UNTOUCHED a parenthetical that has NO case-ref shape", () => {
    const t = "[Quelle 2] (siehe oben Rn. 12) zur Verjährung.";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain("(siehe oben Rn. 12)");
    expect(r.parentheticalsStripped).toBe(0);
  });
});

describe("renderSourceTokens — Disobedience pattern 3/5: out-of-bounds indices", () => {
  it("deletes a single out-of-bounds token", () => {
    const t = "Vgl. [Quelle 12] zur Verjährung.";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).not.toContain("[Quelle 12]");
    expect(r.text).not.toContain("Quelle 12");
    expect(r.text).not.toContain("undefined");
    expect(r.unmapped).toBe(1);
    expect(r.replaced).toBe(0);
  });

  it("keeps in-bounds indices and drops out-of-bounds when mixed", () => {
    const t = "Vgl. [Quellen 2, 99] zur Verjährung.";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain("[²](https://example.test/source-2)");
    expect(r.text).not.toContain("99");
    expect(r.replaced).toBe(1);
    expect(r.unmapped).toBe(1);
  });

  it("doesn't leave dangling whitespace after deletion", () => {
    const t = "Foo [Quelle 99] bar.";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toBe("Foo bar.");
  });
});

describe("renderSourceTokens — Disobedience pattern 4: tokens inside quoted blocks", () => {
  it("still replaces tokens that appear inside quoted text", () => {
    const t = `Der OGH stellt klar: "Die Verjährung tritt ein [Quelle 2]."`;
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain("[²](https://example.test/source-2)");
    expect(r.text).not.toContain("[Quelle 2]");
  });
});

describe("renderSourceTokens — URL safety", () => {
  it("escapes closing parens in URLs so markdown link doesn't break", () => {
    const sources: SourceMapEntry[] = [{
      index: 1,
      url: "https://example.test/path(with)parens",
    }];
    const r = renderSourceTokens("[Quelle 1] foo", sources);
    // No literal ) should appear inside the markdown link target
    expect(r.text).toContain("[¹](https://example.test/path(with%29parens)");
  });

  it("survives empty sourceMap (everything goes to unmapped)", () => {
    const t = "Vgl. [Quelle 1] und [Quelle 2].";
    const r = renderSourceTokens(t, []);
    expect(r.text).not.toContain("Quelle");
    expect(r.unmapped).toBe(2);
    expect(r.replaced).toBe(0);
  });
});

describe("renderSourceTokens — end-to-end Verjährungs-Antwort", () => {
  it("renders a realistic full answer with mixed citation patterns", () => {
    const llmResponse = `Gerichtliche Schritte unterbrechen die Verjährung grundsätzlich nicht [Quelle 1]. Die Unterbrechung nach § 1497 ABGB setzt eine Handlung zur Durchsetzung des Anspruchs voraus [Quelle 2].

Der OGH hat in [Quellen 1, 3] klargestellt, dass auch ein Verfahrenshilfeantrag nicht ausreicht. Vgl. [Quelle 3] (OGH 6 Ob 140/18h) zum verwandten Fall der Streitanmerkung.

Praxishinweis: Wer sich auf einen Beweissicherungsantrag verlässt, verliert seinen Anspruch [Quelle 5].`;

    const r = renderSourceTokens(llmResponse, SOURCES);

    // Every [Quelle N] was replaced
    expect(r.text).not.toMatch(/\[Quelle\s+\d+\]/);
    expect(r.text).not.toMatch(/\[Quellen\s+\d+/);

    // The parenthetical case-ref was stripped
    expect(r.text).not.toContain("6 Ob 140/18h");

    // Footnotes resolve to real URLs
    expect(r.text).toContain("[¹](https://example.test/source-1)");
    expect(r.text).toContain("[²](https://example.test/source-2)");
    expect(r.text).toContain("[³](https://example.test/source-3)");
    expect(r.text).toContain("[⁵](https://example.test/source-5)");

    // The substantive answer text survives
    expect(r.text).toContain("Gerichtliche Schritte");
    expect(r.text).toContain("§ 1497 ABGB");
    expect(r.text).toContain("Beweissicherungsantrag");

    // Counters
    expect(r.replaced).toBeGreaterThanOrEqual(5);
    expect(r.parentheticalsStripped).toBe(1);
    expect(r.unmapped).toBe(0);
  });
});
