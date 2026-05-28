import { describe, it, expect } from "vitest";
import { sanitizeParlamentUrl } from "../../supabase/functions/retrieval/parlament-url";

describe("sanitizeParlamentUrl", () => {
  it("preserves stable PAKT material URLs", () => {
    const url = "https://www.parlament.gv.at/PAKT/VHG/XXVI/I/I_00425/index.shtml";
    expect(sanitizeParlamentUrl(url, "Initiativantrag 425")).toBe(url);
  });

  it("preserves Bundesrat material URLs", () => {
    const url = "https://www.parlament.gv.at/PAKT/VHG/BR/I/I_10825/index.shtml";
    expect(sanitizeParlamentUrl(url, "BR")).toBe(url);
  });

  it("preserves press-release URLs", () => {
    const url = "https://www.parlament.gv.at/PAKT/PR/JAHR_2024/PK0395/index.shtml";
    expect(sanitizeParlamentUrl(url, "PK")).toBe(url);
  });

  it("rewrites URLs with `;jsessionid=` path injection to a Google site-search", () => {
    const out = sanitizeParlamentUrl(
      "https://www.parlament.gv.at/PAKT/VHG;jsessionid=ABCDEFGH/index.shtml",
      "Material 123",
    );
    expect(out).toContain("google.com/search");
    expect(decodeURIComponent(out)).toContain("site:parlament.gv.at");
  });

  it("rewrites URLs with `?jsessionid=` query param", () => {
    const out = sanitizeParlamentUrl(
      "https://www.parlament.gv.at/recherchieren/suche?jsessionid=XYZ&page=2",
      "Suche",
    );
    expect(out).toContain("google.com/search");
  });

  it("rewrites URLs with `request-id` server handles", () => {
    const out = sanitizeParlamentUrl(
      "https://www.parlament.gv.at/some/path?request-id=req_42",
      "fallback",
    );
    expect(out).toContain("google.com/search");
  });

  it("preserves a stable doc identifier (nr/ident/gp) in the search query when stripping a session URL", () => {
    const out = sanitizeParlamentUrl(
      "https://www.parlament.gv.at/recherchieren?jsessionid=AAA&nr=425/A&page=1",
      "anything",
    );
    expect(out).toContain("google.com/search");
    expect(decodeURIComponent(out)).toContain("425/A");
  });

  it("falls back to a Google site-search when URL is empty/null/undefined", () => {
    expect(sanitizeParlamentUrl("", "Initiativantrag 425")).toContain("google.com/search");
    expect(sanitizeParlamentUrl(null, "x")).toContain("google.com/search");
    expect(sanitizeParlamentUrl(undefined, "y")).toContain("google.com/search");
  });

  it("defaults the search term to 'Parlament' when both URL and query are empty", () => {
    const out = sanitizeParlamentUrl("", "");
    expect(decodeURIComponent(out)).toContain("site:parlament.gv.at Parlament");
  });

  it("does NOT false-positive on a short legitimate `?sid=` param (under 20 chars)", () => {
    const url = "https://www.parlament.gv.at/section?sid=42";
    expect(sanitizeParlamentUrl(url, "x")).toBe(url);
  });

  it("URL-encodes special characters in the search query", () => {
    const out = sanitizeParlamentUrl("", "§ 5 ASVG Novelle");
    expect(out).not.toContain("§");
    expect(out).not.toContain(" ");
    expect(decodeURIComponent(out)).toContain("§ 5 ASVG Novelle");
  });
});
