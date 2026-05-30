import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractRisRechtssatzKeywords,
  looksLikeExactRisRechtssatzQuery,
  resolveExactRisRechtssatzSource,
} from "../../supabase/functions/_shared/ris-rechtssatz";

const PROMPT = "Unterbrechen gerichtliche Schritte, die die Geltendmachung eines Rechtes bloß vorbereiten, die Verjährung?";

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
