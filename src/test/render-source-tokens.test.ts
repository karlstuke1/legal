import { describe, it, expect } from "vitest";
import {
  renderSourceTokens,
  renderStreamingSourceTokens,
  type SourceMapEntry,
} from "../lib/render-source-tokens";

const SOURCES: SourceMapEntry[] = [
  { index: 1, url: "https://example.test/source-1", doc_ref: "RIS-Justiz RS0034397", title: "Rechtssatz: Gerichtliche Schritte unterbrechen…" },
  { index: 2, url: "https://example.test/source-2", doc_ref: "§ 1497 ABGB", title: "§ 1497 Allgemeines bürgerliches Gesetzbuch" },
  { index: 3, url: "https://example.test/source-3", doc_ref: "2 Ob 72/24k", title: "OGH 2 Ob 72/24k" },
  { index: 4, url: "https://example.test/source-4", title: "FINDOK ABC" },
  { index: 5, url: "https://example.test/source-5", doc_ref: "RS0098765", title: "Rechtssatz: Beweissicherung…" },
];

const L1 = "[RS0034397](https://example.test/source-1)";
const L2 = "[§ 1497 ABGB](https://example.test/source-2)";
const L3 = "[OGH 2 Ob 72/24k](https://example.test/source-3)";
const L5 = "[RS0098765](https://example.test/source-5)";

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

  it("replaces a single token with a parenthesized inline citation link", () => {
    const t = "Die Verjährung tritt nach drei Jahren ein [Quelle 2].";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain(`(${L2}).`);
    expect(r.text).not.toContain("[Quelle 2]");
    expect(r.replaced).toBe(1);
  });

  it("replaces multiple separate tokens independently", () => {
    const t = "X [Quelle 1] und Y [Quelle 3].";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain(`(${L1})`);
    expect(r.text).toContain(`(${L3})`);
    expect(r.replaced).toBe(2);
  });
});

describe("renderSourceTokens — paren dedup", () => {
  it("does not double-wrap a token the model already parenthesized", () => {
    const t = "Die Frist beträgt drei Jahre ([Quelle 2]).";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain(`(${L2}).`);
    expect(r.text).not.toContain("((");
  });

  it("does not double-wrap inside a prose parenthetical", () => {
    const t = "Das gilt seit langem (vgl. [Quelle 2]) und ist anerkannt.";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain(`(vgl. ${L2})`);
    expect(r.text).not.toContain("((");
  });

  it("wraps a token after a CLOSED parenthetical normally", () => {
    const t = "Das gilt (seit 2020) weiterhin [Quelle 2].";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain(`weiterhin (${L2}).`);
  });
});

describe("renderSourceTokens — Disobedience pattern 1: multi-source brackets", () => {
  it("handles `[Quelle 3, Quelle 5]` form", () => {
    const t = "Vgl. [Quelle 3, Quelle 5] zur Abgrenzung.";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain(L3);
    expect(r.text).toContain(L5);
  });

  it("handles `[Quellen 3, 5]` form (plural) joined inside one paren group", () => {
    const t = "Vgl. [Quellen 3, 5] zur Abgrenzung.";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain(`(${L3}; ${L5})`);
    expect(r.replaced).toBe(2);
  });

  it("handles `[Quelle 3 und 5]` form (und)", () => {
    const t = "Siehe [Quelle 3 und 5].";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain(`(${L3}; ${L5})`);
    expect(r.replaced).toBe(2);
  });

  it("handles `[Quellen 1, 3 und 5]` form (mixed)", () => {
    const t = "Siehe [Quellen 1, 3 und 5].";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain(`(${L1}; ${L3}; ${L5})`);
    expect(r.replaced).toBe(3);
  });
});

