import { makeCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  extractMessageContent,
  openRouterChatCompletion,
  parseJsonObject,
  strictJsonSchema,
} from "../_shared/openrouter.ts";

const CONTRACT_COMPARE_SCHEMA = strictJsonSchema("contract_compare", {
  type: "object",
  properties: {
    summary: { type: "string" },
    overallRisk: { type: "string" },
    clauses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          docA: { type: "string" },
          docB: { type: "string" },
          change: { type: "string", enum: ["added", "removed", "modified", "unchanged"] },
          summary: { type: "string" },
          risk: { type: "string", enum: ["high", "medium", "low", "none"] },
        },
        required: ["title", "docA", "docB", "change", "summary", "risk"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "overallRisk", "clauses"],
  additionalProperties: false,
});

async function extractText(adminClient: any, storagePath: string, fileName: string, mime: string): Promise<string> {
  const { data, error } = await adminClient.storage.from("workspace-files").download(storagePath);
  if (error || !data) throw new Error(`Download failed: ${fileName}`);

  if (mime === "text/plain") return await data.text();

  // Use AI vision for PDFs/DOCX
  const arrayBuffer = await data.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binaryStr = "";
  const chunkSize = 4096;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    const slice = uint8.subarray(i, Math.min(i + chunkSize, uint8.length));
    for (let j = 0; j < slice.length; j++) binaryStr += String.fromCharCode(slice[j]);
  }
  const base64 = btoa(binaryStr);

  const response = await openRouterChatCompletion({
    messages: [{
        role: "user",
        content: [
          { type: "text", text: `Extrahiere den vollständigen Text aus diesem Dokument "${fileName}". Gib NUR den Text zurück.` },
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } }
        ]
      }],
    maxTokens: 16000,
    reasoningEffort: "high",
    requireParameters: true,
  });

  if (!response.ok) throw new Error(`AI parse failed for ${fileName}`);
  const result = await response.json();
  return extractMessageContent(result);
}

Deno.serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { workspace_id, file_a, file_b } = await req.json();

    // Verify workspace membership
    const { data: isMember } = await adminClient.rpc("is_workspace_member", { _user_id: userData.user.id, _workspace_id: workspace_id });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Not a workspace member" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Extract text from both documents
    const [textA, textB] = await Promise.all([
      extractText(adminClient, file_a.storage_path, file_a.name, file_a.mime),
      extractText(adminClient, file_b.storage_path, file_b.name, file_b.mime),
    ]);

    // Compare with AI
    const compareResponse = await openRouterChatCompletion({
      messages: [
          {
            role: "system",
            content: `Du bist ein juristischer Vertragsvergleichs-Assistent. Vergleiche zwei Vertragstexte und erstelle einen strukturierten Bericht.

Antworte AUSSCHLIESSLICH als valides JSON in folgendem Format:
{
  "summary": "Kurze Zusammenfassung der wesentlichen Unterschiede (3-5 Sätze)",
  "overallRisk": "Gering/Mittel/Hoch — Gesamtbewertung der Änderungen",
  "clauses": [
    {
      "title": "Name/Nummer der Klausel",
      "docA": "Relevanter Textauszug aus Dokument A",
      "docB": "Relevanter Textauszug aus Dokument B (oder leer wenn entfernt)",
      "change": "added|removed|modified|unchanged",
      "summary": "Was hat sich geändert und warum ist das relevant",
      "risk": "high|medium|low|none"
    }
  ]
}

Fokussiere auf:
- Haftungsklauseln, Gewährleistung, Kündigungsfristen
- Gerichtsstand, anwendbares Recht
- Zahlungsbedingungen, Vertragsstrafen
- Datenschutz, Geheimhaltung
- Wesentliche Pflichten der Parteien

Maximal 15 Klauseln. Sortiere nach Risiko (hoch zuerst).`
          },
          {
            role: "user",
            content: `DOKUMENT A (${file_a.name}):\n\n${textA.slice(0, 15000)}\n\n---\n\nDOKUMENT B (${file_b.name}):\n\n${textB.slice(0, 15000)}`
          }
        ],
      responseFormat: CONTRACT_COMPARE_SCHEMA,
      maxTokens: 8000,
      reasoningEffort: "high",
      requireParameters: true,
    });

    if (!compareResponse.ok) throw new Error("AI comparison failed");
    const compareData = await compareResponse.json();
    const parsed = parseJsonObject(extractMessageContent(compareData));

    // Cleanup temp files
    await Promise.all([
      adminClient.storage.from("workspace-files").remove([file_a.storage_path]),
      adminClient.storage.from("workspace-files").remove([file_b.storage_path]),
    ]).catch(() => {});

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[contract-compare]", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
