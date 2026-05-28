import { describe, it, expect } from "vitest";
import { analyzeCitations } from "../lib/citation-engine";
import { applyCitationScrub } from "../lib/scrub-citations";

/**
 * Full-pipeline integration tests — string together the same code path the
 * React hook (use-chat-send.ts) runs on every assistant response:
 *
 *   1. analyzeCitations(response, sourceContext, sources) → extracts +
 *      verifies citations → produces fabricatedSuspects
 *   2. applyCitationScrub(response, fabricatedSuspects) → replaces each
 *      flagged citation with "(unverifiziert)" and prepends a warning
 *
 * Each test takes a realistic LLM response (often verbatim from a real
 * user bug report) plus the retrieval fixtures that were live at the
 * time, and asserts that the final text contains zero hallucinated
 * cites.
 *
 * Adding a test here is the standard regression-protection move for any
 * new hallucination class we see in production.
 */
describe("hallucination scrub — full pipeline e2e", () => {
  it("REGRESSION 2026-05-18: Verjährungs-Frage with cross-ref hallucinations gets fully scrubbed", () => {
    // Verbatim excerpt of the LLM response from the user's bug report.
    // Real RIS retrieval surfaced RS0034397 (Verfahrenshilfe + Verjährung).
    // The Rechtssatz body quotes related case-law. The LLM picked those
    // cross-refs up and presented them as primary sources.
    const llmResponse = `Nein, gerichtliche Schritte unterbrechen die Verjährung grundsätzlich nicht. Die Unterbrechung nach § 1497 ABGB setzt eine Handlung der Rechtsverfolgung voraus.

Antrag auf Beweissicherung (§ 384 ZPO): Ein solcher Antrag dient ausschließlich der Sicherung von Beweismitteln. Quelle: OGH 1 Ob 150/05v; RS0034544.

Antrag auf Bewilligung der Verfahrenshilfe: Ein Antrag auf Verfahrenshilfe für eine bestimmte Klage unterbricht die Verjährung. Quelle: OGH 7 Ob 5/10s; RS0034437.`;

    // What real RIS retrieval actually returned (only RS0034397 is a real,
    // standalone retrieved doc — the other Refs are just cross-references
    // mentioned inside RS0034397's text body).
    const sources = [
      {
        provider: "RIS",
        title: "OGH Rechtssatz RS0034397: Verfahrenshilfeantrag und Verjährung",
        url: "https://www.ris.bka.gv.at/Dokumente/Justiz/JJR_19560101_OGH/RS0034397.html",
        snippet:
          "Der Antrag auf Bewilligung der Verfahrenshilfe für eine bestimmte Klage unterbricht " +
          "die Verjährung. Vgl auch RS0034544 sowie OGH 1 Ob 150/05v zur Abgrenzung von " +
          "Beweissicherungsanträgen. Siehe auch 7 Ob 5/10s zur Frist und RS0034437.",
        date: "2026-01-15",
      },
    ];
    const sourceContext = `1. [RIS] ${sources[0].title} | Ref: RS0034397 | URL: ${sources[0].url} | INHALT: ${sources[0].snippet}`;

    // Step 1: analyze
    const analysis = analyzeCitations(llmResponse, sourceContext, sources);
    const suspects = analysis.verification.fabricatedSuspects;

    // All four cross-ref cites must be flagged as fabricated — they appear
    // in the snippet body but NOT in any retrieved doc's title/URL.
    const suspectRefs = suspects.map(s => s.normalized);
    expect(suspectRefs).toContain("1 Ob 150/05v");
    expect(suspectRefs).toContain("7 Ob 5/10s");
    expect(suspectRefs).toContain("RS0034544");
    expect(suspectRefs).toContain("RS0034437");

    // Step 2: scrub — default "delete" mode (Harvey-style pipeline)
    const { text: finalText, removedCount } = applyCitationScrub(llmResponse, suspects);
    expect(removedCount).toBeGreaterThanOrEqual(4);

    // Final answer: NO fabricated refs anywhere — not in body, not in any
    // warning banner. The new "delete" mode silently removes hallucinated
    // cites; no "(unverifiziert)" markers, no banner.
    expect(finalText).not.toMatch(/1 Ob 150\/05v/);
    expect(finalText).not.toMatch(/7 Ob 5\/10s/);
    expect(finalText).not.toMatch(/RS0034544/);
    expect(finalText).not.toMatch(/RS0034437/);
    expect(finalText).not.toContain("⚠️");
    expect(finalText).not.toContain("unverifiziert");

    // The substantive answer text survives untouched
    expect(finalText).toContain("Nein, gerichtliche Schritte");
    expect(finalText).toContain("§ 1497 ABGB");
    expect(finalText).toContain("§ 384 ZPO");
  });

  it("REGRESSION 2026-04-30: Verjährungs-Frage with 4 fully-fabricated OGH GZ gets scrubbed", () => {
    // Earlier bug class: LLM made up GZ entirely from training data (no
    // basis in retrieved sources). Different from the cross-ref class
    // above — here the cited GZ don't appear anywhere, not even as
    // cross-refs inside the retrieved snippet.
    const llmResponse = `Vorbereitende Schritte unterbrechen die Verjährung nicht.

Quelle: OGH 2 Ob 72/10k, RS0123456, 6 Ob 99/22a, 9 Os 33/19z.`;

    const sources = [
      {
        provider: "RIS",
        title: "OGH Rechtssatz RS0034826",
        url: "https://example.test/RS0034826",
        snippet: "Vorbereitende Schritte unterbrechen Verjährung nicht. § 1497 ABGB.",
        date: "2026-03-12",
      },
    ];
    const sourceContext = `1. [RIS] ${sources[0].title} | Ref: RS0034826 | URL: ${sources[0].url} | INHALT: ${sources[0].snippet}`;

    const analysis = analyzeCitations(llmResponse, sourceContext, sources);
    const { text: finalText, removedCount } = applyCitationScrub(llmResponse, analysis.verification.fabricatedSuspects);

    expect(removedCount).toBeGreaterThanOrEqual(4);
    const bodyOnly = finalText.split("\n\n").slice(1).join("\n\n");
    expect(bodyOnly).not.toContain("2 Ob 72/10k");
    expect(bodyOnly).not.toContain("RS0123456");
    expect(bodyOnly).not.toContain("6 Ob 99/22a");
    expect(bodyOnly).not.toContain("9 Os 33/19z");
  });

  it("does NOT scrub legitimate cites that ARE in a retrieved doc's title", () => {
    // Counterweight: when the LLM cites a Rechtssatz/GZ that's actually in
    // one of our retrieved doc titles, scrubber must leave it alone.
    const llmResponse = `Vgl. dazu OGH 2 Ob 72/24k und RS0034826 zur Verjährungsunterbrechung.`;
    const sources = [
      {
        provider: "RIS",
        title: "OGH 2 Ob 72/24k (12.03.2026): Rechtssatz RS0034826",
        url: "https://example.test/JJR_20260312_OGH0002_0020OB00072_24K",
        snippet: "Body talking about Verjährung and § 1497 ABGB.",
      },
    ];
    const sourceContext = `1. [RIS] ${sources[0].title} | Ref: 2 Ob 72/24k | URL: ${sources[0].url} | INHALT: ${sources[0].snippet}`;

    const analysis = analyzeCitations(llmResponse, sourceContext, sources);
    const { text: finalText, removedCount } = applyCitationScrub(llmResponse, analysis.verification.fabricatedSuspects);

    // Nothing removed, original text intact
    expect(removedCount).toBe(0);
    expect(finalText).toBe(llmResponse);
    expect(finalText).toContain("2 Ob 72/24k");
    expect(finalText).toContain("RS0034826");
    expect(finalText).not.toContain("(unverifiziert)");
    expect(finalText).not.toContain("⚠️");
  });

  it("leaves normative paragraph cites untouched even when not in sources", () => {
    // § / Art references for KNOWN law abbreviations are not hallucination
    // risks — they're verifiable against statute, and the citation engine
    // explicitly excludes them from fabricatedSuspects.
    const llmResponse = `Die Verjährung richtet sich nach § 1489 ABGB und § 1497 ABGB.`;
    const sources = [
      {
        provider: "RIS",
        title: "Some unrelated source",
        url: "https://example.test/x",
        snippet: "Talks about something else entirely.",
      },
    ];

    const analysis = analyzeCitations(llmResponse, "Some unrelated context", sources);
    const { text: finalText, removedCount } = applyCitationScrub(llmResponse, analysis.verification.fabricatedSuspects);

    expect(removedCount).toBe(0);
    expect(finalText).toContain("§ 1489 ABGB");
    expect(finalText).toContain("§ 1497 ABGB");
  });
});
