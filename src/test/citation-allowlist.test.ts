import { describe, it, expect } from "vitest";
import {
  extractCitationAllowlist,
  buildAllowlistBlock,
} from "../../supabase/functions/chat/citation-allowlist";

describe("extractCitationAllowlist", () => {
  it("returns [] for empty / undefined / non-string input", () => {
    expect(extractCitationAllowlist(undefined)).toEqual([]);
    expect(extractCitationAllowlist(null)).toEqual([]);
    expect(extractCitationAllowlist("")).toEqual([]);
    expect(extractCitationAllowlist("   ")).toEqual([]);
    // @ts-expect-error — intentional bad type
    expect(extractCitationAllowlist(42)).toEqual([]);
  });

  it("picks up Ref: markers from tool-formatted output", () => {
    const sourceContext = `
1. [RIS] OGH-Urteil vom 12.04.2018 | Ref: 6 Ob 140/18h | URL: https://example.test/x | INHALT: ...
2. [RIS] Rechtssatz | Ref: RS0094010 | URL: https://example.test/y | INHALT: ...
`.trim();
    const allowlist = extractCitationAllowlist(sourceContext);
    expect(allowlist).toContain("6 Ob 140/18h");
    expect(allowlist).toContain("RS0094010");
  });

  it("extracts RS numbers, GZ, and § references from snippet body", () => {
    const sourceContext = `1. [RIS] Sample | Ref: foo | URL: x | INHALT: Der OGH bestätigt in 11 Os 2/22m und unter Verweis auf RS0094010 die Anwendung von § 75 StGB.`;
    const allowlist = extractCitationAllowlist(sourceContext);
    expect(allowlist).toContain("RS0094010");
    expect(allowlist).toContain("11 Os 2/22m");
    expect(allowlist).toContain("§ 75 StGB");
  });

  it("extracts ECLI identifiers", () => {
    const sourceContext = `INHALT: vgl. ECLI:AT:OGH0002:2022:0060OB00140.18H.0412.000 sowie ECLI:EU:C:2012:23 ...`;
    const allowlist = extractCitationAllowlist(sourceContext);
    expect(allowlist.some((c) => c.startsWith("ECLI:AT:OGH"))).toBe(true);
    expect(allowlist).toContain("ECLI:EU:C:2012:23");
  });

  it("extracts Art. + law references", () => {
    const sourceContext = `INHALT: Nach Art. 6 Abs. 1 DSGVO ist die Verarbeitung rechtmäßig, vgl. auch Art. 5 GRCh.`;
    const allowlist = extractCitationAllowlist(sourceContext);
    expect(allowlist.some((c) => /Art\.?\s*6/.test(c) && /DSGVO/.test(c))).toBe(true);
    expect(allowlist.some((c) => /Art\.?\s*5/.test(c) && /GRCh/.test(c))).toBe(true);
  });

  it("deduplicates citations that appear multiple times", () => {
    const sourceContext = `RS0094010 ... RS0094010 ... noch einmal rs0094010`;
    const allowlist = extractCitationAllowlist(sourceContext);
    const matches = allowlist.filter((c) => c.toUpperCase() === "RS0094010");
    expect(matches.length).toBe(1);
  });

  it("normalizes RS numbers to uppercase", () => {
    const allowlist = extractCitationAllowlist("siehe rs0094010 oben");
    expect(allowlist).toContain("RS0094010");
    expect(allowlist).not.toContain("rs0094010");
  });

  it("collapses internal whitespace", () => {
    const allowlist = extractCitationAllowlist("§   146   StGB regelt Betrug");
    expect(allowlist).toContain("§ 146 StGB");
  });

  it("caps the result at 60 entries to keep prompt size bounded", () => {
    const lines: string[] = [];
    for (let i = 0; i < 200; i++) {
      // Each line forces a unique RS number so the Set doesn't collapse them.
      lines.push(`Ref: RS${String(i).padStart(7, "0")}`);
    }
    const allowlist = extractCitationAllowlist(lines.join("\n"));
    expect(allowlist.length).toBeLessThanOrEqual(60);
  });

  it("does NOT pick up unrelated numeric junk as a citation", () => {
    const allowlist = extractCitationAllowlist("Telefonnummer 0664 1234567 und IBAN AT12 3456 7890 1234 5678");
    expect(allowlist).toEqual([]);
  });

  it("REGRESSION: does NOT accept provider names (RIS, FINDOK, …) as citations", () => {
    // Bug 2026-05-16: our search-fallback tool output formats no-result
    // entries as "Ref: RIS" / "Ref: FINDOK" (placeholder when no real
    // GZ/RS is known). The allowlist was happily accepting those, which
    // told the LLM it could cite "RIS" as a source — defeating the
    // whole anti-hallucination guard. The blocklist now strips them.
    const formatted = `1. [RIS] RIS Bundesrecht: "verjährung" | Ref: RIS | URL: https://x | INHALT: keine Treffer
2. [FINDOK] Findok-Suche | Ref: FINDOK | URL: https://y | INHALT: keine Treffer`;
    const allowlist = extractCitationAllowlist(formatted);
    expect(allowlist).not.toContain("RIS");
    expect(allowlist).not.toContain("FINDOK");
    // Should also reject lowercase variants and other provider tokens
    expect(allowlist).not.toContain("ris");
    expect(allowlist).not.toContain("findok");
  });

  it("blocklist also rejects court-name-only refs (OGH, VwGH, VfGH)", () => {
    const formatted = `1. [RIS] Sample | Ref: OGH | URL: x | INHALT: ...`;
    const allowlist = extractCitationAllowlist(formatted);
    expect(allowlist).not.toContain("OGH");
  });

  it("end-to-end: realistic tool-formatted output produces a useful allowlist", () => {
    // Mirrors the format built at chat/index.ts:245-251 (search_law tool result)
    const formatted = `1. [RIS] OGH-Entscheidung 6 Ob 140/18h | Ref: 6 Ob 140/18h | URL: https://www.ris.bka.gv.at/Dokument.wxe?... |
INHALT: Der OGH hat in der Entscheidung 6 Ob 140/18h ausgesprochen, dass nach § 1295 ABGB ...

2. [RIS] Rechtssatz RS0094010 | Ref: RS0094010 | URL: https://www.ris.bka.gv.at/Dokument.wxe?... |
INHALT: RS0094010 - Die Haftung nach § 1295 Abs. 1 ABGB setzt voraus ...

3. [FINDOK] § 75 StGB - Mord | Ref: § 75 StGB | URL: https://findok.bmf.gv.at/... |
INHALT: § 75 StGB normiert den Tatbestand des Mordes ...`;

    const allowlist = extractCitationAllowlist(formatted);
    expect(allowlist).toContain("6 Ob 140/18h");
    expect(allowlist).toContain("RS0094010");
    expect(allowlist).toContain("§ 75 StGB");
    expect(allowlist).toContain("§ 1295 ABGB");
    // Cap the upper bound so this stays a sanity check, not a fixed-shape test
    expect(allowlist.length).toBeGreaterThanOrEqual(4);
    expect(allowlist.length).toBeLessThanOrEqual(60);
  });
});

