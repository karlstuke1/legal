import { describe, it, expect } from "vitest";
import {
  buildNumberedSourceBlock,
  buildCitationRuleBlock,
  parseLegacySourceContext,
  buildNumberedSourcesFromItems,
  appendToolFoundSources,
  dedupeNumberedSources,
  toSourceMapEntry,
  type NumberedSource,
} from "../../supabase/functions/chat/numbered-sources";

const SAMPLE: NumberedSource[] = [
  {
    index: 1,
    provider: "RIS",
    title: "OGH Rechtssatz: Verjährungsunterbrechung",
    url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_19560101_OGH0002_0000000000_0000000_000",
    doc_ref: "RS0034397",
    evidence_status: "verified_document",
    snippet: "Der Antrag auf Bewilligung der Verfahrenshilfe unterbricht die Verjährung.",
  },
  {
    index: 2,
    provider: "RIS",
    title: "§ 1497 ABGB",
    url: "https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622&Paragraf=1497",
    doc_ref: "§ 1497 ABGB",
    evidence_status: "verified_document",
    snippet: "Die Verjährung wird durch Anbringung der Klage unterbrochen.",
  },
];

describe("buildNumberedSourceBlock", () => {
  it("returns empty string when given no sources", () => {
    expect(buildNumberedSourceBlock([])).toBe("");
  });

  it("renders a numbered block with the [Quelle N] keyword for each source", () => {
    const block = buildNumberedSourceBlock(SAMPLE);
    expect(block).toContain("[Quelle 1] [RIS]");
    expect(block).toContain("[Quelle 2] [RIS]");
    expect(block).toContain("INHALT: Der Antrag");
    expect(block).toContain("INHALT: Die Verjährung");
  });

  it("DOES NOT include the doc_ref or URL in the LLM-visible block", () => {
    // Critical: the LLM must not see the concrete GZ / RS / URL because
    // it'd copy them verbatim into the answer text, bypassing [Quelle N].
    const block = buildNumberedSourceBlock(SAMPLE);
    expect(block).not.toContain("RS0034397");
    expect(block).not.toContain("ris.bka.gv.at");
  });

  it("truncates snippets to a budget so the prompt doesn't bloat", () => {
    const longSnippet: NumberedSource = {
      index: 1, provider: "RIS", title: "Long doc",
      url: "https://x", snippet: "x".repeat(2000),
    };
    const block = buildNumberedSourceBlock([longSnippet]);
    expect(block).toContain("…");
    expect(block.length).toBeLessThan(2000);
  });

  it("collapses newlines inside snippets to single spaces", () => {
    const multiLine: NumberedSource = {
      index: 1, provider: "RIS", title: "X",
      url: "https://x", snippet: "Line 1\nLine 2\n\nLine 3",
    };
    const block = buildNumberedSourceBlock([multiLine]);
    expect(block).toContain("Line 1 Line 2 Line 3");
  });

  it("REGRESSION 2026-05-20: strips RS-numbers and GZ from titles + snippets", () => {
    // Real-world failure: title "OGH Rechtssatz RS0034397 — Verjährung"
    // leaked into the LLM-visible block, model copied "RS0034397"
    // verbatim into its answer. Same risk for snippet body cross-refs.
    const leaky: NumberedSource = {
      index: 1, provider: "RIS",
      title: "OGH Rechtssatz RS0034397 — Verjährungsunterbrechung",
      url: "https://x", doc_ref: "RS0034397",
      snippet: "Der Antrag unterbricht die Verjährung. Vgl auch RS0034544 sowie 1 Ob 150/05v zur Beweissicherung.",
    };
    const block = buildNumberedSourceBlock([leaky]);
    expect(block).not.toContain("RS0034397");
    expect(block).not.toContain("RS0034544");
    expect(block).not.toContain("1 Ob 150/05v");
    // Surrounding text survives
    expect(block).toContain("OGH Rechtssatz");
    expect(block).toContain("Verjährung");
    expect(block).toContain("Beweissicherung");
  });

  it("strips ECLI and CELEX identifiers from snippet bodies", () => {
    const s: NumberedSource = {
      index: 1, provider: "EUR-Lex", title: "DSGVO",
      url: "https://x",
      snippet: "Siehe ECLI:EU:C:2012:23 sowie Verordnung 32016R0679.",
    };
    const block = buildNumberedSourceBlock([s]);
    expect(block).not.toContain("ECLI:EU:C:2012:23");
    expect(block).not.toContain("32016R0679");
  });
});

