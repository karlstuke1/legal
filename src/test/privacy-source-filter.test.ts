import { describe, expect, it } from "vitest";
import {
  filterAustrianPrivacyLawSources,
  isAustrianPrivacyLawQuery,
  isDisciplinaryStatuteFalsePositive,
  isPrivacyLawRelevantSource,
} from "../../supabase/functions/retrieval/source-filter";

describe("Austrian privacy-law source filter", () => {
  it("detects DSG/DSGVO Datenschutz queries", () => {
    expect(isAustrianPrivacyLawQuery("Schadenersatz bei Datenschutzverstößen nach DSG")).toBe(true);
    expect(isAustrianPrivacyLawQuery("Art 82 DSGVO immaterieller Schaden")).toBe(true);
    expect(isAustrianPrivacyLawQuery("§ 25 DSt Delegierung Disziplinarstatut")).toBe(false);
  });

  it("classifies DSt/Disziplinarstatut hits without privacy signals as false positives", () => {
    expect(isDisciplinaryStatuteFalsePositive({
      title: "Rechtssatz zu § 25 Abs 1 DSt",
      snippet: "Die Rechtsprechung stellt in Bezug auf die Möglichkeit einer Delegierung iSd § 25 Abs 1 DSt ...",
      doc_ref: "RIS-Justiz RS0123456",
    })).toBe(true);

    expect(isDisciplinaryStatuteFalsePositive({
      title: "Datenschutzbehörde Auskunft Art 15 DSGVO",
      snippet: "Schadenersatz nach Art. 82 DSGVO wegen Datenschutzverstoß.",
    })).toBe(false);
  });

  it("requires privacy-law signals on RIS sources for Datenschutz queries", () => {
    expect(isPrivacyLawRelevantSource({
      title: "OGH Art 82 DSGVO Schadenersatz",
      snippet: "Immaterieller Schaden bei Datenschutzverstoß nach Art. 82 DSGVO",
    })).toBe(true);

    expect(isPrivacyLawRelevantSource({
      title: "Rechtssatz: Die Feststellungsklage bedarf eines konkreten aktuellen Anlasses",
      snippet: "Feststellungsklage und rechtliches Interesse.",
    })).toBe(false);
  });

  it("removes DSt false positives only for Datenschutz queries", () => {
    const sources = [
      {
        title: "Rechtssatz zu § 25 Abs 1 DSt",
        snippet: "Delegierung iSd § 25 Abs 1 DSt",
      },
      {
        title: "Rechtssatz: Die Feststellungsklage bedarf eines konkreten aktuellen Anlasses",
        snippet: "Feststellungsklage und rechtliches Interesse.",
      },
      {
        title: "OGH Art 82 DSGVO Schadenersatz",
        snippet: "Immaterieller Schaden bei Datenschutzverstoß nach Art. 82 DSGVO",
      },
    ];

    expect(filterAustrianPrivacyLawSources("Schadenersatz nach DSG", null, sources)).toEqual([sources[2]]);
    expect(filterAustrianPrivacyLawSources("Delegierung nach § 25 DSt", null, sources)).toEqual(sources);
  });
});
