import { describe, it, expect } from "vitest";
import { findSourceUrl, formatSourceLabel } from "@/lib/ris-url-utils";

describe("findSourceUrl — strict AZ matching", () => {
  const docWithRS = {
    title: "Rechtssatz RS0094010",
    doc_ref: "RS0094010",
    url: "https://www.ris.bka.gv.at/Dokumente/Justiz/JJR_20050420_OGH0002_0130OS00106_0400000/JJR_20050420_OGH0002_0130OS00106_0400000.xml",
    provider: "RIS",
    snippet: "Eventualvorsatz ...",
  };
  const docForCase = {
    title: "OGH 12 Os 28/17f",
    doc_ref: "12 Os 28/17f",
    url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJT_20170412_OGH0002_0120OS00028_17F0000_000",
    provider: "RIS",
    snippet: "...",
  };

  it("returns null when citation has an AZ that no source matches — does NOT fall through to RS match", () => {
    // Regression for the bug the user reported: citation "OGH 12 Os 28/17f (RS0094010)"
    // was linking to the RS0094010 source's URL (a DIFFERENT case: 13 Os 106/04).
    // The new policy: if the citation names a specific AZ, only link to a source
    // whose doc_ref/url contains that AZ; otherwise render as plain text.
    const url = findSourceUrl("OGH 12 Os 28/17f (RS0094010)", [docWithRS]);
    expect(url).toBeNull();
  });

  it("returns the AZ-matching source's URL when one exists", () => {
    const url = findSourceUrl("OGH 12 Os 28/17f", [docWithRS, docForCase]);
    expect(url).toBe(docForCase.url);
  });

  it("prefers the AZ-matching source even when an RS-only source appears first", () => {
    const url = findSourceUrl("12 Os 28/17f", [docWithRS, docForCase]);
    expect(url).toBe(docForCase.url);
  });

  it("still matches on RS number when citation has no AZ", () => {
    const url = findSourceUrl("RS0094010", [docWithRS]);
    expect(url).toBe(docWithRS.url);
  });

  it("returns null for empty / whitespace input", () => {
    expect(findSourceUrl("", [docWithRS])).toBeNull();
    expect(findSourceUrl("   ", [docWithRS])).toBeNull();
  });
});

describe("formatSourceLabel", () => {
  it("falls back to title when docRef is empty", () => {
    expect(formatSourceLabel("", "Some Title")).toBe("Some Title");
    expect(formatSourceLabel(null, "Some Title")).toBe("Some Title");
    expect(formatSourceLabel(undefined, "Some Title")).toBe("Some Title");
  });

  it('falls back to "Quelle" when both docRef and title are empty', () => {
    expect(formatSourceLabel("", "")).toBe("Quelle");
    expect(formatSourceLabel(null, null)).toBe("Quelle");
  });

  it("reverse-looks Gesetzesnummer to pretty law abbreviation", () => {
    expect(formatSourceLabel("10002296")).toBe("StGB");
    expect(formatSourceLabel("10001622")).toBe("ABGB");
    expect(formatSourceLabel("10002531")).toBe("MRG");
    expect(formatSourceLabel("10002462")).toBe("KSchG");
    expect(formatSourceLabel("10000138")).toBe("B-VG");
  });

  it("uses a verified MRG paragraph source instead of falling back to RIS search", () => {
    const directMrgSource = {
      title: "§ 16 Mietrechtsgesetz",
      doc_ref: "§ 16 MRG",
      url: "https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10002531&Paragraf=16&Anlage=&Uebergangsrecht=",
      provider: "RIS",
      snippet: "Verifizierte RIS-Norm: § 16 Mietrechtsgesetz",
    };

    expect(findSourceUrl("§ 16 MRG", [directMrgSource])).toBe(directMrgSource.url);
  });

  it("spaces and prefixes compressed OGH Strafsenat case refs", () => {
    expect(formatSourceLabel("12Os119/06a")).toBe("OGH 12 Os 119/06a");
    expect(formatSourceLabel("15Os75/15s")).toBe("OGH 15 Os 75/15s");
    expect(formatSourceLabel("11Os246/67")).toBe("OGH 11 Os 246/67");
  });

  it("spaces and prefixes compressed OGH Zivilsenat case refs", () => {
    expect(formatSourceLabel("7Ob607/90")).toBe("OGH 7 Ob 607/90");
    expect(formatSourceLabel("1Ob8/96")).toBe("OGH 1 Ob 8/96");
  });

  it("prefixes VwGH senate codes", () => {
    expect(formatSourceLabel("5Ra12/22a")).toBe("VwGH 5 Ra 12/22a");
  });

  it("handles paired case refs with alternative AZ in parens", () => {
    expect(formatSourceLabel("12Os56/77 (12Os79/77)")).toBe("OGH 12 Os 56/77 (12 Os 79/77)");
  });

  it("leaves unrecognized tokens unchanged", () => {
    expect(formatSourceLabel("Arbitrary Text Title")).toBe("Arbitrary Text Title");
  });

  it("does not mangle an already-spaced AZ", () => {
    // Already-spaced refs should pass through (regex anchors prevent re-matching).
    expect(formatSourceLabel("12 Os 119/06a")).toBe("12 Os 119/06a");
  });

  it("falls back to title for Gesetzesnummer that's not in the display map", () => {
    // A fake 7-digit number not in LAW_GESETZESNUMMER should fall back to title.
    expect(formatSourceLabel("9999999", "Some Law Title")).toBe("Some Law Title");
  });
});