describe("buildCitationRuleBlock", () => {
  it("contains the strict [Quelle N] rule", () => {
    const rules = buildCitationRuleBlock();
    expect(rules).toContain("STRIKT NUMMERIERT");
    expect(rules).toContain("[Quelle 1], [Quelle 2]");
    expect(rules).toContain("§ / Art");
  });

  it("explicitly bans Aktenzeichen, RS-numbers, ECLI, CELEX, URLs", () => {
    const rules = buildCitationRuleBlock();
    expect(rules).toContain("6 Ob 140/18h");
    expect(rules).toContain("RS0094010");
    expect(rules).toContain("ECLI");
    expect(rules).toContain("CELEX");
    expect(rules).toContain("URL");
  });

  it("provides an out-of-list fallback", () => {
    const rules = buildCitationRuleBlock();
    expect(rules).toContain("ständige Rechtsprechung");
  });

  it("requires directly responsive Rechtssatz sources to be surfaced in the answer without RS/GZ leakage", () => {
    const rules = buildCitationRuleBlock();
    expect(rules).toContain('als "Rechtssatz:" oder "Leitsatz:"');
    expect(rules).toContain("wörtlich oder nahezu wörtlich");
    expect(rules).toContain("KEINE RS-Nummer");
  });
});

describe("parseLegacySourceContext", () => {
  it("parses a single block correctly", () => {
    const ctx = `[RIS] OGH Rechtssatz | Ref: RS0034397 | URL: https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_19560101_OGH0002_0000000000_0000000_000 |
INHALT: Der Antrag auf Bewilligung der Verfahrenshilfe unterbricht die Verjährung.`;
    const parsed = parseLegacySourceContext(ctx);
    expect(parsed.length).toBe(1);
    expect(parsed[0].provider).toBe("RIS");
    expect(parsed[0].title).toContain("OGH Rechtssatz");
    expect(parsed[0].url).toContain("ris.bka.gv.at/Dokument.wxe");
    expect(parsed[0].doc_ref).toBe("RS0034397");
    expect(parsed[0].snippet).toContain("Verfahrenshilfe");
    expect(parsed[0].index).toBe(1);
  });

  it("parses multiple blocks separated by blank lines", () => {
    const ctx = `[RIS] First Source | Ref: RS01 | URL: https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_1 |
INHALT: First content here.

[FINDOK] Second Source | Ref: ABC | URL: https://findok.bmf.gv.at/findok?dokumentId=DOK-2 |
INHALT: Second content here.`;
    const parsed = parseLegacySourceContext(ctx);
    expect(parsed.length).toBe(2);
    expect(parsed[0].index).toBe(1);
    expect(parsed[1].index).toBe(2);
    expect(parsed[1].provider).toBe("FINDOK");
  });

  it("returns [] for empty input", () => {
    expect(parseLegacySourceContext("")).toEqual([]);
    expect(parseLegacySourceContext("   ")).toEqual([]);
  });

  it("accepts a startIndex for chained numbering", () => {
    const ctx = `[RIS] Source | Ref: X | URL: https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_X |
INHALT: content`;
    const parsed = parseLegacySourceContext(ctx, 5);
    expect(parsed[0].index).toBe(5);
  });

  it("REGRESSION: parses client bullet sourceContext entries", () => {
    const ctx = `Die folgenden Quellen wurden aus Rechtsdatenbanken abgerufen:

- [RIS] OGH Rechtssatz RS0034397 | Ref: RS0034397 | URL: https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_19560101_OGH0002_0000000000_0000000_000
INHALT:
Der Antrag unterbricht die Verjährung.
- [FINDOK] BFG Erkenntnis | Ref: RV/123 | URL: https://findok.bmf.gv.at/findok?gz=RV%2F123
INHALT:
Steuerlicher Inhalt.`;
    const parsed = parseLegacySourceContext(ctx);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].provider).toBe("RIS");
    expect(parsed[0].doc_ref).toBe("RS0034397");
    expect(parsed[1].provider).toBe("FINDOK");
  });
});

