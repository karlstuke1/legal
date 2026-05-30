import { describe, expect, it } from "vitest";
import {
  classifySourceEvidence,
  isFindokDirectDocumentUrl,
  isFindokSearchUrl,
  isEvidentiarySource,
  isRisDirectDocumentUrl,
  isRisSearchUrl,
  withEvidenceStatus,
} from "../../supabase/functions/_shared/source-evidence";

describe("source evidence classification", () => {
  it("classifies direct RIS document URLs as verified documents", () => {
    const directUrls = [
      "https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10002296&Paragraf=75",
      "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJT_20170412_OGH0002_0120OS00028_17F0000_000",
      "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10002296",
    ];

    for (const url of directUrls) {
      expect(isRisDirectDocumentUrl(url)).toBe(true);
      expect(classifySourceEvidence({ provider: "RIS", title: "Direkt", url })).toBe("verified_document");
      expect(isEvidentiarySource({ provider: "RIS", title: "Direkt", url })).toBe(true);
    }
  });

  it("classifies RIS search/list URLs as search utilities", () => {
    const searchUrls = [
      "https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=Bundesnormen&Suchworte=%C2%A775%20StGB",
      "https://www.ris.bka.gv.at/Suchen.wxe?Abfrage=Justiz&Suchworte=RS0094010",
    ];

    for (const url of searchUrls) {
      expect(isRisSearchUrl(url)).toBe(true);
      expect(classifySourceEvidence({ provider: "RIS", title: "RIS Suche", url })).toBe("search_utility");
      expect(isEvidentiarySource({ provider: "RIS", title: "RIS Suche", url })).toBe(false);
    }
  });

  it("classifies generated fallback records as fallback even when the URL looks direct", () => {
    const fallback = withEvidenceStatus({
      provider: "RIS",
      doc_ref: "FALLBACK-RIS-10002296",
      title: "Strafgesetzbuch",
      url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10002296",
    }, "fallback");

    expect(classifySourceEvidence(fallback)).toBe("fallback");
    expect(isEvidentiarySource(fallback)).toBe(false);
  });

  it("treats RIS Judikatur Dokumentnummer URLs as evidence but RS/GZ search fallbacks as utilities", () => {
    const document = {
      provider: "RIS",
      doc_ref: "12 Os 28/17f",
      title: "OGH 12 Os 28/17f",
      url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJT_20170412_OGH0002_0120OS00028_17F0000_000",
    };
    const searchFallback = {
      provider: "RIS",
      doc_ref: "RS0094010",
      title: "RIS Judikatur: RS0094010",
      url: "https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=Justiz&Suchworte=RS0094010",
    };

    expect(classifySourceEvidence(document)).toBe("verified_document");
    expect(classifySourceEvidence(searchFallback)).toBe("search_utility");
  });

  it("classifies stable Findok document identifiers as verified documents", () => {
    const directUrls = [
      "https://findok.bmf.gv.at/findok?dokumentId=DOK-12345",
      "https://findok.bmf.gv.at/findok?gz=RV%2F7101234%2F2024",
      "https://findok.bmf.gv.at/findok?id=123456",
    ];

    for (const url of directUrls) {
      expect(isFindokDirectDocumentUrl(url)).toBe(true);
      expect(classifySourceEvidence({ provider: "FINDOK", title: "BFG Erkenntnis", url })).toBe("verified_document");
      expect(isEvidentiarySource({ provider: "FINDOK", title: "BFG Erkenntnis", url })).toBe(true);
    }
  });

  it("classifies Findok site searches and session-bound URLs as search utilities", () => {
    const searchUrls = [
      "https://www.google.com/search?q=site%3Afindok.bmf.gv.at%20EStR%202000",
      "https://findok.bmf.gv.at/findok?execution=e2s1&_eventId=viewDocument&dokumentId=DOK-12345",
      "https://findok.bmf.gv.at/findok",
    ];

    for (const url of searchUrls) {
      expect(isFindokSearchUrl(url)).toBe(true);
      expect(classifySourceEvidence({ provider: "FINDOK", title: "Findok-Suche", url })).toBe("search_utility");
      expect(isEvidentiarySource({ provider: "FINDOK", title: "Findok-Suche", url })).toBe(false);
    }
  });

  it("keeps generated Findok fallback records out of evidence even with high scores", () => {
    const fallback = withEvidenceStatus({
      provider: "FINDOK",
      doc_ref: "EStR 2000",
      title: "Einkommensteuerrichtlinien 2000",
      url: "https://www.google.com/search?q=site%3Afindok.bmf.gv.at%20EStR%202000",
    }, "fallback");

    expect(classifySourceEvidence(fallback)).toBe("fallback");
    expect(isEvidentiarySource(fallback)).toBe(false);
  });
});
