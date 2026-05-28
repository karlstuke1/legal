import { makeCorsHeaders } from "../_shared/cors.ts";
import { extractMessageContent, openRouterChatCompletion } from "../_shared/openrouter.ts";


Deno.serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Authenticate user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { query, response_start } = await req.json();

    const resp = await openRouterChatCompletion({
      messages: [
        {
          role: "system",
          content: "Du generierst kurze, prägnante Titel für juristische Konversationen. Antworte NUR mit dem Titel (max 40 Zeichen), ohne Anführungszeichen, ohne Erklärung, ohne Punkt am Ende.",
        },
        {
          role: "user",
          content: `Frage: ${(query || "").slice(0, 200)}\nAntwort-Anfang: ${(response_start || "").slice(0, 200)}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 30,
      reasoningEffort: "low",
      requireParameters: true,
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("Title gen error:", resp.status, t);
      return new Response(JSON.stringify({ title: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const title = extractMessageContent(data)
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\.$/, "")
      .slice(0, 50);

    return new Response(JSON.stringify({ title: title || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("title-gen error:", e);
    return new Response(JSON.stringify({ title: null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