describe("buildNumberedSourcesFromItems", () => {
  it("builds numbered sources from structured client source items", () => {
    const out = buildNumberedSourcesFromItems([
      {
        provider: "RIS",
        title: "OGH Rechtssatz RS0034397",
        url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_19560101_OGH0002_0000000000_0000000_000",
        doc_ref: "RS0034397",
        snippet: "Snippet",
      },
    ]);
    expect(out).toEqual([
      {
        index: 1,
        provider: "RIS",
        title: "OGH Rechtssatz RS0034397",
        url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_19560101_OGH0002_0000000000_0000000_000",
        doc_ref: "RS0034397",
        evidence_status: "verified_document",
        snippet: "Snippet",
      },
    ]);
  });

  it("excludes RIS search utilities and fallbacks from numbered evidence sources", () => {
    const out = buildNumberedSourcesFromItems([
      {
        provider: "RIS",
        title: "RIS Bundesrecht: Mord",
        url: "https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=Bundesnormen&Suchworte=Mord",
        doc_ref: "FALLBACK-RIS-BUNDESRECHT",
        evidence_status: "fallback",
      },
      {
        provider: "RIS",
        title: "§ 75 Strafgesetzbuch",
        url: "https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10002296&Paragraf=75",
        doc_ref: "§ 75 StGB",
        evidence_status: "verified_document",
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("§ 75 Strafgesetzbuch");
  });

  it("excludes Findok search utilities and generated fallbacks from numbered evidence sources", () => {
    const out = buildNumberedSourcesFromItems([
      {
        provider: "FINDOK",
        title: "Einkommensteuerrichtlinien 2000",
        url: "https://www.google.com/search?q=site%3Afindok.bmf.gv.at%20EStR%202000",
        doc_ref: "EStR 2000",
        evidence_status: "fallback",
      },
      {
        provider: "FINDOK",
        title: "Findok-Suche: Umsatzsteuer",
        url: "https://www.google.com/search?q=site%3Afindok.bmf.gv.at%20Umsatzsteuer",
        doc_ref: "FINDOK",
        evidence_status: "search_utility",
      },
      {
        provider: "FINDOK",
        title: "BFG Erkenntnis",
        url: "https://findok.bmf.gv.at/findok?dokumentId=DOK-12345",
        doc_ref: "RV/7101234/2024",
        evidence_status: "verified_document",
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("BFG Erkenntnis");
    expect(out[0].url).toContain("dokumentId=DOK-12345");
  });
});

describe("appendToolFoundSources", () => {
  it("continues numbering from startIndex", () => {
    const tools = [
      { provider: "RIS", title: "Tool A", url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_A", doc_ref: "RS1" },
      { provider: "FINDOK", title: "Tool B", url: "https://findok.bmf.gv.at/findok?dokumentId=DOK-B" },
    ];
    const out = appendToolFoundSources(tools, 3);
    expect(out.length).toBe(2);
    expect(out[0].index).toBe(3);
    expect(out[1].index).toBe(4);
  });

  it("drops entries without a url", () => {
    const tools = [
      { provider: "RIS", title: "A", url: "" },
      { provider: "RIS", title: "B", url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_B" },
    ];
    const out = appendToolFoundSources(tools, 1);
    expect(out.length).toBe(1);
    expect(out[0].title).toBe("B");
  });

  it("handles empty/undefined input gracefully", () => {
    expect(appendToolFoundSources([], 1)).toEqual([]);
    expect(appendToolFoundSources(undefined as any, 1)).toEqual([]);
  });
});

describe("dedupeNumberedSources", () => {
  it("removes duplicate URLs and re-numbers from 1", () => {
    const dupes: NumberedSource[] = [
      { index: 1, provider: "RIS", title: "A", url: "https://x.test/1" },
      { index: 2, provider: "RIS", title: "B", url: "https://x.test/2" },
      { index: 3, provider: "RIS", title: "A-dupe", url: "https://x.test/1" },
      { index: 4, provider: "RIS", title: "C", url: "https://x.test/3" },
    ];
    const out = dedupeNumberedSources(dupes);
    expect(out.length).toBe(3);
    expect(out[0].index).toBe(1);
    expect(out[1].index).toBe(2);
    expect(out[2].index).toBe(3);
    expect(out.map(s => s.url)).toEqual([
      "https://x.test/1", "https://x.test/2", "https://x.test/3",
    ]);
  });

  it("is case-insensitive in URL comparison", () => {
    const dupes: NumberedSource[] = [
      { index: 1, provider: "RIS", title: "A", url: "https://X.test/1" },
      { index: 2, provider: "RIS", title: "B", url: "https://x.test/1" },
    ];
    const out = dedupeNumberedSources(dupes);
    expect(out.length).toBe(1);
  });
});

describe("toSourceMapEntry", () => {
  it("drops snippet but keeps doc_ref for scrubber matching", () => {
    const entry = toSourceMapEntry(SAMPLE[0]);
    expect(entry).toEqual({
      index: 1,
      provider: "RIS",
      title: "OGH Rechtssatz: Verjährungsunterbrechung",
      url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_19560101_OGH0002_0000000000_0000000_000",
      doc_ref: "RS0034397",
      evidence_status: "verified_document",
    });
    expect((entry as any).snippet).toBeUndefined();
  });
});
