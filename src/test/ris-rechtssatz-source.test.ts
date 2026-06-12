import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRisRechtssatzSearchQueries,
  extractExplicitRsNumber,
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

function rsHit(rsNumber: string, docId: string) {
  return {
    Data: {
      Metadaten: {
        Technisch: { ID: docId, Applikation: "Justiz", Organ: "OGH" },
        Allgemein: {
          DokumentUrl: `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=${docId}`,
        },
        Judikatur: {
          Dokumenttyp: "Rechtssatz",
          Geschaeftszahl: "11 Os 25/91",
          Normen: "StGB §67 Abs2",
          Entscheidungsdatum: "1991-04-23",
          Justiz: { Gericht: "OGH", Rechtssatznummern: { item: rsNumber } },
        },
      },
      Dokumentliste: {
        ContentReference: {
          ContentType: "MainDocument",
          Name: "Hauptdokument",
          Urls: {
            ContentUrl: [
              { DataType: "Xml", Url: `https://www.ris.bka.gv.at/Dokumente/Justiz/${docId}/${docId}.xml` },
            ],
          },
        },
      },
    },
  };
}

describe("explicit RS-number queries (tester meta-question regression)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The screenshot bug: "Warum hast du RS0091861 nicht erwähnt?" has fewer
  // than 5 keywords and zero topical overlap with the Rechtssatz text, so
  // both gates rejected it — the model then explained its citation rules
  // instead of answering. Identifier equality must replace those gates.
  const META_QUESTION = "Warum hast du RS0091861 nicht erwähnt?";

  it("extracts and zero-pads explicit RS numbers", () => {
    expect(extractExplicitRsNumber(META_QUESTION)).toBe("RS0091861");
    expect(extractExplicitRsNumber("was sagt rs34949 dazu?")).toBe("RS0034949");
    expect(extractExplicitRsNumber(PROMPT)).toBeNull();
  });

  it("searches the zero-padded RS form first", () => {
    expect(buildRisRechtssatzSearchQueries("was sagt rs34949?")[0]).toBe("RS0034949");
  });

  it("resolves a short meta-question to the named Rechtssatz despite failing both keyword gates", async () => {
    expect(looksLikeExactRisRechtssatzQuery(META_QUESTION)).toBe(false);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("data.bka.gv.at/ris/api")) {
        return jsonResponse({
          OgdSearchResult: { OgdDocumentResults: { OgdDocumentReference: rsHit("RS0091861", "JJR_19910423_OGH0002_0110OS00025_9100000_001") } },
        });
      }
      if (url.endsWith(".xml")) {
        return textResponse('<absatz typ="erltext" ct="rechtssatz">Der Eintritt eines Teilerfolgs im Inland genügt für die Annahme einer Inlandstat nach § 67 Abs 2 StGB.</absatz>');
      }
      return new Response("", { status: 404 });
    });

    const source = await resolveExactRisRechtssatzSource(META_QUESTION);
    expect(source).toMatchObject({
      provider: "RIS",
      doc_ref: "RIS-Justiz RS0091861",
      evidence_status: "verified_document",
      url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_19910423_OGH0002_0110OS00025_9100000_001",
    });
    expect(source?.title).toContain("Teilerfolg");
  });

  it("accepts only the hit whose RS number equals the queried one (multiple hits allowed)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("data.bka.gv.at/ris/api")) {
        return jsonResponse({
          OgdSearchResult: {
            OgdDocumentResults: {
              OgdDocumentReference: [
                rsHit("RS0099999", "JJR_WRONG"),
                rsHit("RS0091861", "JJR_RIGHT"),
              ],
            },
          },
        });
      }
      if (url.endsWith(".xml")) {
        return textResponse('<absatz typ="erltext" ct="rechtssatz">Der Eintritt eines Teilerfolgs im Inland genügt.</absatz>');
      }
      return new Response("", { status: 404 });
    });

    const source = await resolveExactRisRechtssatzSource(META_QUESTION);
    expect(source?.doc_ref).toBe("RIS-Justiz RS0091861");
    expect(source?.url).toContain("JJR_RIGHT");
  });

  it("returns null when the queried RS number is not among the hits", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("data.bka.gv.at/ris/api")) {
        return jsonResponse({
          OgdSearchResult: { OgdDocumentResults: { OgdDocumentReference: [rsHit("RS0011111", "JJR_OTHER")] } },
        });
      }
      return new Response("", { status: 404 });
    });

    await expect(resolveExactRisRechtssatzSource(META_QUESTION)).resolves.toBeNull();
  });
});
