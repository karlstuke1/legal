/**
 * Lawyer-realistic end-to-end smoke tests for the citation-rewriting
 * pipeline. We can't drive the deployed Lovable app from this sandbox,
 * but we CAN feed realistic Claude-style answer drafts through
 * preprocessContent (the exact rendering layer the user sees) and
 * verify that the on-screen Markdown contains:
 *   - clickable links for every cited norm/case
 *   - link targets that route to the correct provider host
 *   - no Backtick-wrapping that would break Markdown rendering
 *   - no broad hardcoded-Gesetzesnummer fallbacks outside the vetted
 *     direct-link allowlist (the "wrong document" bug class)
 *
 * The fixtures below are written by hand to mimic exactly what Claude
 * Sonnet 4.6 produces under the current system prompt — including the
 * occasional accidental Backtick-wrap that PR #19 unwraps.
 */
import { describe, it, expect } from "vitest";
import { preprocessContent } from "@/components/chat/markdown-config";

// Helper: minimal source-group factory matching the live RetrievalResult shape.
function noSources() {
  return [] as { provider: string; results: never[] }[];
}

describe("real-lawyer-questions: rendering pipeline end-to-end", () => {
  it("Frage 1 — Mord § 75 StGB: norms must auto-link without going to a wrong document", () => {
    // What Claude Sonnet 4.6 typically writes for this question, given the
    // current system prompt. NB: we're testing rendering, not LLM output.
    const draft = `Mord nach § 75 StGB ist die vorsätzliche Tötung eines anderen Menschen mit Freiheitsstrafe von zehn bis zwanzig Jahren oder lebenslanger Freiheitsstrafe.

## Tatbestandsmerkmale

**Objektiver Tatbestand:**
- Tötung eines anderen Menschen
- Kausalität zwischen Handlung und Tod

**Subjektiver Tatbestand — Vorsatzformen nach § 5 StGB:**
- Eventualvorsatz (§ 5 Abs 1 StGB): ernstlich für möglich halten und sich damit abfinden
- Wissentlichkeit (§ 5 Abs 3 StGB): Tod als sichere Folge erkannt
- Absichtlichkeit (§ 5 Abs 2 StGB): Tod ist das Ziel

## Abgrenzung zu § 76 StGB (Totschlag)

Quelle: § 76 StGB. Privilegierung bei "allgemein begreiflicher heftiger Gemütsbewegung".`;

    const out = preprocessContent(draft, noSources());

    // Every § citation must be a Markdown link
    expect(out).toMatch(/\[§ 75 StGB\]\(https:\/\/www\.ris\.bka\.gv\.at\/[^)]+\)/);
    expect(out).toMatch(/\[§ 5 Abs 1 StGB\]\(https:\/\/www\.ris\.bka\.gv\.at\/[^)]+\)/);
    expect(out).toMatch(/\[§ 76 StGB\]\(https:\/\/www\.ris\.bka\.gv\.at\/[^)]+\)/);

    // Vetted StGB paragraphs may use direct NormDokument links.
    expect(out).toContain("Gesetzesnummer=10002296");
    expect(out).toContain("Paragraf=75");
    expect(out).toContain("Paragraf=5");
    expect(out).toContain("Paragraf=76");

    // Backtick-wrap guard: no inline-code wraps a Markdown link
    expect(out).not.toMatch(/`\[[^\]]+\]\(/);
  });

  it("Frage 2 — Selbstanzeige § 29 FinStrG: must NEVER land on Doppelbesteuerung Luxemburg", () => {
    // The exact bug scenario the user reported on 2026-04-30.
    const draft = `Die strafbefreiende Selbstanzeige nach § 29 FinStrG erfordert vier kumulative Voraussetzungen.

Quelle: § 29 FinStrG, § 29 Abs 5 FinStrG`;
    const out = preprocessContent(draft, noSources());

    expect(out).toMatch(/\[§ 29 FinStrG\]/);
    // Must NOT contain a NormDokument URL with a Gesetzesnummer (would be wrong)
    expect(out).not.toMatch(/NormDokument\.wxe\?[^)]*Gesetzesnummer=\d+/);
    // The link, whatever URL it has, must point at ris.bka.gv.at (RIS search fallback)
    const match = out.match(/\[§ 29 FinStrG\]\(([^)]+)\)/);
    expect(match).not.toBeNull();
    expect(match![1]).toContain("ris.bka.gv.at");
    // It must NOT contain a literal Gesetzesnummer that could send to a wrong doc
    expect(match![1]).not.toMatch(/Gesetzesnummer=10004486/); // Doppelbesteuerung Luxemburg
  });

  it("Frage 3 — Kündigungsfristen § 20 AngG: regression on the historic 'wrong document' bug", () => {
    const draft = `Nach § 20 Abs 2 AngG sind die Kündigungsfristen gestaffelt:
- bis 2. Dienstjahr: 6 Wochen
- nach 2. Dienstjahr: 2 Monate

Quelle: § 20 Abs 2 AngG, § 20 Abs 3 AngG`;
    const out = preprocessContent(draft, noSources());

    expect(out).toMatch(/\[§ 20 Abs 2 AngG\]/);
    expect(out).toMatch(/\[§ 20 Abs 3 AngG\]/);
    // Historic bug: § 20 AngG → 'Soziale Sicherheit BRD/Liechtenstein/Schweiz § 20'.
    // Cause was a wrong Gesetzesnummer in our static map (10008069). Verify
    // the URL never carries that literal.
    expect(out).not.toContain("10008069");
    expect(out).not.toMatch(/Gesetzesnummer=\d+/);
  });

  it("Frage 4 — DSGVO Schadenersatz: ECJ case must be a clickable Curia link, NEVER inline-code", () => {
    // The Backtick-wrapping bug (PR #19): Claude wrapped the markdown link
    // in backticks because the system prompt examples used backticks.
    // preprocessContent unwraps them defensively.
    const draft = `Die jüngere Rechtsprechung des EuGH \`[C-300/21](https://curia.europa.eu/juris/liste.jsf?num=C-300%2F21&language=de)\` hat klargestellt, dass keine Erheblichkeitsschwelle erforderlich ist.

Vgl auch C-340/21 zur Beweislast.`;
    const out = preprocessContent(draft, noSources());

    // The backticks-around-link must be unwrapped
    expect(out).not.toMatch(/`\[C-300/);
    // The link still works
    expect(out).toMatch(/\[C-300\/21\]\(https:\/\/curia\.europa\.eu/);
    // Unmatched hard citations should remain plain text instead of getting
    // a plausible-looking fallback link.
    expect(out).toContain("C-340/21");
    expect(out).not.toMatch(/\[C-340\/21\]\(/);
  });

  it("Frage 4 (continued) — unmatched CELEX numbers should not auto-link", () => {
    const draft = `Art. 82 DSGVO (Verordnung 32016R0679) regelt den Schadenersatz.`;
    const out = preprocessContent(draft, noSources());
    expect(out).toContain("32016R0679");
    expect(out).not.toMatch(/\[32016R0679\]\(/);
  });

  it("Frage 6 — Verfassungsrecht: VfSlg references must auto-link to RIS-Vfgh search", () => {
    const draft = `Der Gleichheitssatz (Art. 7 B-VG) wurde vom VfGH in VfSlg 16404/2001 präzisiert.

Vgl auch VfSlg. 14888 zur Sachlichkeitsprüfung.`;
    const out = preprocessContent(draft, noSources());

    // Both VfSlg references — with year and without — must be linked
    expect(out).toMatch(/\[VfSlg 16404\/2001\]/);
    expect(out).toMatch(/\[VfSlg\.?\s*14888\]/);
    expect(out).toMatch(/Abfrage=Vfgh/);
  });

  it("Frage 7 — adversarial: a non-existent norm '§ 999 ABGB' rendered by an obedient LLM", () => {
    // Behavior we WANT: no fabricated content. We can't directly test the
    // LLM's behavior here, only that IF it correctly says "diese Norm
    // konnte nicht verifiziert werden", the rendering pipeline doesn't
    // accidentally turn the warning text into a clickable link.
    const draft = `Eine Norm mit der Bezeichnung "§ 999 ABGB" konnte nicht verifiziert werden — bitte überprüfen Sie dies anhand der Primärquelle.`;
    const out = preprocessContent(draft, noSources());

    // The "§ 999 ABGB" mention IS a valid §-pattern → it gets linked to a
    // search URL. That's acceptable: the user clicking it sees an empty
    // RIS search, which makes the non-existence evident. What MUST NOT
    // happen is a NormDokument URL pretending the norm exists.
    expect(out).not.toMatch(/NormDokument\.wxe\?[^)]*Paragraf=999/);
  });

  it("Frage 8 — complex case: multiple norms across FinStrG and BAO must all auto-link safely", () => {
    const draft = `Empfohlene Schritte:
1. Selbstanzeige nach § 29 FinStrG
2. Verjährung prüfen: § 31 FinStrG (Strafverfolgung) und § 207 BAO (Festsetzung)
3. Bei Vorsatz: Festsetzungsverjährung 10 Jahre nach § 207 Abs 2 BAO`;
    const out = preprocessContent(draft, noSources());

    expect(out).toMatch(/\[§ 29 FinStrG\]/);
    expect(out).toMatch(/\[§ 31 FinStrG\]/);
    expect(out).toMatch(/\[§ 207 BAO\]/);
    expect(out).toMatch(/\[§ 207 Abs 2 BAO\]/);

    // No wrong-document time-bombs
    expect(out).not.toMatch(/Gesetzesnummer=\d+/);
  });
});

describe("rendering invariants the system prompt + pipeline guarantee", () => {
  it("verified RIS source wins for § 75 StGB instead of a generic search utility", () => {
    const verifiedUrl = "https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10002296&Paragraf=75";
    const draft = "Mord ist in § 75 StGB geregelt.";
    const out = preprocessContent(draft, [{
      provider: "RIS",
      results: [{
        doc_ref: "§ 75 StGB",
        title: "§ 75 Strafgesetzbuch",
        date: "",
        url: verifiedUrl,
        score: 0.99,
        highlights: ["§ 75", "StGB"],
        provider: "RIS",
        snippet: "Verifizierte RIS-Norm: § 75 Strafgesetzbuch",
        evidence_status: "verified_document",
      }],
    }]);

    expect(out).toContain(`[§ 75 StGB](${verifiedUrl})`);
  });

  it("RIS search utilities are navigation fallback, not source-backed proof", () => {
    const badSearchUrl = "https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=Bundesnormen&Suchworte=unrelated";
    const draft = "Mord ist in § 75 StGB geregelt.";
    const out = preprocessContent(draft, [{
      provider: "RIS",
      results: [{
        doc_ref: "FALLBACK-RIS-BUNDESRECHT",
        title: "RIS Bundesrecht: unrelated",
        date: "",
        url: badSearchUrl,
        score: 0.99,
        highlights: ["Suche"],
        provider: "RIS",
        evidence_status: "search_utility",
      }],
    }]);

    expect(out).toContain("[§ 75 StGB](https://www.ris.bka.gv.at/NormDokument.wxe");
    expect(out).toContain("Gesetzesnummer=10002296");
    expect(out).toContain("Paragraf=75");
    expect(out).not.toContain(badSearchUrl);
  });

  it("invariant: only vetted core laws may use direct Gesetzesnummer fallback URLs", () => {
    // We allow direct NormDokument fallbacks only for a small vetted set
    // such as ABGB/STGB. Unvetted laws still route through RIS search so
    // a stale or wrong static number cannot silently open the wrong law.
    const draft = `Quelle: § 1295 ABGB | § 75 StGB | § 33 FinStrG | § 20 AngG | RS0094010 | OGH 6 Ob 140/18h`;
    const out = preprocessContent(draft, noSources());
    expect(out).toContain("Gesetzesnummer=10001622");
    expect(out).toContain("Gesetzesnummer=10002296");
    expect(out).not.toContain("Gesetzesnummer=10003898");
    expect(out).not.toContain("Gesetzesnummer=10008069");
  });

  it("invariant: a Markdown link is never wrapped in inline-code backticks", () => {
    const draft = "Vgl `[§ 75 StGB](https://example.test/x)` und `[OGH 6 Ob 140/18h](https://example.test/y)`.";
    const out = preprocessContent(draft, noSources());
    expect(out).not.toMatch(/`\[/);
    expect(out).not.toMatch(/\)\s*`/);
  });

  it("invariant: standalone Aktenzeichen-shaped citations are not fallback-linked", () => {
    const draft = "Vgl OGH 12 Os 28/17f und 4 Ob 87/18s.";
    const out = preprocessContent(draft, noSources());
    expect(out).toContain("OGH 12 Os 28/17f");
    expect(out).not.toMatch(/\[OGH 12 Os 28\/17f\]/);
  });
});