describe("renderSourceTokens — Disobedience pattern 2: parenthetical case-ref strip", () => {
  it("strips `(OGH 6 Ob 140/18h)` after a rendered citation", () => {
    const t = "Vgl. [Quelle 3] (OGH 6 Ob 140/18h) zum Schutz.";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).not.toContain("6 Ob 140/18h)");
    expect(r.text).toContain(`(${L3})`);
    expect(r.parentheticalsStripped).toBe(1);
  });

  it("strips `(RS0094010)` after a rendered citation", () => {
    const t = "[Quelle 2] (RS0094010)";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).not.toContain("RS0094010");
    expect(r.parentheticalsStripped).toBe(1);
  });

  it("strips `(ECLI:AT:OGH...)` after a rendered citation", () => {
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

  it("does NOT strip a following rendered citation whose label has a docket shape", () => {
    // Two adjacent tokens: the second renders to "([OGH 2 Ob 72/24k](url))".
    // Its label matches the case-ref shape — but it's OUR verified citation
    // and must survive.
    const t = "Vgl. [Quelle 1] [Quelle 3] zur Abgrenzung.";
    const r = renderSourceTokens(t, SOURCES);
    expect(r.text).toContain(`(${L1})`);
    expect(r.text).toContain(`(${L3})`);
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
    expect(r.text).toContain(`(${L2})`);
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
    expect(r.text).toContain(`(${L2})`);
    expect(r.text).not.toContain("[Quelle 2]");
  });
});

describe("renderSourceTokens — Disobedience pattern 6: bare source mentions", () => {
  it("replaces a bare `Quelle 2` mention with an unwrapped label link", () => {
    const r = renderSourceTokens("Die Aussage folgt aus Quelle 2.", SOURCES);
    expect(r.text).toContain(`aus ${L2}.`);
    expect(r.text).not.toContain("Quelle 2");
    expect(r.replaced).toBe(1);
  });

  it("replaces bare plural source mentions", () => {
    const r = renderSourceTokens("Das ergibt sich aus Quellen 1 und 3.", SOURCES);
    expect(r.text).toContain(L1);
    expect(r.text).toContain(L3);
    expect(r.text).not.toContain("Quellen 1 und 3");
    expect(r.replaced).toBe(2);
  });

  it("skips bare mentions when bareMentions is disabled", () => {
    const r = renderSourceTokens("Die Aussage folgt aus Quelle 2.", SOURCES, { bareMentions: false });
    expect(r.text).toBe("Die Aussage folgt aus Quelle 2.");
    expect(r.replaced).toBe(0);
  });
});

describe("renderSourceTokens — URL safety", () => {
  it("escapes closing parens in URLs so markdown link doesn't break", () => {
    const sources: SourceMapEntry[] = [{
      index: 1,
      url: "https://example.test/path(with)parens",
      doc_ref: "RS0011111",
    }];
    const r = renderSourceTokens("[Quelle 1] foo", sources);
    // No literal ) should appear inside the markdown link target
    expect(r.text).toContain("[RS0011111](https://example.test/path(with%29parens)");
  });

  it("survives empty sourceMap (everything goes to unmapped)", () => {
    const t = "Vgl. [Quelle 1] und [Quelle 2].";
    const r = renderSourceTokens(t, []);
    expect(r.text).not.toContain("Quelle");
    expect(r.unmapped).toBe(2);
    expect(r.replaced).toBe(0);
  });
});

describe("renderStreamingSourceTokens — partial responses", () => {
  it("renders completed tokens and holds back a trailing token fragment", () => {
    const t = "Die Frist beträgt drei Jahre [Quelle 2]. Außerdem gilt [Quel";
    const text = renderStreamingSourceTokens(t, SOURCES);
    expect(text).toContain(`(${L2})`);
    expect(text).not.toContain("[Quel");
    expect(text).toContain("Außerdem gilt");
  });

  it("does not hold anything back when the text ends with a completed token", () => {
    const t = "Die Frist beträgt drei Jahre [Quelle 2].";
    const text = renderStreamingSourceTokens(t, SOURCES);
    expect(text).toContain(`(${L2}).`);
  });

  it("leaves bare mentions alone while streaming", () => {
    const t = "Das ergibt sich aus Quelle 2";
    expect(renderStreamingSourceTokens(t, SOURCES)).toBe(t);
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

    // The hallucinated parenthetical case-ref was stripped
    expect(r.text).not.toContain("6 Ob 140/18h");

    // Tokens resolve to verified labels with real URLs
    expect(r.text).toContain(`(${L1})`);
    expect(r.text).toContain(`(${L2})`);
    expect(r.text).toContain(`(${L1}; ${L3})`);
    expect(r.text).toContain(`(${L5})`);

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
