import { describe, expect, it } from "vitest";
import {
  ensureAtLeastOneSourceToken,
  ensureResponsiveRechtssatzIntro,
} from "@/lib/answer-source-anchoring";
import type { SourceMapEntry } from "@/lib/render-source-tokens";

const sources: SourceMapEntry[] = [
  {
    index: 1,
    provider: "RIS",
    title: "Rechtssatz: Gerichtliche Schritte, die die Geltendmachung eines Rechtes bloß vorbereiten, unterbrechen die Verjährung nicht.",
    url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_19790510_OGH0002_0080OB00514_7900000_001",
    doc_ref: "RIS-Justiz RS0034826",
    evidence_status: "verified_document",
  },
];

const unrelatedFirstSource: SourceMapEntry = {
  index: 1,
  provider: "RIS",
  title: "Rechtssatz: Solange ein Strafverfahren anhängig ist, darf kein Disziplinarerkenntnis ergehen. Der Begriff Strafverfahren umfaßt auch gerichtliche Vorerhebungen.",
  url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_OTHER",
  doc_ref: "RIS-Justiz RS0056880",
  evidence_status: "verified_document",
};

describe("answer source anchoring", () => {
  it("prepends the exact responsive Rechtssatz when the answer only paraphrases it", () => {
    const out = ensureResponsiveRechtssatzIntro(
      "Gerichtliche Schritte, die die Geltendmachung eines Rechts bloß vorbereiten, unterbrechen die Verjährung grundsätzlich nicht.",
      sources,
    );

    expect(out).toMatch(/^Gerichtliche Schritte, die die Geltendmachung eines Rechtes bloß vorbereiten, unterbrechen die Verjährung nicht\. \[Quelle 1\]/);
    expect(out).toContain("eines Rechts bloß vorbereiten");
  });

  it("does not duplicate an already exact Rechtssatz intro", () => {
    const exact = "Gerichtliche Schritte, die die Geltendmachung eines Rechtes bloß vorbereiten, unterbrechen die Verjährung nicht. [Quelle 1]";
    expect(ensureResponsiveRechtssatzIntro(exact, sources)).toBe(exact);
  });

  it("does not surface titles that contain hard identifiers in the answer text", () => {
    const out = ensureResponsiveRechtssatzIntro("Kurze Antwort.", [
      { ...sources[0], title: "Rechtssatz: Siehe RS0034826 und OGH 2 Ob 72/24k." },
    ]);

    expect(out).toBe("Kurze Antwort.");
  });

  it("chooses the Rechtssatz that overlaps with the answer, not merely the first Rechtssatz source", () => {
    const out = ensureResponsiveRechtssatzIntro(
      "Gerichtliche Schritte, die die Geltendmachung eines Rechts bloß vorbereiten, unterbrechen die Verjährung grundsätzlich nicht.",
      [unrelatedFirstSource, { ...sources[0], index: 2 }],
    );

    expect(out).toMatch(/^Gerichtliche Schritte, die die Geltendmachung eines Rechtes bloß vorbereiten, unterbrechen die Verjährung nicht\. \[Quelle 2\]/);
    expect(out).not.toMatch(/^Solange ein Strafverfahren/);
  });

  it("does not prepend an unrelated Rechtssatz just because one exists", () => {
    const answer = "Die Kündigungsfrist nach AngG hängt von Dienstzeit und Kündigungstermin ab.";
    expect(ensureResponsiveRechtssatzIntro(answer, [unrelatedFirstSource])).toBe(answer);
  });

  it("adds a source token to the first substantive sentence when the model omitted all tokens", () => {
    const out = ensureAtLeastOneSourceToken(
      "Kurze Überschrift\n\nDas ist eine längere juristische Aussage, die belegt werden muss.",
      sources,
    );

    expect(out).toContain("belegt werden muss. [Quelle 1]");
  });
});
