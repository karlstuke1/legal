import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * embed-documents is our most expensive edge function: per request it runs
 * AI-vision parsing on every file + generates vector embeddings per chunk.
 * One request can trigger dozens of model calls. A missing rate limit
 * means a single compromised credential or runaway client loop can burn
 * the budget fast — so the rate check belongs in source and should stay
 * there. This test is a canary, not a substitute for integration testing.
 */
describe("embed-documents function — cost guardrails must stay in source", () => {
  const source = readFileSync(
    resolve(__dirname, "../../supabase/functions/embed-documents/index.ts"),
    "utf8",
  );

  it("requires an Authorization bearer header (no anonymous access)", () => {
    expect(source).toMatch(/authHeader\?\.startsWith\("Bearer "\)/);
    expect(source).toContain("Unauthorized");
  });

  it("resolves the authenticated user via userClient.auth.getUser()", () => {
    expect(source).toMatch(/userClient\.auth\.getUser\(\)/);
  });

  it("enforces a per-hour rate limit via rate_limit_log (endpoint='embed-documents')", () => {
    // Endpoint tag present.
    expect(source).toMatch(/endpoint:\s*"embed-documents"/);
    // Query against rate_limit_log with COUNT and 429 response.
    expect(source).toMatch(/from\("rate_limit_log"\)/);
    expect(source).toMatch(/count:\s*"exact"/);
    expect(source).toMatch(/status:\s*429/);
    // Configured limit constant exists.
    expect(source).toMatch(/EMBED_RATE_LIMIT_PER_HOUR/);
  });

  it("logs the request into rate_limit_log AFTER the check (so the count grows over time)", () => {
    // Should have an insert with endpoint="embed-documents".
    const inserts = source.match(/\.insert\(\s*\{\s*user_id:[^}]*endpoint:\s*"embed-documents"\s*\}\s*\)/g) || [];
    expect(inserts.length).toBeGreaterThanOrEqual(1);
  });

  it("rate check sits BEFORE the heavy work (early return on 429)", () => {
    const limitIdx = source.indexOf("EMBED_RATE_LIMIT_PER_HOUR");
    const fileParseIdx = source.indexOf("MODE 1: File-based embedding");
    expect(limitIdx).toBeGreaterThan(0);
    expect(fileParseIdx).toBeGreaterThan(0);
    expect(limitIdx, "rate-limit check must appear BEFORE the expensive file-embedding branch").toBeLessThan(fileParseIdx);
  });

  it("uses the service-role admin client for the rate check (not the user-scoped client)", () => {
    // The rate_limit_log table has row-level security that only permits
    // edge functions via the service key — querying it with the
    // user-scoped client would silently return 0 and defeat the limit.
    const rateCheckBlock = source.slice(
      source.indexOf("EMBED_RATE_LIMIT_PER_HOUR"),
      source.indexOf("MODE 1: File-based embedding"),
    );
    expect(rateCheckBlock).toMatch(/adminClient\s*\n?\s*\.from\("rate_limit_log"\)/);
  });
});
