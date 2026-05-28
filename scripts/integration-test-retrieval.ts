#!/usr/bin/env bun
/**
 * Real integration test of the retrieval pipeline.
 *
 * Bun can load the Deno-flavored retrieval edge function. We intercept
 * Deno.serve to capture the handler, then mock globalThis.fetch with
 * realistic RIS API responses — including one that mimics what the
 * RIS API would return for RS0034826 on a wide-keyword Suchworte
 * query. We then call the handler with a real Request and inspect the
 * parsed source list.
 *
 * Why this matters: vitest unit tests cover regex / keyword
 * extraction in isolation. This test runs the WHOLE searchRIS flow
 * end-to-end (URL construction + parallel-fetch + response parsing +
 * dedup + merge) for a realistic user question. It's the closest
 * thing to a real QA loop without hitting the actual RIS API.
 */

// Capture the handler that Deno.serve receives.
let chatHandler: ((req: Request) => Promise<Response>) | null = null;

// @ts-expect-error — we're patching globalThis.Deno before loading the module.
globalThis.Deno = {
  env: {
    get: (k: string) => {
      // Provide just enough env so the module's top-level code doesn't blow up.
      const fake: Record<string, string> = {
        SUPABASE_URL: "https://fake.supabase.test",
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
        SUPABASE_ANON_KEY: "fake-anon",
        OPENROUTER_API_KEY: "fake-openrouter-key",
        OPENROUTER_MODEL_HIGH_QUALITY: "openai/gpt-5.5",
        FIRECRAWL_API_KEY: "",
      };
      return fake[k];
    },
  },
  serve: (handler: (req: Request) => Promise<Response>) => {
    chatHandler = handler;
  },
};

// Track what URLs the pipeline actually requested.
const requestedUrls: string[] = [];

// Fake RIS Judikatur response — schema mirrors what data.bka.gv.at returns.
// The KEY test: when our wide-keyword query is fired, this fixture stands
// in for RIS's response and contains exactly one Rechtssatz with number
// RS0034826 and the matching Leitsatz from the user's bug report.
const RIS_WIDE_KEYWORD_RESPONSE = {
  OgdSearchResult: {
    OgdDocumentResults: {
      OgdDocumentReference: [
        {
          Data: {
            Metadaten: {
              JudikaturRs: {
                Geschaeftszahl: { item: "2 Ob 72/24k" },
                Rechtssatznummer: "RS0034826",
                RechtssatzText: "Gerichtliche Schritte, die die Geltendmachung eines Rechtes bloß vorbereiten, unterbrechen die Verjährung nicht.",
                Normen: "ABGB §1497",
                Entscheidungsdatum: "12.03.2026",
                Gerichtstyp: "OGH",
                Dokumenttyp: "Rechtssatz",
                Dokumentnummer: "JJR_20260312_OGH0002_0020OB00072_24K0000_001",
              },
            },
            Dokumentliste: {
              ContentReference: {
                Name: "Dokument",
                Urls: {
                  ContentUrl: [
                    {
                      Url: "https://www.ris.bka.gv.at/Dokumente/Justiz/JJR_20260312_OGH0002_0020OB00072_24K0000_001/JJR_20260312_OGH0002_0020OB00072_24K0000_001.html",
                      DataType: "Html",
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    },
  },
};

// Patch globalThis.fetch — log everything, return fixture for the
// wide-keyword JudRs query, fake Supabase auth, empty for everything else.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url = typeof input === "string" ? input : (input instanceof URL ? input.toString() : input.url);
  requestedUrls.push(url);

  // Supabase auth check (`/auth/v1/user`) — return a fake authenticated user
  // so the handler's auth gate passes.
  if (url.includes("/auth/v1/user")) {
    return new Response(JSON.stringify({
      id: "00000000-0000-4000-8000-000000000001",
      email: "test@example.test",
      aud: "authenticated",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // LLM reformulator / decompose calls — return a benign empty-list shape
  // so retrieval falls back to extractCoreKeywords (the path we want to test).
  if (url.includes("openrouter.ai/api/v1/chat/completions")) {
    return new Response(JSON.stringify({
      choices: [{ message: { content: "{}" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // Match the wide-keyword Rechtssatz query (must contain all key tokens).
  const decodedForMatch = decodeURIComponent(url);
  if (
    decodedForMatch.includes("Judikatur") &&
    decodedForMatch.includes("Dokumenttyp=Rechtssatz") &&
    decodedForMatch.includes("Unterbrechen") &&
    decodedForMatch.includes("Geltendmachung") &&
    decodedForMatch.includes("Verjährung") &&
    decodedForMatch.includes("vorbereiten")
  ) {
    console.log("[mock] ✓ wide-keyword fixture HIT for:", decodedForMatch.slice(0, 200));
    return new Response(JSON.stringify(RIS_WIDE_KEYWORD_RESPONSE), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Everything else: empty results.
  return new Response(JSON.stringify({ OgdSearchResult: { OgdDocumentResults: { Hit: [] } } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

// Load the module — Deno.serve(handler) will be called, capturing the handler.
console.log("Loading retrieval edge function under Bun…");
await import("../supabase/functions/retrieval/index.ts");

if (!chatHandler) {
  console.error("✗ chatHandler was never set — Deno.serve wasn't called?");
  process.exit(1);
}

// Build the user's exact question as a Request.
const userQuestion = "Unterbrechen gerichtliche Schritte, die die Geltendmachung eines Rechtes bloß vorbereiten, die Verjährung?";

const req = new Request("http://localhost/retrieval", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer fake-user-jwt",
  },
  body: JSON.stringify({
    query: userQuestion,
    providers: ["RIS"],
    jurisdiction: ["AT"],
  }),
});

console.log("Calling retrieval handler with the user's exact question…");
const resp = await chatHandler!(req);
const body = await resp.text();

console.log("\n=== URLs the pipeline requested ===");
for (const u of requestedUrls) {
  const decoded = decodeURIComponent(u);
  if (decoded.length > 250) console.log("  " + decoded.slice(0, 240) + "…");
  else console.log("  " + decoded);
}

console.log("\n=== Did we call the WIDE-keyword Rechtssatz query? ===");
const wideMatched = requestedUrls.some((u) => {
  const d = decodeURIComponent(u);
  return d.includes("Dokumenttyp=Rechtssatz") &&
    ["Unterbrechen", "Geltendmachung", "Verjährung", "vorbereiten"].every((kw) => d.includes(kw));
});
console.log(wideMatched ? "✓ YES — wide query was fired" : "✗ NO — wide query missing");

console.log("\n=== Did parsing surface RS0034826? ===");
const found0034826 = body.includes("RS0034826");
console.log(found0034826 ? "✓ YES — RS0034826 is in the response body" : "✗ NO — RS0034826 not found");

console.log("\n=== Response preview ===");
console.log(body.slice(0, 600).replaceAll("\\n", "\n"));

process.exit((wideMatched && found0034826) ? 0 : 1);