describe("buildAllowlistBlock", () => {
  it("REGRESSION: empty allowlist emits a HARD PROHIBITION block — must not return empty string", () => {
    // Bug 2026-04-30: user asked a question whose retrieval missed the
    // matching RS-number, allowlist was empty, builder returned "" so
    // the system prompt had no anti-hallucination guard. Claude then
    // emitted 4 fabricated RS-numbers + 4 fabricated OGH-Geschäftszahlen
    // from training data. With the prohibition block injected even on
    // empty allowlists, the model is explicitly told NOT to fall back
    // to training-data citations.
    const out = buildAllowlistBlock([]);
    expect(out).not.toBe("");
    expect(out).toContain("KEINE QUELLEN ABRUFBAR");
    expect(out).toContain("VERBOTEN");
    expect(out).toContain("Trainingswissen");
    expect(out).toContain("vgl. ständige Rechtsprechung");
  });

  it("renders a strict German allowlist block with all entries", () => {
    const block = buildAllowlistBlock(["6 Ob 140/18h", "RS0094010", "§ 75 StGB"]);
    expect(block).toContain("ZITAT-ALLOWLIST");
    expect(block).toContain("VERBINDLICH");
    expect(block).toContain("AUSSCHLIESSLICH");
    expect(block).toContain("- 6 Ob 140/18h");
    expect(block).toContain("- RS0094010");
    expect(block).toContain("- § 75 StGB");
    // Includes the fallback instruction so the model has a graceful exit
    expect(block).toContain("vgl. ständige Rechtsprechung");
  });

  it("starts with a blank line so it can be appended to existing prompt sections", () => {
    const block = buildAllowlistBlock(["RS0094010"]);
    expect(block.startsWith("\n\n")).toBe(true);
  });
});
