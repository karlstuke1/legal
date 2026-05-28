import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { mdComponents, preprocessContent } from "../components/chat/markdown-config";
import { analyzeCitations } from "../lib/citation-engine";
import { applyCitationScrub } from "../lib/scrub-citations";

/**
 * UI-level regression tests — proves the scrub + render pipeline produces
 * the right DOM, not just the right intermediate strings.
 *
 * Each test pushes a realistic LLM response (often verbatim from a real
 * user bug report) through the SAME pipeline the chat bubble runs:
 *
 *   1. analyzeCitations → fabricatedSuspects
 *   2. applyCitationScrub → final text
 *   3. preprocessContent → markdown with linked citations
 *   4. ReactMarkdown(mdComponents) → real DOM
 *
 * Then we assert on the DOM directly — what the lawyer would actually see.
 */

function renderAnswer(text: string, sources: Array<{ provider: string; results: any[] }>) {
  const flat = sources.flatMap(s =>
    s.results.map(r => ({
      provider: s.provider,
      title: r.title || "",
      url: r.url,
      snippet: r.snippet || "",
      date: r.date || "",
    })),
  );
  const sourceContext = flat
    .map((s, i) => `${i + 1}. [${s.provider}] ${s.title} | Ref: ${s.title} | URL: ${s.url} | INHALT: ${s.snippet}`)
    .join("\n");

  const analysis = analyzeCitations(text, sourceContext, flat);
  const { text: scrubbedText, removedCount } = applyCitationScrub(
    text,
    analysis.verification.fabricatedSuspects,
  );
  const preprocessed = preprocessContent(scrubbedText, sources);
  const { container } = render(
    React.createElement(
      ReactMarkdown,
      { remarkPlugins: [remarkGfm], components: mdComponents },
      preprocessed,
    ),
  );
  return { container, removedCount, scrubbedText };
}

describe("chat bubble — UI rendering of scrubbed hallucinations", () => {
  it("REGRESSION 2026-05-18: cross-ref hallucinations are NOT clickable links in the rendered DOM", () => {
    const llmResponse = `Nein, gerichtliche Schritte unterbrechen die Verjährung grundsätzlich nicht. Die Unterbrechung nach § 1497 ABGB setzt eine Handlung der Rechtsverfolgung voraus.

Antrag auf Beweissicherung (§ 384 ZPO): Ein solcher Antrag dient ausschließlich der Sicherung von Beweismitteln. Quelle: OGH 1 Ob 150/05v; RS0034544.

Antrag auf Bewilligung der Verfahrenshilfe: Ein Antrag auf Verfahrenshilfe unterbricht die Verjährung. Quelle: OGH 7 Ob 5/10s; RS0034437.`;

    const sources = [
      {
        provider: "RIS",
        results: [
          {
            title: "OGH Rechtssatz RS0034397: Verfahrenshilfeantrag und Verjährung",
            url: "https://www.ris.bka.gv.at/Dokumente/Justiz/JJR_19560101_OGH/RS0034397.html",
            snippet:
              "Vgl auch RS0034544 sowie OGH 1 Ob 150/05v und 7 Ob 5/10s und RS0034437.",
            date: "2026-01-15",
          },
        ],
      },
    ];

    const { container, removedCount } = renderAnswer(llmResponse, sources);
    expect(removedCount).toBeGreaterThanOrEqual(4);

    const bodyText = container.textContent || "";

    // New "delete" mode: NO warning banner, NO "(unverifiziert)" markers —
    // hallucinated cites are silently removed from the rendered DOM.
    expect(bodyText).not.toMatch(/⚠️/);
    expect(bodyText).not.toMatch(/unverifiziert/i);

    // The fabricated cites are gone from BOTH the text AND any link.
    expect(bodyText).not.toContain("1 Ob 150/05v");
    expect(bodyText).not.toContain("7 Ob 5/10s");
    expect(bodyText).not.toContain("RS0034544");
    expect(bodyText).not.toContain("RS0034437");

    const allLinks = container.querySelectorAll("a");
    const linkTexts = Array.from(allLinks).map(a => a.textContent || "");
    expect(linkTexts.every(t => !t.includes("1 Ob 150/05v"))).toBe(true);
    expect(linkTexts.every(t => !t.includes("7 Ob 5/10s"))).toBe(true);
    expect(linkTexts.every(t => !t.includes("RS0034544"))).toBe(true);
    expect(linkTexts.every(t => !t.includes("RS0034437"))).toBe(true);

    // Legitimate normative cites DO render as links
    const hasNormLink = linkTexts.some(t => /§\s*1497.*ABGB/.test(t));
    const hasZpoLink = linkTexts.some(t => /§\s*384.*ZPO/.test(t));
    expect(hasNormLink).toBe(true);
    expect(hasZpoLink).toBe(true);

    // Sanity: the substantive answer text is in the DOM
    expect(bodyText).toContain("Nein, gerichtliche Schritte");
    expect(bodyText).toContain("Beweissicherung");
  });

  it("REGRESSION 2026-05-20: markdown link to a hallucinated doc is GONE from the rendered DOM (no surviving <a>)", () => {
    // Exact bug from a real user response: LLM emitted
    //   "Quelle: [OGH 4 Ob 170/08i](https://...JJT_20090225_OGH0002_0040OB00170_08I...)"
    // The hallucinated case wasn't in retrieval, so it's a fabricated suspect.
    // The link must vanish entirely — neither the visible text nor a
    // clickable href to the bogus document may remain.
    const llmResponse = `Vorbereitende Schritte unterbrechen die Verjährung nicht. Quelle: [OGH 4 Ob 170/08i](https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJT_20090225_OGH0002_0040OB00170_08I0000_000)`;
    const sources = [
      {
        provider: "RIS",
        results: [
          {
            title: "OGH Rechtssatz RS0034397: Verfahrenshilfeantrag",
            url: "https://example.test/RS0034397",
            snippet: "vgl auch 4 Ob 170/08i — cross-ref inside body.",
            date: "2026-01-15",
          },
        ],
      },
    ];

    const { container, removedCount } = renderAnswer(llmResponse, sources);
    expect(removedCount).toBeGreaterThanOrEqual(1);

    // No <a> tag may point to the hallucinated Dokumentnummer
    const allLinks = container.querySelectorAll("a");
    for (const a of Array.from(allLinks)) {
      expect(a.getAttribute("href") || "").not.toContain("JJT_20090225_OGH0002_0040OB00170_08I");
      expect(a.textContent || "").not.toContain("4 Ob 170/08i");
    }
  });

  it("clean answer (nothing fabricated) renders normally with no warning banner", () => {
    const llmResponse = `Die Verjährung tritt nach § 1489 ABGB nach drei Jahren ein. Vgl OGH 2 Ob 72/24k.`;
    const sources = [
      {
        provider: "RIS",
        results: [
          {
            title: "OGH 2 Ob 72/24k (12.03.2026): Verjährung",
            url: "https://example.test/2Ob72-24k",
            snippet: "Die Verjährungsfrist nach § 1489 ABGB beträgt drei Jahre.",
            date: "2026-03-12",
          },
        ],
      },
    ];

    const { container, removedCount } = renderAnswer(llmResponse, sources);
    expect(removedCount).toBe(0);

    const bodyText = container.textContent || "";
    expect(bodyText).not.toMatch(/⚠️/);
    expect(bodyText).not.toMatch(/unverifiziert/i);
    expect(bodyText).toContain("§ 1489 ABGB");
    expect(bodyText).toContain("2 Ob 72/24k");
  });
});
