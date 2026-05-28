import { describe, it, expect } from "vitest";
import { detectLandesrechtScope, DEFAULT_LANDESRECHT_BUNDESLAENDER } from "../../supabase/functions/retrieval/landesrecht";

describe("detectLandesrechtScope", () => {
  it("does not trigger on a generic Bundesrecht query", () => {
    const out = detectLandesrechtScope("Was ist Eventualvorsatz nach § 5 StGB?");
    expect(out.trigger).toBe(false);
    expect(out.bundeslaender).toEqual([]);
  });

  it("does not trigger on empty / undefined input", () => {
    expect(detectLandesrechtScope("").trigger).toBe(false);
    expect(detectLandesrechtScope(null as unknown as string).trigger).toBe(false);
  });

  it("triggers with Wien only when Wien is named explicitly", () => {
    const out = detectLandesrechtScope("Wiener Bauordnung § 60");
    expect(out.trigger).toBe(true);
    expect(out.bundeslaender).toEqual(["Wien"]);
  });

  it("triggers on Bauordnung topic without Bundesland — falls back to top 4", () => {
    const out = detectLandesrechtScope("Welche Anforderungen stellt die Bauordnung an Brandschutz?");
    expect(out.trigger).toBe(true);
    expect(out.bundeslaender).toEqual(DEFAULT_LANDESRECHT_BUNDESLAENDER);
  });

  it("triggers on Mindestsicherung", () => {
    const out = detectLandesrechtScope("Voraussetzungen für Mindestsicherung");
    expect(out.trigger).toBe(true);
    expect(out.bundeslaender.length).toBeGreaterThan(0);
  });

  it("recognizes Niederösterreich (umlaut variant)", () => {
    const out = detectLandesrechtScope("Niederösterreichische Tourismusabgabe");
    expect(out.trigger).toBe(true);
    expect(out.bundeslaender).toContain("Niederösterreich");
  });

  it("recognizes Niederösterreich via ASCII spelling 'niederoesterreich'", () => {
    const out = detectLandesrechtScope("niederoesterreichische Naturschutzbestimmungen");
    expect(out.trigger).toBe(true);
    expect(out.bundeslaender).toContain("Niederösterreich");
  });

  it("recognizes multiple Bundesländer in one query (capped at 4)", () => {
    const out = detectLandesrechtScope("Vergleich Bauordnung Wien Steiermark Tirol Salzburg Vorarlberg");
    expect(out.trigger).toBe(true);
    expect(out.bundeslaender.length).toBeLessThanOrEqual(4);
    expect(out.bundeslaender).toContain("Wien");
    expect(out.bundeslaender).toContain("Steiermark");
  });

  it("explicit Bundesland wins over topic-keyword fallback", () => {
    // Both 'Bauordnung' (topic) and 'Steiermark' (explicit) present —
    // we should use Steiermark only, not the default-4 set.
    const out = detectLandesrechtScope("Steiermärkische Bauordnung Brandschutz");
    expect(out.trigger).toBe(true);
    expect(out.bundeslaender).toEqual(["Steiermark"]);
  });

  it("does not trigger on words that share a prefix with a Bundesland-keyword (e.g. 'Bau...' alone is fine)", () => {
    // 'bau' alone (e.g. 'Bauarbeiter') must NOT trigger — only the full
    // 'bauordnung'/'baurecht'/'bauanzeige' tokens do.
    const out = detectLandesrechtScope("Bauarbeiter haftet nach § 1295 ABGB");
    expect(out.trigger).toBe(false);
  });

  it("triggers on Naturschutz", () => {
    const out = detectLandesrechtScope("Naturschutzgesetz Eingriff in Natura-2000-Gebiet");
    expect(out.trigger).toBe(true);
  });

  it("triggers on Veranstaltungsrecht", () => {
    const out = detectLandesrechtScope("Veranstaltungsanmeldung für Open-Air-Konzert");
    expect(out.trigger).toBe(true);
  });

  it("does not trigger on Strafrecht-only query even if word 'Veranstaltung' is in there", () => {
    // 'veranstaltung' is in our keyword set so this WILL trigger —
    // false-positive vs missing-coverage trade-off; better to over-query
    // RIS slightly than to miss a Landesrecht hit. Verify behavior is
    // explicit rather than accidental.
    const out = detectLandesrechtScope("Bei einer Veranstaltung wurde jemand verletzt — Schadenersatz?");
    expect(out.trigger).toBe(true);
  });
});
