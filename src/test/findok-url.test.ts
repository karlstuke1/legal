import { describe, it, expect } from "vitest";
import { sanitizeFindokUrl } from "../../supabase/functions/retrieval/findok-url";

describe("sanitizeFindokUrl", () => {
  it("replaces URLs with expired Spring Webflow session tokens with a Google site-search", () => {
    const out = sanitizeFindokUrl(
      "https://findok.bmf.gv.at/findok?execution=e1s1",
      "EStR 2000",
    );
    expect(out.startsWith("https://www.google.com/search?q=")).toBe(true);
    expect(decodeURIComponent(out)).toContain("site:findok.bmf.gv.at");
    expect(decodeURIComponent(out)).toContain("EStR 2000");
  });

  it("extracts a stable doc id from the URL and uses it as the search term", () => {
    const out = sanitizeFindokUrl(
      "https://findok.bmf.gv.at/findok?execution=e2s5&_eventId=viewDocument&id=DOK-12345",
      "fallback query",
    );
    expect(decodeURIComponent(out)).toContain("DOK-12345");
    // Falls back to the stable id, not the generic query
    expect(decodeURIComponent(out)).not.toContain("fallback query");
  });

  it("preserves already-stable URLs without session tokens", () => {
    const stable = "https://findok.bmf.gv.at/some/stable/path";
    expect(sanitizeFindokUrl(stable, "anything")).toBe(stable);
  });

  it("falls back to Google site-search when URL is empty", () => {
    const out = sanitizeFindokUrl("", "Umsatzsteuer Kleinunternehmer");
    expect(out.startsWith("https://www.google.com/search?q=")).toBe(true);
    expect(decodeURIComponent(out)).toContain("Umsatzsteuer Kleinunternehmer");
  });

  it("falls back to Google site-search when URL is null/undefined", () => {
    expect(sanitizeFindokUrl(null, "EStR")).toContain("google.com/search");
    expect(sanitizeFindokUrl(undefined, "EStR")).toContain("google.com/search");
  });

  it("defaults the query to FINDOK when both URL and query are empty", () => {
    const out = sanitizeFindokUrl("", "");
    expect(decodeURIComponent(out)).toContain("site:findok.bmf.gv.at");
    expect(decodeURIComponent(out)).toContain("FINDOK");
  });

  it("collapses whitespace in the fallback query", () => {
    const out = sanitizeFindokUrl("", "  multiple   spaces\tand\ntabs  ");
    expect(decodeURIComponent(out)).toContain("multiple spaces and tabs");
  });

  it("caps the fallback query length to avoid runaway URLs", () => {
    const longQuery = "x".repeat(500);
    const out = sanitizeFindokUrl("", longQuery);
    // Decoded form should contain at most ~200 chars of the query in the search terms.
    const decoded = decodeURIComponent(out);
    const termsPart = decoded.split("site:findok.bmf.gv.at ")[1] || "";
    expect(termsPart.length).toBeLessThanOrEqual(205);
  });

  it("URL-encodes special characters safely", () => {
    const out = sanitizeFindokUrl("", "§ 6 Abs 1 Z 27 UStG");
    // encodeURIComponent turns § into %C2%A7 etc. — just confirm no raw special chars leak
    expect(out).not.toContain("§");
    expect(out).not.toContain(" ");
    // But the term is recoverable
    expect(decodeURIComponent(out)).toContain("§ 6 Abs 1 Z 27 UStG");
  });

  it("does NOT false-positive on URLs that happen to contain the word 'execution'", () => {
    const url = "https://findok.bmf.gv.at/doc?execution_plan=view";
    expect(sanitizeFindokUrl(url, "q")).toBe(url);
  });

  // Audit follow-up: the original sanitizer only matched `execution=eXsY`.
  // Spring Webflow / J2EE apps emit several other session-tied tokens
  // that also expire as fast as the scrape. Each of these must be caught.
  it("rewrites URLs with `_eventId` Spring Webflow event tokens", () => {
    const out = sanitizeFindokUrl(
      "https://findok.bmf.gv.at/findok?_eventId=submit&page=2",
      "EStR 2000",
    );
    expect(out).toContain("google.com/search");
  });

  it("rewrites URLs with J2EE `jsessionid` query param", () => {
    const out = sanitizeFindokUrl(
      "https://findok.bmf.gv.at/findok?jsessionid=ABC123XYZ&id=DOK-42",
      "fallback",
    );
    expect(out).toContain("google.com/search");
    // Should still extract the stable doc id.
    expect(decodeURIComponent(out)).toContain("DOK-42");
  });

  it("rewrites URLs with J2EE `jsessionid` injected as path-style param (;jsessionid=)", () => {
    const out = sanitizeFindokUrl(
      "https://findok.bmf.gv.at/findok;jsessionid=AAABBBCCC?gz=2024-001",
      "anything",
    );
    expect(out).toContain("google.com/search");
    expect(decodeURIComponent(out)).toContain("2024-001");
  });

  it("rewrites URLs with `request-id` server-side handle", () => {
    const out = sanitizeFindokUrl(
      "https://findok.bmf.gv.at/findok?request-id=req_abcdef",
      "UStR 2000",
    );
    expect(out).toContain("google.com/search");
  });

  it("rewrites URLs with long opaque `sid=` session ids", () => {
    const out = sanitizeFindokUrl(
      "https://findok.bmf.gv.at/findok?sid=ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "x",
    );
    expect(out).toContain("google.com/search");
  });

  it("does NOT rewrite a stable URL that happens to contain a short ?sid= param (avoids false-positive on legitimate id-style params)", () => {
    // sid=12 is too short to be a session token — leave alone. The
    // session-style guard requires 20+ alphanumeric chars.
    const url = "https://findok.bmf.gv.at/section?sid=12";
    expect(sanitizeFindokUrl(url, "x")).toBe(url);
  });
});
