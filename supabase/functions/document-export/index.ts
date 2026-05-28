import { makeCorsHeaders } from "../_shared/cors.ts";
const encoder = new TextEncoder();

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Convert markdown-ish text to minimal OOXML paragraphs */
function mdToDocxParagraphs(md: string): string {
  const lines = md.split("\n");
  const paragraphs: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  const processInline = (text: string): string => {
    // Bold + italic
    let result = text;
    const runs: string[] = [];
    // Split by bold markers first
    const boldParts = result.split(/\*\*(.+?)\*\*/g);
    for (let i = 0; i < boldParts.length; i++) {
      if (!boldParts[i]) continue;
      if (i % 2 === 1) {
        // Bold text — check for nested italic
        const italicParts = boldParts[i].split(/\*(.+?)\*/g);
        for (let j = 0; j < italicParts.length; j++) {
          if (!italicParts[j]) continue;
          if (j % 2 === 1) {
            runs.push(`<w:r><w:rPr><w:b/><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(italicParts[j])}</w:t></w:r>`);
          } else {
            runs.push(`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(italicParts[j])}</w:t></w:r>`);
          }
        }
      } else {
        // Normal text — check for italic
        const italicParts = boldParts[i].split(/\*(.+?)\*/g);
        for (let j = 0; j < italicParts.length; j++) {
          if (!italicParts[j]) continue;
          if (j % 2 === 1) {
            runs.push(`<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(italicParts[j])}</w:t></w:r>`);
          } else {
            // Check for inline code
            const codeParts = italicParts[j].split(/`(.+?)`/g);
            for (let k = 0; k < codeParts.length; k++) {
              if (!codeParts[k]) continue;
              if (k % 2 === 1) {
                runs.push(`<w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/><w:shd w:val="clear" w:fill="F0F0F0"/></w:rPr><w:t xml:space="preserve">${escapeXml(codeParts[k])}</w:t></w:r>`);
              } else {
                runs.push(`<w:r><w:t xml:space="preserve">${escapeXml(codeParts[k])}</w:t></w:r>`);
              }
            }
          }
        }
      }
    }
    return runs.join("");
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const colCount = Math.max(...tableRows.map(r => r.length));
    const colWidth = Math.floor(9000 / colCount);

    let tableXml = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideV w:val="single" w:sz="4" w:color="CCCCCC"/></w:tblBorders></w:tblPr>`;

    tableRows.forEach((row, rowIdx) => {
      tableXml += `<w:tr>`;
      for (let c = 0; c < colCount; c++) {
        const cellText = (row[c] || "").trim();
        const isHeader = rowIdx === 0;
        const rPr = isHeader ? `<w:rPr><w:b/></w:rPr>` : "";
        const shading = isHeader ? `<w:shd w:val="clear" w:fill="F5F5F5"/>` : "";
        tableXml += `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/>${shading}</w:tcPr><w:p><w:pPr><w:spacing w:after="40"/></w:pPr><w:r>${rPr}<w:t xml:space="preserve">${escapeXml(cellText)}</w:t></w:r></w:p></w:tc>`;
      }
      tableXml += `</w:tr>`;
    });

    tableXml += `</w:tbl>`;
    paragraphs.push(tableXml);
    paragraphs.push(`<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>`);
    tableRows = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Table detection
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      // Skip separator rows (|---|---|)
      if (/^\|[\s\-:]+\|/.test(trimmed) && !trimmed.replace(/[\s|\-:]/g, "")) {
        inTable = true;
        continue;
      }
      inTable = true;
      const cells = trimmed.split("|").slice(1, -1);
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
      inTable = false;
    }

    if (!trimmed) {
      paragraphs.push(`<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>`);
      continue;
    }

    // Headings
    const h1 = trimmed.match(/^#\s+(.+)/);
    if (h1) {
      paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">${escapeXml(h1[1].replace(/\*\*/g, ""))}</w:t></w:r></w:p>`);
      continue;
    }
    const h2 = trimmed.match(/^##\s+(.+)/);
    if (h2) {
      paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="200" w:after="100"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${escapeXml(h2[1].replace(/\*\*/g, ""))}</w:t></w:r></w:p>`);
      continue;
    }
    const h3 = trimmed.match(/^###\s+(.+)/);
    if (h3) {
      paragraphs.push(`<w:p><w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(h3[1].replace(/\*\*/g, ""))}</w:t></w:r></w:p>`);
      continue;
    }

    // Blockquotes
    const blockquote = trimmed.match(/^>\s*(.+)/);
    if (blockquote) {
      paragraphs.push(`<w:p><w:pPr><w:pBdr><w:left w:val="single" w:sz="12" w:color="CCCCCC" w:space="8"/></w:pBdr><w:ind w:left="360"/><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr>${processInline(blockquote[1])}</w:p>`);
      continue;
    }

    // Unordered lists
    const ulMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      paragraphs.push(`<w:p><w:pPr><w:ind w:left="360" w:hanging="200"/><w:spacing w:after="40" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:t xml:space="preserve">•  </w:t></w:r>${processInline(ulMatch[1])}</w:p>`);
      continue;
    }

    // Ordered lists
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (olMatch) {
      paragraphs.push(`<w:p><w:pPr><w:ind w:left="360" w:hanging="200"/><w:spacing w:after="40" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:t xml:space="preserve">${olMatch[1]}.  </w:t></w:r>${processInline(olMatch[2])}</w:p>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      paragraphs.push(`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:color="DDDDDD"/></w:pBdr><w:spacing w:before="120" w:after="120"/></w:pPr></w:p>`);
      continue;
    }

    // Normal paragraph with inline formatting
    paragraphs.push(`<w:p><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr>${processInline(trimmed)}</w:p>`);
  }

  // Flush remaining table
  if (inTable) flushTable();

  return paragraphs.join("\n");
}

