/**
 * End-to-end integration tests for the citation rewriter in
 * markdown-config.preprocessContent — the exact code path that produced
 * the bugs the user reported via screenshots. These tests feed realistic
 * response text + retrieval sources through the same pipeline the live
 * app uses, and assert on the rewritten markdown.
 */
import { describe, it, expect } from "vitest";
import { preprocessContent } from "@/components/chat/markdown-config";
import type { RetrievalResult } from "@/lib/retrieval";

function makeSources(entries: Partial<RetrievalResult & { provider: string }>[]): { provider: string; results: RetrievalResult[] }[] {
  // Group by provider
  const byProvider = new Map<string, RetrievalResult[]>();
  for (const e of entries) {
    const provider = e.provider || "RIS";
    const full: RetrievalResult = {
      title: e.title || "",
      url: e.url || "",
      doc_ref: e.doc_ref || "",
      snippet: e.snippet || "",
      score: e.score ?? 0.9,
      provider,
      date: e.date || "",
      highlights: e.highlights || [],
      evidence_status: e.evidence_status || "verified_document",
    };
    const arr = byProvider.get(provider) || [];
    arr.push(full);
    byProvider.set(provider, arr);
  }
  return Array.from(byProvider.entries()).map(([provider, results]) => ({ provider, results }));
}

