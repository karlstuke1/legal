import { describe, it, expect } from "vitest";
import { detectDocumentContent } from "@/lib/document-detector";

describe("detectDocumentContent", () => {
  it("detects contract-like content", () => {
    const content = `# Arbeitsvertrag\n\n## § 1 Beginn und Dauer\nDas Arbeitsverhältnis beginnt am 01.01.2026.\n\n## § 2 Vergütung\nDer Arbeitnehmer erhält ein Bruttogehalt von 5.000 EUR monatlich.`;
    const result = detectDocumentContent(content, "Erstelle einen Arbeitsvertrag", "draft");
    expect(result.isDocument).toBe(true);
  });

  it("does not detect short responses as documents", () => {
    const content = "Ja, das ist korrekt.";
    const result = detectDocumentContent(content, "Stimmt das?", "research");
    expect(result.isDocument).toBe(false);
  });

  it("detects brief-like content", () => {
    const content = `# Schriftsatz\n\nAn das Arbeitsgericht München\n\nIn der Sache Müller ./. Meier GmbH\n\n## I. Sachverhalt\nDer Kläger war seit dem 01.01.2020 als Softwareentwickler bei der Beklagten beschäftigt.\n\n## II. Rechtliche Würdigung\nDie Kündigung ist sozial ungerechtfertigt.`;
    const result = detectDocumentContent(content, "Erstelle einen Schriftsatz", "draft");
    expect(result.isDocument).toBe(true);
  });
});