/** Build a minimal valid .docx (OOXML) as Uint8Array using raw ZIP construction */
function buildDocx(content: string, title: string, date: string, matterName?: string): Uint8Array {
  const headerText = matterName ? `${title} — Akte: ${matterName}` : title;
  const disclaimer = "KI-generiert — ersetzt keine individuelle anwaltliche Beratung.";

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
<w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:rPr><w:color w:val="888888"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(headerText)} | ${escapeXml(date)}</w:t></w:r></w:p>
<w:p><w:pPr><w:spacing w:after="200"/></w:pPr></w:p>
${mdToDocxParagraphs(content)}
<w:p><w:pPr><w:spacing w:before="400" w:after="0"/></w:pPr><w:r><w:rPr><w:i/><w:color w:val="999999"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">${escapeXml(disclaimer)}</w:t></w:r></w:p>
</w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  // Minimal ZIP builder (store-only, no compression for simplicity)
  const files: { name: string; data: Uint8Array }[] = [
    { name: "[Content_Types].xml", data: encoder.encode(contentTypesXml) },
    { name: "_rels/.rels", data: encoder.encode(relsXml) },
    { name: "word/document.xml", data: encoder.encode(documentXml) },
    { name: "word/_rels/document.xml.rels", data: encoder.encode(wordRelsXml) },
  ];

  return buildZip(files);
}

function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    // Local file header
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true); // signature
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0, true); // flags
    view.setUint16(8, 0, true); // compression (store)
    view.setUint16(10, 0, true); // mod time
    view.setUint16(12, 0, true); // mod date
    view.setUint32(14, crc32(file.data), true); // crc32
    view.setUint32(18, file.data.length, true); // compressed size
    view.setUint32(22, file.data.length, true); // uncompressed size
    view.setUint16(26, nameBytes.length, true); // name length
    view.setUint16(28, 0, true); // extra length
    localHeader.set(nameBytes, 30);

    // Central directory entry
    const cdEntry = new Uint8Array(46 + nameBytes.length);
    const cdView = new DataView(cdEntry.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint16(8, 0, true);
    cdView.setUint16(10, 0, true);
    cdView.setUint16(12, 0, true);
    cdView.setUint16(14, 0, true);
    cdView.setUint32(16, crc32(file.data), true);
    cdView.setUint32(20, file.data.length, true);
    cdView.setUint32(24, file.data.length, true);
    cdView.setUint16(28, nameBytes.length, true);
    cdView.setUint16(30, 0, true);
    cdView.setUint16(32, 0, true);
    cdView.setUint16(34, 0, true);
    cdView.setUint16(36, 0, true);
    cdView.setUint32(38, 0, true);
    cdView.setUint32(42, offset, true);
    cdEntry.set(nameBytes, 46);

    parts.push(localHeader, file.data);
    centralDir.push(cdEntry);
    offset += localHeader.length + file.data.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) cdSize += cd.length;

  // End of central directory
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, cdSize, true);
  eocdView.setUint32(16, cdOffset, true);
  eocdView.setUint16(20, 0, true);

  const totalSize = offset + cdSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const p of parts) { result.set(p, pos); pos += p.length; }
  for (const cd of centralDir) { result.set(cd, pos); pos += cd.length; }
  result.set(eocd, pos);

  return result;
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

Deno.serve(async (req) => {
  const corsHeaders = makeCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    const { content, title, date, matterName } = await req.json();

    if (!content || typeof content !== "string" || content.length > 500000) {
      return new Response(JSON.stringify({ error: "Invalid or missing content" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docxBytes = buildDocx(
      content,
      title || "Dokument",
      date || new Date().toLocaleDateString("de-DE"),
      matterName
    );

    const bodyBytes = new Uint8Array(docxBytes.byteLength);
    bodyBytes.set(docxBytes);
    const body = new Blob([bodyBytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    return new Response(body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(title || "dokument")}.docx"`,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
