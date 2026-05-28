#!/usr/bin/env bun
/**
 * Local QA harness — ask the bot a question from the terminal.
 *
 * Loads the Deno retrieval edge function under Bun (via the same
 * onLoad shim as integration-test-retrieval.ts), then runs it
 * against the REAL RIS / Findok APIs (no mocks) and prints:
 *
 *   1. Every URL the retrieval pipeline actually requested
 *   2. The parsed source list (titles, GZ, RS-Nummer, URLs)
 *   3. The citation allowlist that would be injected into the LLM
 *      system prompt — so we can verify whether the "right" RS
 *      number is in there before we ever ask the answer model
 *
 * This is the diagnostic that answers the question:
 *   "Does retrieval surface the RS-number that the LLM ends up
 *    hallucinating around?"
 *
 * Usage:
 *
 *   bun --preload ./scripts/bun-npm-loader.ts \
 *     scripts/ask.ts "Unterbrechen gerichtliche Schritte ..."
 *
 * Requires network access to data.bka.gv.at and findok.bmf.gv.at.
 * (Run on your local machine — the cloud sandbox firewalls these.)
 */

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.error("usage: bun --preload ./scripts/bun-npm-loader.ts scripts/ask.ts \"<frage>\"");
  process.exit(1);
}

// --- Deno shim (mirrors integration-test-retrieval.ts) ---------------------
let retrievalHandler: ((req: Request) => Promise<Response>) | null = null;
// @ts-expect-error — patching globalThis.Deno
globalThis.Deno = {
  env: {
    get: (k: string) => {
      const fake: Record<string, string> = {
        SUPABASE_URL: "https://fake.supabase.test",
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
        SUPABASE_ANON_KEY: "fake-anon",
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
        OPENROUTER_MODEL_HIGH_QUALITY: process.env.OPENROUTER_MODEL_HIGH_QUALITY || "openai/gpt-5.5",
        FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || "",
      };
      return fake[k] ?? process.env[k];
    },
  },
  serve: (handler: (req: Request) => Promise<Response>) => {
    retrievalHandler = handler;
  },
};

// --- Pass-through fetch with auth + LLM intercepts -------------------------
//
// Strategy:
//   - /auth/v1/user → fake authenticated user (so the handler's auth gate passes)
//   - OpenRouter chat completions → if no OPENROUTER_API_KEY, return empty {} so the
//     LLM-reformulator falls back to extractCoreKeywords (the path we
//     actually want to exercise)
//   - Everything else → real network fetch
const originalFetch = globalThis.fetch;
const requestLog: { url: string; status: number; ms: number }[] = [];

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL ? input.toString() : input.url;

  if (url.includes("/auth/v1/user")) {
    return new Response(JSON.stringify({
      id: "00000000-0000-4000-8000-000000000001",
      email: "qa@local.test",
      aud: "authenticated",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  if (url.includes("openrouter.ai/api/v1/chat/completions") && !process.env.OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({
      choices: [{ message: { content: "{}" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const t0 = Date.now();
  const resp = await originalFetch(input as any, init);
  requestLog.push({ url, status: resp.status, ms: Date.now() - t0 });
  return resp;
};

// --- Load the edge function -------------------------------------------------
console.log("[ask] loading retrieval edge function…");
await import("../supabase/functions/retrieval/index.ts");
if (!retrievalHandler) {
  console.error("[ask] FATAL: Deno.serve was never called — module shape changed?");
  process.exit(1);
}

// --- Fire the request -------------------------------------------------------
console.log(`[ask] question: ${JSON.stringify(question)}\n`);

const req = new Request("http://localhost/retrieval", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer fake-user-jwt",
  },
  body: JSON.stringify({
    query: question,
    providers: ["RIS", "FINDOK"],
    jurisdiction: ["AT"],
  }),
});

const t0 = Date.now();
const resp = await retrievalHandler!(req);
const body = await resp.text();
const totalMs = Date.now() - t0;

// --- Report ----------------------------------------------------------------
console.log(`\n=== Pipeline made ${requestLog.length} HTTP requests in ${totalMs}ms ===`);
for (const r of requestLog) {
  const u = decodeURIComponent(r.url);
  const short = u.length > 200 ? u.slice(0, 200) + "…" : u;
  console.log(`  [${r.status}] ${r.ms}ms  ${short}`);
}

let parsed: any[] = [];
try {
  parsed = JSON.parse(body);
} catch {
  console.error("\n[ask] FATAL: response body is not JSON:", body.slice(0, 500));
  process.exit(1);
}

console.log("\n=== Sources surfaced by retrieval ===");
const allSources: any[] = [];
for (const block of parsed) {
  console.log(`\n--- ${block.provider} (${block.results?.length || 0} results, ${block.latencyMs}ms) ---`);
  for (const r of block.results || []) {
    allSources.push(r);
    console.log(`  • ${r.doc_ref || "(no ref)"} ${r.date ? `[${r.date}]` : ""}`);
    console.log(`    ${r.title}`);
    console.log(`    ${r.url}`);
    if (r.snippet) console.log(`    snippet: ${r.snippet.slice(0, 160)}${r.snippet.length > 160 ? "…" : ""}`);
  }
}

// --- Compute the citation allowlist that would be injected -----------------
// Mirrors what chat/index.ts does: format sources into the tool-output string,
// then extract the allowlist.
const formatted = allSources.map((s, i) =>
  `${i + 1}. [${s.provider}] ${s.title} | Ref: ${s.doc_ref} | URL: ${s.url}` +
  (s.snippet ? ` | INHALT: ${s.snippet}` : "")
).join("\n");

const { extractCitationAllowlist } = await import("../supabase/functions/chat/citation-allowlist.ts");
const allowlist = extractCitationAllowlist(formatted);

console.log("\n=== Citation allowlist (what the LLM is allowed to cite) ===");
if (!allowlist.length) {
  console.log("  ⚠ EMPTY — LLM will get the HARD-PROHIBITION block and");
  console.log("    is told NOT to cite anything from training data.");
} else {
  for (const c of allowlist) console.log(`  - ${c}`);
}

console.log("\n=== Done. ===");
console.log("If the RS-number you expected is NOT in the allowlist above,");
console.log("retrieval is the bottleneck — the LLM never had a chance to cite it.");
console.log("If it IS in the allowlist but the bot still cited a different one,");
console.log("the LLM is ignoring the allowlist — that's a prompt/model problem.");
