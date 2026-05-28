import { describe, it, expect } from "vitest";
import {
  extractCitations,
  verifyCitations,
  findSourceHighlights,
  calculateConfidence,
  analyzeCitations,
} from "@/lib/citation-engine";

describe("extractCitations", () => {
  it("extracts Austrian paragraph citations", () => {
    const text = "Gemäß § 1295 Abs. 1 ABGB haftet der Schädiger für die Verletzung.";
    const citations = extractCitations(text);
    expect(citations.length).toBeGreaterThanOrEqual(1);
    const abgb = citations.find((c) => c.type === "paragraph");
    expect(abgb).toBeDefined();
    expect(abgb?.jurisdiction).toBe("AT");
  });

  it("extracts Austrian StGB citations", () => {
    const text = "Nach § 146 StGB besteht ein Betrugsdelikt.";
    const citations = extractCitations(text);
    const at = citations.find((c) => c.jurisdiction === "AT");
    expect(at).toBeDefined();
  });

  it("extracts ECLI numbers", () => {
    const text = "siehe ECLI:EU:C:2012:23 und ECLI:AT:OGH0002:2022:1234";
    const citations = extractCitations(text);
    const eclis = citations.filter((c) => c.type === "ecli");
    expect(eclis.length).toBe(2);
    expect(eclis[0].jurisdiction).toBe("EU");
    expect(eclis[1].jurisdiction).toBe("AT");
  });

  it("extracts RS numbers", () => {
    const text = "OGH RS0094010 bestätigt diese Rechtsprechung.";
    const citations = extractCitations(text);
    const rs = citations.find((c) => c.type === "rs_number");
    expect(rs).toBeDefined();
    expect(rs?.normalized).toBe("RS0094010");
    expect(rs?.jurisdiction).toBe("AT");
  });

  it("extracts OGH case references", () => {
    const text = "Der OGH entschied in 4 Ob 123/23k wie folgt.";
    const citations = extractCitations(text);
    const ogh = citations.find((c) => c.type === "case_ref" && c.jurisdiction === "AT");
    expect(ogh).toBeDefined();
  });

  it("extracts EU article citations", () => {
    const text = "Art. 6 Abs. 1 DSGVO regelt die Rechtmäßigkeit.";
    const citations = extractCitations(text);
    const art = citations.find((c) => c.type === "article" && c.jurisdiction === "EU");
    expect(art).toBeDefined();
  });

  it("extracts EuGH case numbers", () => {
    const text = "siehe EuGH-Urteil C-311/18 (Schrems II).";
    const citations = extractCitations(text);
    const eugh = citations.find((c) => c.type === "case_ref" && c.jurisdiction === "EU");
    expect(eugh).toBeDefined();
  });

  it("deduplicates citations", () => {
    const text = "§ 1295 ABGB regelt den Schadenersatz. Gemäß § 1295 ABGB haftet der Schädiger.";
    const citations = extractCitations(text);
    const abgb = citations.filter((c) => c.normalized.includes("1295"));
    expect(abgb.length).toBe(1);
  });

  it("returns empty array for text without citations", () => {
    const text = "Dies ist ein normaler Text ohne juristische Verweise.";
    const citations = extractCitations(text);
    expect(citations.length).toBe(0);
  });
});

describe("verifyCitations", () => {
  it("verifies citations found in source context", () => {
    const citations = extractCitations("§ 1295 Abs. 1 ABGB und RS0094010");
    const result = verifyCitations(
      citations,
      "Der § 1295 abs. 1 abgb regelt und RS0094010 bestätigt",
      []
    );
    expect(result.verifiedCount).toBeGreaterThanOrEqual(1);
  });

  it("does NOT verify known-law paragraphs that are absent from sources", () => {
    // "§ 9999 ABGB" uses a valid law but a paragraph number that isn't in the
    // retrieved sources — we can't confirm it exists, so it must stay unverified.
    const citations = extractCitations("§ 9999 ABGB");
    const result = verifyCitations(citations, "Hier steht nichts passendes.", []);
    expect(result.verifiedCount).toBe(0);
    // Still not flagged as a fabrication suspect: paragraphs/articles don't feed
    // the case-ref hallucination bucket.
    expect(result.fabricatedSuspects.length).toBe(0);
  });

  it("verifies known-law paragraphs when they appear in sources", () => {
    const citations = extractCitations("§ 1295 ABGB");
    const result = verifyCitations(citations, "§ 1295 abgb regelt den Schadenersatz.", []);
    expect(result.verifiedCount).toBeGreaterThanOrEqual(1);
  });

  it("flags unknown case refs not in sources as fabrication suspects", () => {
    const citations = extractCitations("RS0099999");
    const result = verifyCitations(citations, "Hier steht nichts passendes.", []);
    expect(result.unverifiedCount).toBeGreaterThanOrEqual(1);
    expect(result.fabricatedSuspects.length).toBeGreaterThanOrEqual(1);
  });

  it("verifies RS numbers against source snippets", () => {
    const citations = extractCitations("RS0094536");
    const result = verifyCitations(citations, "", ["OGH RS0094536 Leitsatz"]);
    expect(result.verifiedCount).toBe(1);
  });
});

describe("findSourceHighlights", () => {
  it("finds overlapping passages between response and sources", () => {
    const response = "Die Haftung des Schädigers für Personenschäden ergibt sich aus dem deliktsrechtlichen Schutz.";
    const sources = [
      {
        provider: "RIS",
        title: "§ 1295 ABGB",
        snippet:
          "Die deliktsrechtliche Haftung des Schädigers für Personenschäden ist in der Rechtsprechung anerkannt und ergibt sich aus dem Schutzbereich.",
      },
    ];
    const highlights = findSourceHighlights(response, sources);
    expect(highlights.length).toBeGreaterThanOrEqual(0);
  });

  it("skips sources with short snippets", () => {
    const highlights = findSourceHighlights("some response text", [
      { provider: "X", title: "short", snippet: "tiny" },
    ]);
    expect(highlights.length).toBe(0);
  });
});