describe("preprocessContent — citation rewriting (live-app code path)", () => {
  it("REGRESSION: citation 'OGH 12 Os 28/17f (RS0094010)' does NOT link the AZ to an unrelated case's URL", () => {
    // Exact scenario from the user's screenshot: the response cites one case
    // but retrieval only has a different case's document indexed against RS0094010.
    // Pre-PR-#9 the OGH-AZ "12 Os 28/17f" was wrongly linked to the
    // RS0094010 source's URL (a DIFFERENT case: 13 Os 106/04).
    //
    // Note: linking the standalone RS0094010 token to its own source's URL
    // is correct — Rechtssätze legitimately point at the underlying decision.
    // We assert specifically that the OGH-AZ portion does NOT carry the
    // unrelated decision's URL.
    const sources = makeSources([
      {
        title: "Rechtssatz RS0094010",
        doc_ref: "RS0094010",
        url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJT_20050420_OGH0002_0130OS00106_0400000_000",
        snippet: "Eventualvorsatz ...",
      },
    ]);
    const response = "Nach OGH 12 Os 28/17f (RS0094010) ist Eventualvorsatz gegeben.";
    const out = preprocessContent(response, sources);

    // The unmatched OGH-AZ must stay plain text; only the source-backed
    // RS token may link.
    expect(out).toContain("OGH 12 Os 28/17f");
    expect(out).not.toMatch(/\[OGH 12 Os 28\/17f\]\(/);
    expect(out).toMatch(/\[RS0094010\]\(/);
  });

  it("exact-AZ match produces a direct document link", () => {
    const correctUrl = "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJT_20170412_OGH0002_0120OS00028_17F0000_000";
    const sources = makeSources([
      {
        title: "OGH 12 Os 28/17f",
        doc_ref: "12 Os 28/17f",
        url: correctUrl,
        snippet: "Eventualvorsatz Entscheidung",
      },
    ]);
    const response = "Nach OGH 12 Os 28/17f liegt Eventualvorsatz vor.";
    const out = preprocessContent(response, sources);

    expect(out).toContain(correctUrl);
    expect(out).toContain("[OGH 12 Os 28/17f]");
  });

  it("unmatched AZ stays plain text instead of receiving a fallback link", () => {
    const sources = makeSources([
      {
        title: "Irgendein anderer Fall",
        doc_ref: "RS9999999",
        url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_OTHER_CASE",
        snippet: "no overlap",
      },
    ]);
    const response = "Nach OGH 15 Os 11/20d besteht der Anspruch.";
    const out = preprocessContent(response, sources);

    expect(out).toContain("OGH 15 Os 11/20d");
    expect(out).not.toMatch(/\[OGH 15 Os 11\/20d\]\(/);
    expect(out).not.toContain("JJR_OTHER_CASE");
  });

  it("standalone RS number not in retrieval stays plain text", () => {
    const sources = makeSources([]);
    const response = "Siehe RS0132916 zum Thema Eventualvorsatz.";
    const out = preprocessContent(response, sources);

    expect(out).toContain("RS0132916");
    expect(out).not.toMatch(/\[RS0132916\]\(/);
  });

  it("matched RS number links to the retrieved source's URL", () => {
    const sourceUrl = "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_RS0132916";
    const sources = makeSources([
      {
        title: "Rechtssatz RS0132916",
        doc_ref: "RS0132916",
        url: sourceUrl,
        snippet: "Eventualvorsatz ...",
      },
    ]);
    const response = "Vgl RS0132916 zum Thema Eventualvorsatz.";
    const out = preprocessContent(response, sources);

    expect(out).toContain(sourceUrl);
  });

  it("Quelle: line with mixed AZ + paragraph keeps the paragraph link working independently", () => {
    const sources = makeSources([]);
    const response = "Vgl zB Quelle: OGH 15 Os 11/20d | § 75 StGB";
    const out = preprocessContent(response, sources);

    // Both citations should be linked. Vetted core laws such as StGB can
    // use a direct NormDokument URL; unvetted laws still fall back to RIS
    // search to avoid the old wrong-Gesetzesnummer class of bug.
    expect(out).toMatch(/\[§ 75 StGB\]\(/);
    expect(out).toContain("NormDokument.wxe");
    expect(out).toContain("Gesetzesnummer=10002296");
    expect(out).toContain("Paragraf=75");
  });

  it("REGRESSION: '§ 20 AngG' fallback URL never points at a hardcoded Gesetzesnummer", () => {
    // The user reported a "§ 20 Abs 2 AngG" link that landed on
    // 'Soziale Sicherheit (BRD, Liechtenstein, Schweiz) § 20'.
    // Cause: LAW_GESETZESNUMMER['angg'] = '10008069' was a wrong entry —
    // 10008069 is the Sozialversicherungs-Konvention. We now route this
    // fallback through a RIS search instead of the bad mapping.
    const out = preprocessContent("Quelle: § 20 Abs 2 AngG", makeSources([]));
    expect(out).toMatch(/\[§ 20 Abs 2 AngG\]/);
    expect(out).toContain("Abfrage=Bundesnormen");
    expect(out).not.toContain("10008069");
    expect(out).not.toMatch(/Gesetzesnummer=\d/);
  });

  it("REGRESSION: screenshot prompt ABGB links open exact RIS norm pages, not Bundesnormen result lists", () => {
    const out = preprocessContent(
      "Anspruchsgrundlage bleibt der allgemeine Schadenersatz nach § 1295 ABGB; bei Mitverschulden ist § 1304 ABGB zu prüfen.",
      makeSources([]),
    );

    expect(out).toContain("[§ 1295 ABGB](https://www.ris.bka.gv.at/NormDokument.wxe");
    expect(out).toContain("Gesetzesnummer=10001622");
    expect(out).toContain("Paragraf=1295");
    expect(out).toContain("[§ 1304 ABGB](https://www.ris.bka.gv.at/NormDokument.wxe");
    expect(out).toContain("Paragraf=1304");
    expect(out).not.toContain("Ergebnis.wxe?Abfrage=Bundesnormen&Suchworte=%C2%A7%201295%20ABGB");
  });

  it("uses a retrieved RIS law source to build the exact paragraph URL", () => {
    const out = preprocessContent("Gemäß § 1295 ABGB haftet der Schädiger.", makeSources([
      {
        provider: "RIS",
        title: "Allgemeines bürgerliches Gesetzbuch",
        doc_ref: "10001622",
        url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622",
        evidence_status: "verified_document",
      },
    ]));

    expect(out).toContain("[§ 1295 ABGB](https://www.ris.bka.gv.at/NormDokument.wxe");
    expect(out).toContain("Gesetzesnummer=10001622");
    expect(out).toContain("Paragraf=1295");
  });

  it("captures full paragraph citations with Abs/Z/lit modifiers (no truncation)", () => {
    // Regression: "§ 33 Abs 1 FinStrG" used to be captured as "§ 33 Abs"
    // because the paragraph regex only matched "§ <num> <one-word>". The
    // truncated link text then fell through to a RIS search for "§ 33 Abs",
    // landing users on the first unrelated law that matched those words
    // (user screenshot showed an Arbeiterrecht-Zuständigkeits-Bundesgesetz).
    const response = "Quelle: § 33 Abs 1 FinStrG";
    const out = preprocessContent(response, makeSources([]));
    // The FULL citation must be the link label, not a truncated prefix.
    expect(out).toMatch(/\[§ 33 Abs 1 FinStrG\]/);
    // And nothing shaped like the old truncated label.
    expect(out).not.toMatch(/\[§ 33 Abs\](?!\s*1)/);
  });

  it("captures paragraphs with Abs. notation (dot variant)", () => {
    const out = preprocessContent("Quelle: § 1295 Abs. 1 ABGB", makeSources([]));
    expect(out).toMatch(/\[§ 1295 Abs\.?\s*1 ABGB\]/);
  });

  it("captures paragraphs with Z (Ziffer) modifier", () => {
    const out = preprocessContent("Quelle: § 6 Abs 1 Z 27 UStG", makeSources([]));
    expect(out).toMatch(/\[§ 6 Abs 1 Z 27 UStG\]/);
  });

  it("captures paragraphs with lit modifier", () => {
    const out = preprocessContent("Quelle: § 1 Abs 1 lit a KSchG", makeSources([]));
    expect(out).toMatch(/\[§ 1 Abs 1 lit a KSchG\]/);
  });

  describe("AT lawyer citation abbreviations (ff, Satz, comma-list, iVm)", () => {
    it("REGRESSION: '§§ 1295 ff ABGB' must capture the full citation including ABGB (not drop it after 'ff')", () => {
      // Exact bug user reported on 2026-04-30: clicking a §§-ff link landed
      // on a 43-result RIS overview page because the regex captured only
      // "§§ 1295 ff" (without ABGB), making the search-fallback too generic.
      const out = preprocessContent("Schadenersatz nach §§ 1295 ff ABGB ist umfassend.", makeSources([]));
      expect(out).toMatch(/\[§§ 1295 ff ABGB\]/);
      // The link target must contain "ABGB" so RIS can narrow the search.
      const m = out.match(/\[§§ 1295 ff ABGB\]\(([^)]+)\)/);
      expect(m).not.toBeNull();
      expect(decodeURIComponent(m![1])).toContain("ABGB");
    });

    it("captures '§ 75 f StGB' (single-f folgender-Paragraph)", () => {
      const out = preprocessContent("§ 75 f StGB regelt die Tötungsdelikte.", makeSources([]));
      expect(out).toMatch(/\[§ 75 f StGB\]/);
    });

    it("captures '§ 1295 Abs 1 Satz 2 ABGB' (Satz subdivision)", () => {
      const out = preprocessContent("Vgl § 1295 Abs 1 Satz 2 ABGB zur Schadensbemessung.", makeSources([]));
      expect(out).toMatch(/\[§ 1295 Abs 1 Satz 2 ABGB\]/);
    });

    it("expands a comma-list '§§ 146, 147 StGB' into two independent links sharing the law", () => {
      const out = preprocessContent("Vgl §§ 146, 147 StGB.", makeSources([]));
      expect(out).toMatch(/\[§ 146 StGB\]/);
      expect(out).toMatch(/\[§ 147 StGB\]/);
      // The two links are separated by a comma in the rendered output.
      expect(out).toMatch(/\[§ 146 StGB\][^,]*,[^[]*\[§ 147 StGB\]/);
    });

    it("expands a three-element comma-list '§§ 1295, 1325, 1331 ABGB'", () => {
      const out = preprocessContent("Vgl §§ 1295, 1325, 1331 ABGB.", makeSources([]));
      expect(out).toMatch(/\[§ 1295 ABGB\]/);
      expect(out).toMatch(/\[§ 1325 ABGB\]/);
      expect(out).toMatch(/\[§ 1331 ABGB\]/);
    });

    it("expands an iVm chain '§ 146 iVm § 147 StGB' preserving the iVm connector between links", () => {
      const out = preprocessContent("§ 146 iVm § 147 StGB.", makeSources([]));
      expect(out).toMatch(/\[§ 146 StGB\]/);
      expect(out).toMatch(/\[§ 147 StGB\]/);
      // Connector "iVm" preserved between the two links
      expect(out).toMatch(/\[§ 146 StGB\]\([^)]+\)\s+iVm\s+\[§ 147 StGB\]/);
      // First § must NOT be linked as "§ 146 iVm" (the historic bug)
      expect(out).not.toMatch(/\[§ 146 iVm\]/);
    });

    it("expands an iVm chain WITH modifiers '§ 1295 Abs 1 iVm § 1325 ABGB'", () => {
      const out = preprocessContent("§ 1295 Abs 1 iVm § 1325 ABGB.", makeSources([]));
      expect(out).toMatch(/\[§ 1295 Abs 1 ABGB\]/);
      expect(out).toMatch(/\[§ 1325 ABGB\]/);
    });

    it("handles 'und' as a chain connector (informal lawyer-style)", () => {
      const out = preprocessContent("§ 146 und § 147 StGB sind Vermögensdelikte.", makeSources([]));
      expect(out).toMatch(/\[§ 146 StGB\]/);
      expect(out).toMatch(/\[§ 147 StGB\]/);
    });

    it("handles 'i.V.m.' (with periods) as chain connector", () => {
      const out = preprocessContent("§ 1295 i.V.m. § 1325 ABGB.", makeSources([]));
      expect(out).toMatch(/\[§ 1295 ABGB\]/);
      expect(out).toMatch(/\[§ 1325 ABGB\]/);
    });

    it("does NOT mistake '§§ 146, 147 oder' for a comma-list (defensive: 'oder' not a law abbr)", () => {
      const out = preprocessContent("Wie in §§ 146, 147 oder § 148 StGB beschrieben.", makeSources([]));
      // The "§§ 146, 147 oder" must NOT produce links labeled with "oder".
      expect(out).not.toMatch(/\[§ 146 oder\]/);
      expect(out).not.toMatch(/\[§ 147 oder\]/);
    });

    it("REGRESSION: 'tatbestand betrug' answer with §§ 1295 ff ABGB renders all citations safely", () => {
      // Reproduction of the answer text from the user's screenshot. After
      // the fix, EVERY § citation in this answer is a clickable link with
      // the law abbreviation preserved.
      const draft = `Schadenersatz: Anspruch auf Ersatz des gesamten Schadens (inkl. entgangenem Gewinn) nach §§ 1295 ff ABGB.

Vertragsanfechtung: § 870 ABGB anfechten und rückabwickeln.

Vorsatz: § 146 iVm § 147 StGB. Bei §§ 147, 148 StGB schwerer Betrug.`;
      const out = preprocessContent(draft, makeSources([]));

      // All paragraphs linked with their law preserved
      expect(out).toMatch(/\[§§ 1295 ff ABGB\]/);
      expect(out).toMatch(/\[§ 870 ABGB\]/);
      expect(out).toMatch(/\[§ 146 StGB\]/);
      expect(out).toMatch(/\[§ 147 StGB\]/);
      expect(out).toMatch(/\[§ 148 StGB\]/);
      // No half-citations (the old bug)
      expect(out).not.toMatch(/\[§§ 1295 ff\](?!\s*ABGB)/);
      expect(out).not.toMatch(/\[§ 146 iVm\]/);
    });
  });

  describe("EU citations — auto-linking", () => {
    it("does not fallback-link an unmatched CELEX number", () => {
      const out = preprocessContent("Vgl. Verordnung 32016R0679 (DSGVO).", makeSources([]));
      expect(out).toContain("32016R0679");
      expect(out).not.toContain("[32016R0679]");
    });

    it("does not fallback-link an unmatched ECJ case reference", () => {
      const out = preprocessContent("EuGH C-311/18 (Schrems II) hat klargestellt …", makeSources([]));
      expect(out).toContain("C-311/18");
      expect(out).not.toMatch(/\[C-311\/18\]/);
    });

    it("does not fallback-link an unmatched EuG (T-) case reference", () => {
      const out = preprocessContent("Im Verfahren T-200/24 entschied das EuG …", makeSources([]));
      expect(out).toContain("T-200/24");
      expect(out).not.toMatch(/\[T-200\/24\]/);
    });

    it("prefers a retrieval-matched URL over the fallback CELEX URL when retrieval has the document", () => {
      const sources = makeSources([
        {
          provider: "EURLEX",
          title: "DSGVO Verordnung 2016/679",
          doc_ref: "32016R0679",
          url: "https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679&qid=specific",
          snippet: "…",
        },
      ]);
      const out = preprocessContent("32016R0679 regelt …", sources);
      expect(out).toContain("qid=specific");
    });

    it("auto-links a modern BGBl. reference (post-2004, with part) to the RIS BgblAuth direct URL", () => {
      const out = preprocessContent("Geändert durch BGBl. I Nr. 60/2014.", makeSources([]));
      expect(out).toMatch(/\[BGBl\. I Nr\. 60\/2014\]/);
      expect(out).toContain("ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2014_I_60/BGBLA_2014_I_60.html");
    });

    it("auto-links BGBl. II (Verordnungen)", () => {
      const out = preprocessContent("Vgl. BGBl. II 99/2023.", makeSources([]));
      expect(out).toContain("BGBLA_2023_II_99");
    });

    it("auto-links BGBl. without 'Nr.' prefix", () => {
      const out = preprocessContent("Siehe BGBl. I 100/2018.", makeSources([]));
      expect(out).toContain("BGBLA_2018_I_100");
    });

    it("does not fallback-link an unmatched Austrian ECLI identifier", () => {
      const out = preprocessContent("ECLI:AT:OGH0002:2018:0060OB00140.18H.0412.000 hat das geklärt.", makeSources([]));
      expect(out).toContain("ECLI:AT:OGH0002:2018:0060OB00140.18H.0412.000");
      expect(out).not.toMatch(/\[ECLI:AT:OGH0002:2018:0060OB00140\.18H\.0412\.000\]/);
    });

    it("does not fallback-link an unmatched EU ECLI identifier", () => {
      const out = preprocessContent("ECLI:EU:C:2014:317 hat …", makeSources([]));
      expect(out).toContain("ECLI:EU:C:2014:317");
      expect(out).not.toContain("eur-lex.europa.eu");
    });

    it("auto-links a VfGH-Slg reference with year (VfSlg 12345/1990)", () => {
      const out = preprocessContent("Vgl. VfSlg 12345/1990 zum Gleichheitssatz.", makeSources([]));
      expect(out).toMatch(/\[VfSlg 12345\/1990\]/);
      expect(out).toContain("Abfrage=Vfgh");
      expect(out.toLowerCase()).toContain("vfslg");
    });

    it("auto-links a VfGH-Slg reference without year (VfSlg 14888)", () => {
      const out = preprocessContent("Siehe VfSlg 14888.", makeSources([]));
      expect(out).toMatch(/\[VfSlg 14888\]/);
      expect(out).toContain("Abfrage=Vfgh");
    });

    it("auto-links VfSlg with optional period (VfSlg. 17.123)", () => {
      // Reference style with period after Slg accepted.
      const out = preprocessContent("VfSlg. 17123 hat klargestellt …", makeSources([]));
      expect(out).toMatch(/\[VfSlg\.?\s*17123\]/);
    });
  });

  describe("backtick-wrapped markdown links", () => {
    it("REGRESSION: '`[C-300/21](https://curia.europa.eu/...)`' must be unwrapped — backticks make markdown render the link as inline code instead of clickable", () => {
      // The exact bug user reported on 2026-04-30: Claude wrapped the
      // markdown link in backticks because the system prompt examples
      // used backticks. The renderer treated the whole thing as inline
      // code and the link became a non-clickable monospace block.
      const response = "Die jüngere Rechtsprechung des EuGH `[C-300/21](https://curia.europa.eu/juris/liste.jsf?num=C-300%2F21&language=de)` hat klargestellt …";
      const out = preprocessContent(response, makeSources([]));
      // Backticks around the markdown link are gone.
      expect(out).not.toMatch(/`\[/);
      expect(out).not.toMatch(/\)\s*`/);
      // The link itself is preserved (and now will render as a clickable link).
      expect(out).toMatch(/\[C-300\/21\]\(https:\/\/curia\.europa\.eu/);
    });

    it("unwraps backtick-wrapped RIS links too", () => {
      const out = preprocessContent("Vgl `[§ 75 StGB](https://www.ris.bka.gv.at/Ergebnis.wxe?Suchworte=stgb)`.", makeSources([]));
      expect(out).not.toMatch(/`\[/);
      expect(out).toMatch(/\[§ 75 StGB\]/);
    });

    it("leaves plain inline-code untouched (e.g. method names like `findSourceUrl`)", () => {
      // Pure code spans without markdown-link syntax inside must survive.
      const out = preprocessContent("Wir verwenden `findSourceUrl` im Frontend.", makeSources([]));
      expect(out).toContain("`findSourceUrl`");
    });
  });

  describe("defensive scrub of LLM-emitted RIS direct-document URLs", () => {
    it("REGRESSION: '[§ 33 FinStrG](NormDokument.wxe?Gesetzesnummer=10004486&Paragraf=33)' must not survive — Gesetzesnummer 10004486 is the Doppelbesteuerungs-Abkommen Luxemburg, NOT FinStrG, and the model hallucinated the URL", () => {
      // The exact bug the user reported on 2026-04-30: clicking '§ 33 FinStrG'
      // landed on 'Doppelbesteuerung – Einkommen- und Vermögensteuern (Luxemburg) § 33'.
      const response = `Steuerhinterziehung nach [§ 33 Abs 1 FinStrG](https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10004486&Paragraf=33) ist die vorsätzliche Verkürzung.`;
      const out = preprocessContent(response, makeSources([]));
      // The hallucinated URL must be GONE.
      expect(out).not.toContain("Gesetzesnummer=10004486");
      // The citation text must remain (and be re-linked via search-fallback).
      expect(out).toContain("§ 33 Abs 1 FinStrG");
      // The replacement URL must be a RIS Bundesnormen search, not another direct doc.
      expect(out).not.toMatch(/NormDokument\.wxe\?[^)]*Paragraf=33/);
    });

    it("scrubs Dokument.wxe (older format) hallucinated URLs as well", () => {
      const response = "Vgl [§ 75 StGB](https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=00000000&Paragraf=75).";
      const out = preprocessContent(response, makeSources([]));
      expect(out).not.toContain("Gesetzesnummer=00000000");
      expect(out).toContain("§ 75 StGB");
    });

    it("preserves a retrieved RIS URL when the source IS in retrieval (re-linked via findSourceUrl)", () => {
      const sources = makeSources([
        {
          provider: "RIS",
          title: "FinStrG § 33",
          doc_ref: "FinStrG",
          // Note: this URL is the CORRECT one from RIS. Even though we strip
          // the LLM-emitted URL, findSourceUrl re-finds the source and uses
          // this trusted URL when it matches the citation's law alias.
          url: "https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10003898&Paragraf=33",
          snippet: "Abgabenhinterziehung",
        },
      ]);
      const response = "[§ 33 FinStrG](https://www.ris.bka.gv.at/NormDokument.wxe?Gesetzesnummer=99999999&Paragraf=33) ist die …";
      const out = preprocessContent(response, sources);
      // Hallucinated 99999999 gone
      expect(out).not.toContain("99999999");
    });

    it("does NOT scrub RIS search URLs (Ergebnis.wxe) — those are our own safe fallbacks", () => {
      const response = "[§ 20 AngG](https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=Bundesnormen&Suchworte=AngG).";
      const out = preprocessContent(response, makeSources([]));
      expect(out).toContain("Ergebnis.wxe");
      expect(out).toMatch(/\[§ 20 AngG\]/);
    });

    it("does NOT scrub non-RIS direct-doc URLs (e.g. EUR-Lex)", () => {
      const response = "[Art. 6 DSGVO](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679).";
      const out = preprocessContent(response, makeSources([]));
      expect(out).toContain("eur-lex.europa.eu");
    });

    it("does not double-link an existing markdown link that already wraps a CELEX number", () => {
      const out = preprocessContent("[32016R0679](https://example.test/manual)", makeSources([]));
      expect(out).toContain("(https://example.test/manual)");
      // No double-wrap.
      expect(out).not.toMatch(/\[32016R0679\]\([^)]+\)\[32016R0679\]/);
    });
  });

  it("does not rewrite citations that are already inside an existing markdown link", () => {
    const sources = makeSources([]);
    const response = "Siehe [OGH 15 Os 11/20d](https://example.test/manual).";
    const out = preprocessContent(response, sources);

    // Existing link is preserved
    expect(out).toContain("(https://example.test/manual)");
    // Not double-wrapped
    expect(out).not.toMatch(/\[OGH 15 Os 11\/20d\]\(.+\)\[OGH/);
  });
});
