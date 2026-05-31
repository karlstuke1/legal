import { describe, expect, it } from "vitest";
import { preprocessContent } from "@/components/chat/markdown-config";
import {
  buildFallbackCitationUrl,
  buildTrustedRisNormUrl,
  findSourceUrl,
} from "@/lib/ris-url-utils";
import type { RetrievalResult } from "@/lib/retrieval";

function noSources() {
  return [] as { provider: string; results: RetrievalResult[] }[];
}

function makeRisSource(entry: Partial<RetrievalResult>): { provider: string; results: RetrievalResult[] }[] {
  return [{
    provider: "RIS",
    results: [{
      title: entry.title || "",
      url: entry.url || "",
      doc_ref: entry.doc_ref || "",
      snippet: entry.snippet || "",
      score: entry.score ?? 0.99,
      provider: "RIS",
      date: entry.date || "",
      highlights: entry.highlights || [],
      evidence_status: entry.evidence_status || "verified_document",
    }],
  }];
}

const trustedDirectCases = [
  { citation: "§ 1295 ABGB", gesetzesnummer: "10001622", paragraf: "1295" },
  { citation: "§ 1304 ABGB", gesetzesnummer: "10001622", paragraf: "1304" },
  { citation: "§ 75 StGB", gesetzesnummer: "10002296", paragraf: "75" },
  { citation: "§ 5 Abs 1 StGB", gesetzesnummer: "10002296", paragraf: "5" },
  { citation: "§ 16 MRG", gesetzesnummer: "10002531", paragraf: "16" },
  { citation: "§ 1 KSchG", gesetzesnummer: "10002462", paragraf: "1" },
  { citation: "§ 384 ZPO", gesetzesnummer: "10001699", paragraf: "384" },
];

const searchOnlyCases = [
  "§ 999 ABGB",
  "§ 20 AngG",
  "§ 29 FinStrG",
  "§ 207 BAO",
  "§ 6 UStG",
];

describe("citation link safety audit", () => {
  it.each(trustedDirectCases)(
    "routes vetted citation '$citation' to an exact RIS NormDokument page",
    ({ citation, gesetzesnummer, paragraf }) => {
      const url = buildFallbackCitationUrl(citation);
      expect(url).toContain("NormDokument.wxe");
      expect(url).toContain(`Gesetzesnummer=${gesetzesnummer}`);
      expect(url).toContain(`Paragraf=${paragraf}`);

      const rendered = preprocessContent(`Vgl ${citation}.`, noSources());
      expect(rendered).toContain(`[${citation}](`);
      expect(rendered).toContain("NormDokument.wxe");
      expect(rendered).toContain(`Gesetzesnummer=${gesetzesnummer}`);
      expect(rendered).toContain(`Paragraf=${paragraf}`);
    },
  );

  it.each(searchOnlyCases)(
    "keeps unverified or unsafe citation '%s' on RIS search fallback",
    (citation) => {
      const url = buildFallbackCitationUrl(citation);
      expect(url).toContain("Ergebnis.wxe");
      expect(url).toContain("Abfrage=Bundesnormen");
      expect(url).not.toContain("NormDokument.wxe");
      expect(url).not.toContain("Gesetzesnummer=");

      const rendered = preprocessContent(`Vgl ${citation}.`, noSources());
      expect(rendered).toContain(`[${citation}](`);
      expect(rendered).toContain("Ergebnis.wxe");
      expect(rendered).not.toContain("NormDokument.wxe");
    },
  );

  it("does not derive arbitrary paragraph URLs from a general RIS law source", () => {
    const generalAbgb = {
      provider: "RIS",
      title: "Allgemeines bürgerliches Gesetzbuch",
      doc_ref: "10001622",
      url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622",
    };

    expect(findSourceUrl("§ 999 ABGB", [generalAbgb])).toBeNull();

    const rendered = preprocessContent("Eine Norm mit der Bezeichnung § 999 ABGB konnte nicht verifiziert werden.", makeRisSource(generalAbgb));
    expect(rendered).toContain("[§ 999 ABGB](https://www.ris.bka.gv.at/Ergebnis.wxe");
    expect(rendered).not.toMatch(/NormDokument\.wxe\?[^)]*Paragraf=999/);
  });

  it("may derive vetted paragraph URLs from a general RIS law source", () => {
    const generalAbgb = {
      provider: "RIS",
      title: "Allgemeines bürgerliches Gesetzbuch",
      doc_ref: "10001622",
      url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622",
    };

    const url = findSourceUrl("§ 1295 ABGB", [generalAbgb]);
    expect(url).toContain("NormDokument.wxe");
    expect(url).toContain("Gesetzesnummer=10001622");
    expect(url).toContain("Paragraf=1295");
  });

  it("lets exact verified source URLs win even for laws outside the direct fallback allowlist", () => {
    const verifiedBao207 = "https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10003940&Paragraf=207&Anlage=&Uebergangsrecht=";
    const rendered = preprocessContent("Die Festsetzungsverjährung richtet sich nach § 207 BAO.", makeRisSource({
      title: "§ 207 Bundesabgabenordnung",
      doc_ref: "§ 207 BAO",
      url: verifiedBao207,
      snippet: "Verifizierte RIS-Norm: § 207 Bundesabgabenordnung",
    }));

    expect(rendered).toContain(`[§ 207 BAO](${verifiedBao207})`);
  });

  it("does not expose direct URLs for fabricated hard case references without a source", () => {
    const rendered = preprocessContent("Vgl OGH 99 Ob 999/99x und RS0999999.", noSources());
    expect(rendered).toContain("OGH 99 Ob 999/99x");
    expect(rendered).toContain("RS0999999");
    expect(rendered).not.toMatch(/\[OGH 99 Ob 999\/99x\]\(/);
    expect(rendered).not.toMatch(/\[RS0999999\]\(/);
  });

  it("documents the audited direct fallback boundary explicitly", () => {
    expect(buildTrustedRisNormUrl("§ 1295 ABGB")).toContain("NormDokument.wxe");
    expect(buildTrustedRisNormUrl("§ 999 ABGB")).toBeNull();
    expect(buildTrustedRisNormUrl("§ 20 AngG")).toBeNull();
    expect(buildTrustedRisNormUrl("§ 29 FinStrG")).toBeNull();
  });
});
