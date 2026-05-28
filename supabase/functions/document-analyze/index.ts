import { makeCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  extractMessageContent,
  openRouterChatCompletion,
  parseJsonObject,
  strictJsonSchema,
} from "../_shared/openrouter.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  try {
    const { analysis_id } = await req.json();
    if (!analysis_id || !UUID_RE.test(analysis_id)) {
      return new Response(JSON.stringify({ error: "Invalid analysis_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Rate limiting: 5 requests per 5 minutes per user
    {
      const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
      const { count } = await supabase
        .from("rate_limit_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("endpoint", "document-analyze")
        .gte("created_at", fiveMinAgo);
      if (count && count >= 5) {
        return new Response(
          JSON.stringify({ error: "Zu viele Analyse-Anfragen. Bitte warten Sie einige Minuten." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      await supabase.from("rate_limit_log").insert({ user_id: userId, endpoint: "document-analyze" });
    }

    // Fetch analysis record
    const { data: analysis, error: aErr } = await supabase
      .from("matter_analyses")
      .select("*")
      .eq("id", analysis_id)
      .single();

    if (aErr || !analysis) {
      return new Response(JSON.stringify({ error: "Analysis not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", analysis.workspace_id)
      .eq("user_id", userId)
      .single();
    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Set status to processing
    await supabase
      .from("matter_analyses")
      .update({ status: "processing" })
      .eq("id", analysis_id);

    // Fetch files for this matter
    const { data: files, error: fErr } = await supabase
      .from("files")
      .select("id, name, mime, size, storage_path")
      .eq("matter_id", analysis.matter_id);

    if (fErr || !files || files.length === 0) {
      await supabase
        .from("matter_analyses")
        .update({ status: "error", error_message: "Keine Dateien in dieser Akte gefunden." })
        .eq("id", analysis_id);
      return new Response(JSON.stringify({ error: "No files found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract text from each file
    const fileTexts: { fileId: string; fileName: string; text: string }[] = [];
    for (const file of files) {
      try {
        const { data: fileData } = await supabase.storage
          .from("workspace-files")
          .download(file.storage_path);

        if (!fileData) continue;

        // Reject files larger than 20MB
        if (fileData.size > 20 * 1024 * 1024) {
          console.warn(`[analyze] Skipping ${file.name}: too large (${(fileData.size / 1024 / 1024).toFixed(1)} MB)`);
          continue;
        }

        let text = "";
        if (file.mime === "text/plain") {
          text = await fileData.text();
        } else if (file.mime === "application/pdf") {
          // Simple text extraction from PDF - get raw text content
          const raw = await fileData.text();
          // Extract readable text between stream markers
          const matches = raw.match(/\(([^)]+)\)/g);
          text = matches ? matches.map((m: string) => m.slice(1, -1)).join(" ").slice(0, 10000) : "";
          if (!text.trim()) {
            text = `[PDF-Datei: ${file.name} — Textextraktion nicht möglich, OCR erforderlich]`;
          }
        } else if (
          file.mime ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
          // Extract text from DOCX (simple XML parsing)
          const arrayBuffer = await fileData.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          // Look for text content in the raw bytes
          const rawStr = new TextDecoder("utf-8", { fatal: false }).decode(uint8);
          const textMatches = rawStr.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
          text = textMatches
            ? textMatches.map((m: string) => m.replace(/<[^>]+>/g, "")).join(" ").slice(0, 10000)
            : `[DOCX-Datei: ${file.name}]`;
        } else {
          text = `[Datei: ${file.name}, Typ: ${file.mime} — nicht unterstützt für Textextraktion]`;
        }

        fileTexts.push({ fileId: file.id, fileName: file.name, text: text.slice(0, 8000) });
      } catch (e) {
        console.error(`Error extracting text from ${file.name}:`, e);
        fileTexts.push({
          fileId: file.id,
          fileName: file.name,
          text: `[Fehler bei Textextraktion: ${file.name}]`,
        });
      }
    }

    if (analysis.type === "flow") {
      await processFlow(supabase, analysis_id, fileTexts);
    } else if (analysis.type === "extraction") {
      const questions = (analysis.questions as string[]) || [];
      await processExtraction(supabase, analysis_id, fileTexts, questions);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("document-analyze error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function callAI(
  messages: { role: string; content: string }[],
  tools?: any[]
) {
  const parameters = tools?.[0]?.function?.parameters;
  if (parameters?.properties) {
    parameters.required = Object.keys(parameters.properties);
  }
  const schema = parameters
    ? strictJsonSchema(tools[0].function.name, parameters)
    : undefined;

  const resp = await openRouterChatCompletion({
    messages,
    responseFormat: schema,
    maxTokens: schema ? 4000 : 12000,
    reasoningEffort: "low",
    requireParameters: true,
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI error ${resp.status}: ${t}`);
  }

  const data = await resp.json();
  const content = extractMessageContent(data);

  if (schema) {
    return parseJsonObject(content);
  }

  return content || "";
}

interface FileText {
  fileId: string;
  fileName: string;
  text: string;
}

async function processFlow(
  supabase: any,
  analysisId: string,
  fileTexts: FileText[]
) {
  try {
    // Step 1: Analyze each document
    const results: any[] = [];

    for (let i = 0; i < fileTexts.length; i++) {
      const ft = fileTexts[i];
      const docResult = await callAI(
        [
          {
            role: "system",
            content:
              "Du bist ein juristischer Dokumentenanalyst. Analysiere das folgende Dokument und extrahiere: 1) Ein aussagekräftiger Dateiname (ohne Extension), 2) Das Datum des Dokuments (YYYY-MM-DD), 3) Eine Kurzzusammenfassung (2-3 Sätze).",
          },
          {
            role: "user",
            content: `Dateiname: ${ft.fileName}\n\nInhalt:\n${ft.text}`,
          },
        ],
        [
          {
            type: "function",
            function: {
              name: "analyze_document",
              description: "Analysiere ein juristisches Dokument",
              parameters: {
                type: "object",
                properties: {
                  suggested_name: {
                    type: "string",
                    description: "Vorgeschlagener Dateiname (ohne Extension)",
                  },
                  doc_date: {
                    type: "string",
                    description: "Dokumentdatum im Format YYYY-MM-DD oder null",
                  },
                  summary: {
                    type: "string",
                    description: "Kurzzusammenfassung (2-3 Sätze)",
                  },
                },
                required: ["suggested_name", "summary"],
                additionalProperties: false,
              },
            },
          },
        ]
      );

      results.push({
        analysis_id: analysisId,
        file_id: ft.fileId,
        file_name_suggestion: docResult.suggested_name || ft.fileName,
        doc_date: docResult.doc_date || null,
        doc_summary: docResult.summary || "",
        sort_order: i,
        included: true,
      });
    }

    // Insert results
    await supabase.from("matter_analysis_results").insert(results);

    // Step 2: Generate overall summary using all document summaries
    const summaryInput = results
      .map(
        (r, i) =>
          `${i + 1}. ${r.file_name_suggestion} (${r.doc_date || "ohne Datum"}): ${r.doc_summary}`
      )
      .join("\n");

    const overallSummary = await callAI(
      [
        {
          role: "system",
          content:
            "Du bist ein juristischer Fachassistent. Erstelle einen nachprüfbaren, chronologisch geordneten Sachverhalt basierend auf den folgenden Dokumentenzusammenfassungen. Schreibe in der dritten Person, nenne konkrete Daten und Fakten. Verwende Markdown-Formatierung mit Überschriften.",
        },
        {
          role: "user",
          content: `Dokumente:\n${summaryInput}\n\nErstelle einen zusammenhängenden Sachverhalt.`,
        },
      ],
    );

    await supabase
      .from("matter_analyses")
      .update({ status: "done", summary: overallSummary })
      .eq("id", analysisId);
  } catch (e) {
    console.error("Flow processing error:", e);
    await supabase
      .from("matter_analyses")
      .update({
        status: "error",
        error_message: e instanceof Error ? e.message : "Unbekannter Fehler",
      })
      .eq("id", analysisId);
  }
}

async function processExtraction(
  supabase: any,
  analysisId: string,
  fileTexts: FileText[],
  questions: string[]
) {
  try {
    const questionProperties: Record<string, any> = {};
    questions.forEach((q, i) => {
      questionProperties[`q${i}`] = {
        type: "string",
        description: q,
      };
    });

    const results: any[] = [];

    for (let i = 0; i < fileTexts.length; i++) {
      const ft = fileTexts[i];
      const extracted = await callAI(
        [
          {
            role: "system",
            content: `Du bist ein juristischer Dokumentenanalyst. Beantworte die folgenden Fragen basierend auf dem Dokument. Wenn eine Information nicht im Dokument zu finden ist, antworte mit "—".`,
          },
          {
            role: "user",
            content: `Dokument: ${ft.fileName}\n\nInhalt:\n${ft.text}\n\nFragen:\n${questions.map((q, j) => `${j + 1}. ${q}`).join("\n")}`,
          },
        ],
        [
          {
            type: "function",
            function: {
              name: "extract_answers",
              description: "Extrahiere Antworten aus dem Dokument",
              parameters: {
                type: "object",
                properties: questionProperties,
                required: Object.keys(questionProperties),
                additionalProperties: false,
              },
            },
          },
        ]
      );

      // Map back to question labels
      const extractedData: Record<string, string> = {};
      questions.forEach((q, j) => {
        extractedData[q] = extracted[`q${j}`] || "—";
      });

      results.push({
        analysis_id: analysisId,
        file_id: ft.fileId,
        extracted_data: extractedData,
        sort_order: i,
        included: true,
      });
    }

    await supabase.from("matter_analysis_results").insert(results);
    await supabase
      .from("matter_analyses")
      .update({ status: "done" })
      .eq("id", analysisId);
  } catch (e) {
    console.error("Extraction processing error:", e);
    await supabase
      .from("matter_analyses")
      .update({
        status: "error",
        error_message: e instanceof Error ? e.message : "Unbekannter Fehler",
      })
      .eq("id", analysisId);
  }
}
