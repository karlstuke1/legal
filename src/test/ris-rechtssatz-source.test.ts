import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRisRechtssatzSearchQueries,
  extractRisRechtssatzKeywords,
  isResponsiveRisRechtssatzSource,
  looksLikeExactRisRechtssatzQuery,
  resolveExactRisRechtssatzSource,
  resolveExactRisRechtssatzSources,
  resolveVerifiedRisNormSource,
} from "../../supabase/functions/_shared/ris-rechtssatz";

const PROMPT = "Unterbrechen gerichtliche Schritte, die die Geltendmachung eines Rechtes bloß vorbereiten, die Verjährung?";
const EGZPO_PROMPT = "ist eine Klage auf Rechnungslegung im sinne des Artikel 42 EGZPO zulässig zur vorbereitung von schadenersatzklagen?";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/xml" },
  });
}

function ogdResult(overrides: Record<string, unknown> = {}) {
  return {
    OgdSearchResult: {
      OgdDocumentResults: {
        OgdDocumentReference: {
          Data: {
            Metadaten: {
              Technisch: {
                ID: "JJR_19790510_OGH0002_0080OB00514_7900000_001",
                Applikation: "Justiz",
                Organ: "OGH",
              },
              Allgemein: {
                DokumentUrl: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_19790510_OGH0002_0080OB00514_7900000_001",
              },
              Judikatur: {
                Dokumenttyp: "Rechtssatz",
                Geschaeftszahl: "8 Ob 514/79",
                Normen: "ABGB §1497",
                Entscheidungsdatum: "1979-05-10",
                Justiz: {
                  Gericht: "OGH",
                  Rechtssatznummern: { item: "RS0034826" },
                },
              },
            },
            Dokumentliste: {
              ContentReference: {
                ContentType: "MainDocument",
                Name: "Hauptdokument",
                Urls: {
                  ContentUrl: [
                    {
                      DataType: "Xml",
                      Url: "https://www.ris.bka.gv.at/Dokumente/Justiz/JJR_19790510_OGH0002_0080OB00514_7900000_001/JJR_19790510_OGH0002_0080OB00514_7900000_001.xml",
                    },
                  ],
                },
              },
            },
          },
          ...overrides,
        },
      },
    },
  };
}

function egzpoRs0034949Result(overrides: Record<string, unknown> = {}) {
  return {
    OgdSearchResult: {
      OgdDocumentResults: {
        OgdDocumentReference: {
          Data: {
            Metadaten: {
              Technisch: {
                ID: "JJR_19580924_OGH0002_0010OB00372_5800000_001",
                Applikation: "Justiz",
                Organ: "OGH",
              },
              Allgemein: {
                DokumentUrl: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_19580924_OGH0002_0010OB00372_5800000_001",
              },
              Judikatur: {
                Dokumenttyp: "Rechtssatz",
                Geschaeftszahl: "1 Ob 372/58; 8 Ob 66/24z",
                Normen: "EGZPO ArtXLII IA",
                Entscheidungsdatum: "2024-09-26",
                Justiz: {
                  Gericht: "OGH",
                  Rechtssatznummern: { item: "RS0034949" },
                },
              },
            },
            Dokumentliste: {
              ContentReference: {
                ContentType: "MainDocument",
                Name: "Hauptdokument",
                Urls: {
                  ContentUrl: [
                    {
                      DataType: "Xml",
                      Url: "https://www.ris.bka.gv.at/Dokumente/Justiz/JJR_19580924_OGH0002_0010OB00372_5800000_001/JJR_19580924_OGH0002_0010OB00372_5800000_001.xml",
                    },
                  ],
                },
              },
            },
          },
          ...overrides,
        },
      },
    },
  };
}