describe("calculateConfidence", () => {
  it("returns high confidence for well-sourced responses", () => {
    const verification = {
      citations: Array(5).fill(null).map((_, i) => ({
        type: "paragraph" as const,
        raw: `§ ${i} ABGB`,
        normalized: `§ ${i} ABGB`,
        jurisdiction: "AT" as const,
        verified: true,
      })),
      verifiedCount: 5,
      unverifiedCount: 0,
      fabricatedSuspects: [],
    };
    const result = calculateConfidence(verification, [], 5, 2000);
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it("penalizes unverified fabricated suspects", () => {
    const fabricated = {
      type: "case_ref" as const,
      raw: "FAKE",
      normalized: "FAKE",
      jurisdiction: "unknown" as const,
      verified: false,
    };
    const verification = {
      citations: [fabricated],
      verifiedCount: 0,
      unverifiedCount: 1,
      fabricatedSuspects: [fabricated],
    };
    const result = calculateConfidence(verification, [], 0, 500);
    expect(result.score).toBeLessThan(30);
    expect(result.level).toBe("low");
  });
});

describe("analyzeCitations (full pipeline)", () => {
  it("runs end-to-end without errors", () => {
    const response = "Gemäß § 1295 Abs. 1 ABGB haftet der Schädiger. Art. 6 DSGVO regelt die Verarbeitung.";
    const sources = [
      {
        provider: "RIS",
        title: "ABGB § 1295",
        url: "https://example.com",
        snippet: "Die Haftung nach § 1295 abs. 1 abgb setzt eine rechtswidrige Handlung voraus.",
      },
    ];
    const result = analyzeCitations(response, "§ 1295 abs. 1 abgb", sources);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.confidence.score).toBeGreaterThanOrEqual(0);
    expect(result.confidence.score).toBeLessThanOrEqual(100);
  });

  it("REGRESSION 2026-05-18: cross-ref inside a snippet body does NOT verify a hallucinated case-ref", () => {
    // Real-world scenario: retrieval returns RS0034397 (real, about
    // Verfahrenshilfe + Verjährung). The snippet body of that Rechtssatz
    // quotes related case-law as cross-references ("vgl 1 Ob 150/05v",
    // "siehe auch RS0034544"). The LLM picks those cross-refs up and
    // presents them as PRIMARY sources. With the old substring-on-snippet
    // verification, those bogus primaries were marked "verified" and the
    // scrubber didn't fire. New logic verifies hard citation types only
    // against structured identifiers (title + URL) of retrieved docs.
    const response = "Vgl. dazu OGH 1 Ob 150/05v zur Beweissicherung und RS0034544 zum Verfahrenshilfeantrag.";
    const sources = [
      {
        provider: "RIS",
        title: "OGH Rechtssatz RS0034397: Verfahrenshilfeantrag unterbricht Verjährung",
        url: "https://www.ris.bka.gv.at/Dokumente/Justiz/JJR_19560101_OGH/RS0034397.html",
        snippet:
          "Der Antrag auf Bewilligung der Verfahrenshilfe unterbricht die Verjährung. " +
          "Vgl auch RS0034544 und OGH 1 Ob 150/05v zur Beweissicherung. " +
          "Anders RS0034415 zur außergerichtlichen Mahnung.",
      },
    ];
    const sourceContext = `${sources[0].title} | ${sources[0].snippet}`;

    const result = analyzeCitations(response, sourceContext, sources);

    const caseRef = result.citations.find(c => c.normalized === "1 Ob 150/05v");
    const rsRef = result.citations.find(c => c.normalized === "RS0034544");
    expect(caseRef).toBeDefined();
    expect(rsRef).toBeDefined();
    // Both must be flagged as fabricated even though they appear in the
    // snippet body — they don't appear in any retrieved doc's title/URL.
    expect(caseRef!.verified).toBe(false);
    expect(rsRef!.verified).toBe(false);
    expect(result.verification.fabricatedSuspects.length).toBeGreaterThanOrEqual(2);
    const fabRefs = result.verification.fabricatedSuspects.map(c => c.normalized);
    expect(fabRefs).toContain("1 Ob 150/05v");
    expect(fabRefs).toContain("RS0034544");
  });

  it("REGRESSION: an RS-number that appears in the title of a retrieved doc IS verified", () => {
    // Counterpart to the test above: when the LLM cites RS0034397 and we
    // actually retrieved RS0034397 (it's in the title), verification must
    // still succeed — otherwise we'd over-scrub legitimate cites.
    const response = "Vgl. RS0034397 zur Unterbrechung durch Verfahrenshilfeantrag.";
    const sources = [
      {
        provider: "RIS",
        title: "OGH Rechtssatz RS0034397: Verfahrenshilfeantrag",
        url: "https://example.test/RS0034397",
        snippet: "Body text mentioning unrelated RS numbers.",
      },
    ];
    const result = analyzeCitations(response, sources[0].title, sources);
    const rs = result.citations.find(c => c.normalized === "RS0034397");
    expect(rs).toBeDefined();
    expect(rs!.verified).toBe(true);
    expect(result.verification.fabricatedSuspects.find(c => c.normalized === "RS0034397")).toBeUndefined();
  });
});
