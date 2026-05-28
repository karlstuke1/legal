import { makeCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  extractMessageContent,
  openRouterChatCompletion,
  openRouterEmbedding,
} from "../_shared/openrouter.ts";

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const MAX_DOCUMENTS = 50;

// ============================================================
// Text chunking
// ============================================================

function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (text.length <= chunkSize) return [text];
  // Guard: overlap must be less than chunkSize to guarantee forward progress
  const safeOverlap = Math.min(overlap, Math.floor(chunkSize * 0.3));
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    if (end < text.length) {
      const lastParagraph = text.lastIndexOf("\n\n", end);
      const lastSentence = text.lastIndexOf(". ", end);
      if (lastParagraph > start + chunkSize * 0.5) end = lastParagraph + 2;
      else if (lastSentence > start + chunkSize * 0.5) end = lastSentence + 2;
    }
    chunks.push(text.slice(start, Math.min(end, text.length)));
    const nextStart = end - safeOverlap;
    // Guarantee forward progress: advance at least 1 character
    start = nextStart <= start ? start + 1 : nextStart;
  }
  return chunks;
}

// ============================================================
// Hashing
// ============================================================

async function hashContent(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// Embedding generation
// ============================================================

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await openRouterEmbedding({
      input: text.slice(0, 8000),
      dimensions: 768,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[embed] OpenRouter embedding API error:", response.status, errText);
      return null;
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || null;
  } catch (e) {
    console.error("[embed] Embedding generation error:", e);
    return null;
  }
}

// ============================================================
// AI-powered document parsing (OCR, tables, scans)
// Uses OpenRouter GPT-5.5 to extract text from any document
// ============================================================

async function aiParseDocument(
  fileData: Blob,
  fileName: string,
  mime: string
): Promise<string | null> {
  try {
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Reject files larger than 20MB to prevent memory exhaustion
    if (uint8.length > 20 * 1024 * 1024) {
      console.warn(`[embed] File ${fileName} too large (${(uint8.length / 1024 / 1024).toFixed(1)} MB), skipping AI parse`);
      return null;
    }

    // Encode in chunks using Array.from to avoid stack overflow from spread operator
    let binaryStr = "";
    const chunkSize = 4096;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      const slice = uint8.subarray(i, Math.min(i + chunkSize, uint8.length));
      for (let j = 0; j < slice.length; j++) {
        binaryStr += String.fromCharCode(slice[j]);
      }
    }
    const base64 = btoa(binaryStr);

    const dataUri = `data:${mime};base64,${base64}`;

    console.log(`[embed] AI parsing ${fileName} (${(uint8.length / 1024).toFixed(0)} KB) via OpenRouter GPT-5.5`);

    const response = await openRouterChatCompletion({
      messages: [
          {
            role: "system",
            content: `Du bist ein Dokumenten-Parser für juristische Dokumente. Extrahiere den VOLLSTÄNDIGEN Text aus dem Dokument.

Regeln:
- Gib NUR den extrahierten Text zurück, keine Kommentare oder Erklärungen.
- Bewahre die Dokumentstruktur (Überschriften, Absätze, Aufzählungen, Nummerierungen).
- Bei Tabellen: Konvertiere in lesbaren Text mit klarer Spalten-/Zeilen-Zuordnung (z.B. "| Spalte1 | Spalte2 |" Format).
- Bei gescannten Dokumenten: Führe OCR durch und extrahiere allen lesbaren Text.
- Bewahre Paragraphen-Nummern (§), Aktenzeichen, Datumsangaben und juristische Referenzen exakt.
- Ignoriere Wasserzeichen, Seitenzahlen und Kopf-/Fußzeilen.
- Bei unlesbaren Stellen: Markiere mit [unleserlich].
- Maximale Genauigkeit bei Zahlen, Namen und Rechtsbegriffen.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extrahiere den vollständigen Text aus diesem Dokument: "${fileName}"`
              },
              {
                type: "image_url",
                image_url: { url: dataUri }
              }
            ]
          }
        ],
      maxTokens: 16000,
      reasoningEffort: "high",
      requireParameters: true,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[embed] AI parse error for ${fileName}:`, response.status, errText);
      return null;
    }

    const data = await response.json();
    const extractedText = extractMessageContent(data);

    if (!extractedText || extractedText.trim().length < 20) {
      console.warn(`[embed] AI parse returned insufficient text for ${fileName}`);
      return null;
    }

    console.log(`[embed] AI parsed ${fileName}: ${extractedText.length} chars extracted`);
    return extractedText.slice(0, 80000);
  } catch (e) {
    console.error(`[embed] AI parse exception for ${fileName}:`, e);
    return null;
  }
}

// ============================================================
// Fallback: naive text extraction (for when AI parsing fails)
// ============================================================

function naiveExtractText(raw: string, fileName: string, mime: string): string {
  if (mime === "text/plain") return raw;

  if (mime === "application/pdf") {
    const matches = raw.match(/\(([^)]+)\)/g);
    let text = matches ? matches.map((m: string) => m.slice(1, -1)).join(" ") : "";
    const btBlocks = raw.match(/BT\s([\s\S]*?)ET/g);
    if (btBlocks) {
      const btText = btBlocks
        .map(block => {
          const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g);
          if (tjMatches) return tjMatches.map(m => m.replace(/\(([^)]*)\)\s*Tj/, "$1")).join(" ");
          return "";
        })
        .filter(Boolean)
        .join(" ");
      if (btText.length > text.length) text = btText;
    }
    if (!text.trim() || text.trim().length < 50) return "";
    return text.slice(0, 50000);
  }

  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const textMatches = raw.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (textMatches) {
      return textMatches.map((m: string) => m.replace(/<[^>]+>/g, "")).join(" ").slice(0, 50000);
    }
    return "";
  }

  return "";
}

// ============================================================
// Main extraction pipeline: AI-first, naive fallback
// ============================================================

async function extractTextFromFile(
  fileData: Blob,
  fileName: string,
  mime: string
): Promise<string> {
  // Plain text: no AI needed
  if (mime === "text/plain") {
    return await fileData.text();
  }

  // PDFs and DOCX: AI-first for OCR, tables, scans
  if (
    mime === "application/pdf" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    // Try AI parsing first (handles scans, tables, complex layouts)
    const aiText = await aiParseDocument(fileData, fileName, mime);
    if (aiText && aiText.length >= 50) {
      return aiText;
    }

    // Fallback to naive extraction
    console.warn(`[embed] AI parse failed/insufficient for ${fileName}, trying naive extraction`);
    const raw = await fileData.text();
    const naiveText = naiveExtractText(raw, fileName, mime);
    if (naiveText && naiveText.length >= 50) {
      return naiveText;
    }

    return `[Dokument: ${fileName} — Textextraktion fehlgeschlagen. Möglicherweise ein Scan ohne erkennbaren Text.]`;
  }

  // Images: use AI vision for OCR
  if (mime.startsWith("image/")) {
    const aiText = await aiParseDocument(fileData, fileName, mime);
    if (aiText && aiText.length >= 10) {
      return aiText;
    }
    return `[Bild: ${fileName} — Kein Text erkannt]`;
  }

  return `[Datei: ${fileName}, Typ: ${mime} — nicht unterstützt für Textextraktion]`;
}

// ============================================================
// Main handler
// ============================================================

Deno.serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // Rate limiting: embedding is the most expensive endpoint in the
    // system (AI vision parsing + per-chunk vector generation, often
    // dozens of model calls per single request). A lower cap than chat
    // (which runs at 20/minute) is appropriate. 15 requests per hour
    // per user gives normal users room for batch work while capping
    // worst-case cost if a credential is compromised or a loop runs
    // away client-side.
    // ============================================================
    const EMBED_RATE_LIMIT_PER_HOUR = 15;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await adminClient
      .from("rate_limit_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userData.user.id)
      .eq("endpoint", "embed-documents")
      .gte("created_at", oneHourAgo);
    if (recentCount && recentCount >= EMBED_RATE_LIMIT_PER_HOUR) {
      return new Response(
        JSON.stringify({
          error: `Zu viele Einbettungs-Anfragen (${recentCount}/${EMBED_RATE_LIMIT_PER_HOUR} pro Stunde). Bitte warten Sie eine Stunde oder bündeln Sie mehrere Dokumente in eine Anfrage.`,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // Log this request (fire-and-forget — a failed log must not block embedding).
    adminClient
      .from("rate_limit_log")
      .insert({ user_id: userData.user.id, endpoint: "embed-documents" })
      .then(({ error }) => { if (error) console.error("[embed-documents] rate_limit_log insert failed:", error); });

    const body = await req.json();
    const { documents, workspace_id, files } = body;

    if (workspace_id) {
      const { data: member } = await adminClient.rpc("is_workspace_member", {
        _user_id: userData.user.id,
        _workspace_id: workspace_id,
      });
      if (!member) {
        return new Response(JSON.stringify({ error: "Not a workspace member" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ============================================================
    // MODE 1: File-based embedding — download, AI-parse, embed
    // ============================================================
    if (Array.isArray(files) && files.length > 0) {
      console.log(`[embed] File-based mode: processing ${files.length} files`);
      let embedded = 0;
      let skipped = 0;
      let errors = 0;

      for (const file of files.slice(0, MAX_DOCUMENTS)) {
        try {
          const { data: fileData, error: dlError } = await adminClient.storage
            .from("workspace-files")
            .download(file.storage_path);

          if (dlError || !fileData) {
            console.error(`[embed] Download failed for ${file.name}:`, dlError);
            errors++;
            continue;
          }

          // AI-powered extraction (OCR, tables, scans)
          const extractedText = await extractTextFromFile(fileData, file.name, file.mime);

          if (extractedText.startsWith("[") && extractedText.endsWith("]")) {
            console.warn(`[embed] Skipping ${file.name}: no extractable text`);
            skipped++;
            continue;
          }

          console.log(`[embed] Extracted ${extractedText.length} chars from ${file.name}`);

          const chunks = chunkText(extractedText);

          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const contentHash = await hashContent(chunk + (file.file_id || "") + i);

            const { data: existing } = await adminClient
              .from("legal_documents")
              .select("id")
              .eq("content_hash", contentHash)
              .maybeSingle();

            if (existing) {
              skipped++;
              continue;
            }

            const embedding = await generateEmbedding(`${file.name}\n\n${chunk}`);

            if (!embedding) {
              errors++;
              continue;
            }

            const { error: insertError } = await adminClient
              .from("legal_documents")
              .insert({
                workspace_id: workspace_id || null,
                title: file.name,
                content: chunk,
                content_hash: contentHash,
                source_provider: "UPLOAD",
                source_url: null,
                jurisdiction: "DE",
                doc_ref: null,
                doc_date: null,
                metadata: {
                  file_id: file.file_id,
                  mime: file.mime,
                  chunk_of: chunks.length,
                  parsed_by: "openrouter-gpt-5.5",
                },
                embedding: JSON.stringify(embedding),
                chunk_index: i,
              });

            if (insertError) {
              console.error("[embed] Insert error:", insertError);
              if (insertError.code === "23505") skipped++;
              else errors++;
            } else {
              embedded++;
            }
          }
        } catch (fileErr) {
          console.error(`[embed] File processing error for ${file.name}:`, fileErr);
          errors++;
        }
      }

      console.log(`[embed] File mode done: ${embedded} embedded, ${skipped} skipped, ${errors} errors`);
      return new Response(JSON.stringify({ embedded, skipped, errors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // MODE 2: Document-based embedding (legacy) — pre-extracted text
    // ============================================================
    if (!Array.isArray(documents) || documents.length === 0) {
      return new Response(JSON.stringify({ error: "No documents or files provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (documents.length > MAX_DOCUMENTS) {
      return new Response(JSON.stringify({ error: `Max ${MAX_DOCUMENTS} documents per request` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let embedded = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of documents) {
      try {
        const chunks = chunkText(doc.content || "");

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const contentHash = await hashContent(chunk + (doc.source_url || "") + i);

          const { data: existing } = await adminClient
            .from("legal_documents")
            .select("id")
            .eq("content_hash", contentHash)
            .maybeSingle();

          if (existing) {
            skipped++;
            continue;
          }

          const embedding = await generateEmbedding(`${doc.title || ""}\n${doc.doc_ref || ""}\n\n${chunk}`);

          if (!embedding) {
            errors++;
            continue;
          }

          const { error: insertError } = await adminClient
            .from("legal_documents")
            .insert({
              workspace_id: workspace_id || null,
              title: doc.title || "Untitled",
              content: chunk,
              content_hash: contentHash,
              source_provider: doc.source_provider || "UPLOAD",
              source_url: doc.source_url || null,
              jurisdiction: doc.jurisdiction || "DE",
              doc_ref: doc.doc_ref || null,
              doc_date: doc.doc_date || null,
              metadata: doc.metadata || {},
              embedding: JSON.stringify(embedding),
              chunk_index: i,
            });

          if (insertError) {
            console.error("[embed] Insert error:", insertError);
            if (insertError.code === "23505") skipped++;
            else errors++;
          } else {
            embedded++;
          }
        }
      } catch (docErr) {
        console.error("[embed] Document processing error:", docErr);
        errors++;
      }
    }

    console.log(`[embed] Done: ${embedded} embedded, ${skipped} skipped, ${errors} errors`);
    return new Response(JSON.stringify({ embedded, skipped, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[embed] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