describe("RIS Rechtssatz exact source resolution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects sentence-style Rechtssatz prompts and keeps the matching keywords", () => {
    expect(looksLikeExactRisRechtssatzQuery(PROMPT)).toBe(true);
    expect(extractRisRechtssatzKeywords(PROMPT)).toEqual([
      "Unterbrechen",
      "gerichtliche",
      "Schritte",
      "Geltendmachung",
      "Rechtes",
      "bloß",
      "vorbereiten",
      "Verjährung",
    ]);
  });

  it("returns a verified direct RIS document source for RS0034826", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("data.bka.gv.at/ris/api")) return jsonResponse(ogdResult());
      if (url.endsWith(".xml")) {
        return textResponse('<absatz typ="erltext" ct="rechtssatz">Gerichtliche Schritte, die die Geltendmachung eines Rechtes bloß vorbereiten, unterbrechen die Verjährung nicht.</absatz>');
      }
      return new Response("", { status: 404 });
    });

    const source = await resolveExactRisRechtssatzSource(PROMPT);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(source).toMatchObject({
      provider: "RIS",
      doc_ref: "RIS-Justiz RS0034826",
      evidence_status: "verified_document",
      url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_19790510_OGH0002_0080OB00514_7900000_001",
      score: 0.99,
    });
    expect(source?.title).toContain("Gerichtliche Schritte");
    expect(source?.snippet).toContain("unterbrechen die Verjährung nicht");
    expect(source?.url).not.toContain("Ergebnis.wxe");
    expect(source?.url).not.toContain("Suchen.wxe");
  });

  it("normalizes Artikel 42 EGZPO into Art XLII searches", () => {
    expect(buildRisRechtssatzSearchQueries(EGZPO_PROMPT)).toContain(
      "Art XLII EGZPO Vorbereitung Schadenersatzklage",
    );
    expect(extractRisRechtssatzKeywords(EGZPO_PROMPT)).not.toContain("zulässig");
  });

  it("resolves Flo's EGZPO Art 42 prompt to RS0034949", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("data.bka.gv.at/ris/api") && url.includes("Art%20XLII%20EGZPO%20Vorbereitung%20Schadenersatzklage")) {
        return jsonResponse(egzpoRs0034949Result());
      }
      if (url.includes("data.bka.gv.at/ris/api")) {
        return jsonResponse({ OgdSearchResult: { OgdDocumentResults: {} } });
      }
      if (url.endsWith(".xml")) {
        return textResponse('<absatz typ="erltext" ct="rechtssatz">Eine Klage nach Art XLII EGZPO ist zur Vorbereitung einer Schadenersatzklage und zur Bezifferung des Schadens unzulässig.</absatz>');
      }
      return new Response("", { status: 404 });
    });

    const source = await resolveExactRisRechtssatzSource(EGZPO_PROMPT);

    expect(fetchMock).toHaveBeenCalled();
    expect(source).toMatchObject({
      provider: "RIS",
      doc_ref: "RIS-Justiz RS0034949",
      evidence_status: "verified_document",
      url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_19580924_OGH0002_0010OB00372_5800000_001",
    });
    expect(source?.title).toContain("Klage nach Art XLII EGZPO");
    expect(source?.snippet).toContain("Schadenersatzklage");
  });

  it("rejects off-topic Rechtssatz sidebar candidates for a focused query", () => {
    expect(isResponsiveRisRechtssatzSource(EGZPO_PROMPT, {
      title: "Rechtssatz: Solange ein Strafverfahren anhängig ist, darf kein Disziplinarerkenntnis ergehen.",
      doc_ref: "RIS-Justiz RS0056880",
      snippet: "Strafverfahren, Disziplinarerkenntnis, gerichtliche Vorerhebungen",
      highlights: ["RS0056880"],
      provider: "RIS",
    })).toBe(false);

    expect(isResponsiveRisRechtssatzSource(EGZPO_PROMPT, {
      title: "Rechtssatz: Eine Klage nach Art XLII EGZPO ist zur Vorbereitung einer Schadenersatzklage und zur Bezifferung des Schadens unzulässig.",
      doc_ref: "RIS-Justiz RS0034949",
      snippet: "EGZPO ArtXLII IA",
      highlights: ["RS0034949"],
      provider: "RIS",
    })).toBe(true);
  });

  it("also resolves the Rechtssatz norm to a verified direct RIS norm document", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("data.bka.gv.at/ris/api")) return jsonResponse(ogdResult());
      if (url.endsWith(".xml")) {
        return textResponse('<absatz typ="erltext" ct="rechtssatz">Gerichtliche Schritte, die die Geltendmachung eines Rechtes bloß vorbereiten, unterbrechen die Verjährung nicht.</absatz>');
      }
      if (url.includes("NormDokument.wxe") && url.includes("Paragraf=1497")) {
        return new Response("<html><body>Allgemeines bürgerliches Gesetzbuch § 1497</body></html>", { status: 200 });
      }
      return new Response("", { status: 404 });
    });

    const sources = await resolveExactRisRechtssatzSources(PROMPT);

    expect(sources.map((s) => s.doc_ref)).toEqual([
      "RIS-Justiz RS0034826",
      "§ 1497 ABGB",
    ]);
    expect(sources[1].url).toBe("https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622&Artikel=&Paragraf=1497&Anlage=&Uebergangsrecht=");
    expect(sources[1].url).not.toContain("Ergebnis.wxe");
  });

  it("only emits a norm source after confirming the RIS norm document", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html><body>keine Dokumente gefunden</body></html>", { status: 200 }));

    await expect(resolveVerifiedRisNormSource("§ 1497 ABGB")).resolves.toBeNull();
  });

  it("does not treat ambiguous Rechtssatz search results as exact evidence", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      OgdSearchResult: {
        OgdDocumentResults: {
          OgdDocumentReference: [
            ogdResult().OgdSearchResult.OgdDocumentResults.OgdDocumentReference,
            ogdResult({ Data: { Metadaten: { Technisch: { ID: "JJR_OTHER" } } } }).OgdSearchResult.OgdDocumentResults.OgdDocumentReference,
          ],
        },
      },
    }));

    await expect(resolveExactRisRechtssatzSource(PROMPT)).resolves.toBeNull();
  });
});
