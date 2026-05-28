import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer, BorderStyle, ExternalHyperlink, Table, TableRow, TableCell, WidthType } from "docx";
import { saveAs } from "file-saver";
import { toast } from "@/hooks/use-toast";

interface DocxExportOptions {
  messages: { role: string; content: { text: string } }[];
  sources?: { provider: string; title: string; doc_ref: string; url: string; date?: string; snippet?: string; pinpoint?: string }[];
  title?: string;
  matterName?: string;
}

interface DocumentExportOptions {
  content: string;
  title: string;
  matterName?: string;
}

function parseMarkdownToParagraphs(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    // Headers
    if (trimmed.startsWith("### ")) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: parseInlineFormatting(trimmed.slice(4)),
        spacing: { before: 200, after: 100 },
      }));
      continue;
    }
    if (trimmed.startsWith("## ")) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: parseInlineFormatting(trimmed.slice(3)),
        spacing: { before: 300, after: 120 },
      }));
      continue;
    }
    if (trimmed.startsWith("# ")) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: parseInlineFormatting(trimmed.slice(2)),
        spacing: { before: 400, after: 200 },
      }));
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      paragraphs.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
        spacing: { before: 120, after: 120 },
      }));
      continue;
    }

    // Bullet points
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      paragraphs.push(new Paragraph({
        children: parseInlineFormatting(trimmed.slice(2)),
        bullet: { level: 0 },
        spacing: { after: 60 },
      }));
      continue;
    }

    // Numbered lists
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: `${numMatch[1]}. ` }), ...parseInlineFormatting(numMatch[2])],
        spacing: { after: 60 },
      }));
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: trimmed.slice(2), italics: true, color: "666666" })],
        indent: { left: 720 },
        spacing: { after: 80 },
        border: { left: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 10 } },
      }));
      continue;
    }

    // Markdown table
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      // Collect all table lines
      const tableLines: string[] = [trimmed];
      const startIdx = lines.indexOf(line);
      for (let j = startIdx + 1; j < lines.length; j++) {
        const tl = lines[j].trim();
        if (tl.startsWith("|") && tl.endsWith("|")) {
          tableLines.push(tl);
          lines[j] = ""; // mark as consumed
        } else break;
      }
      // Filter out separator rows (|---|---|)
      const dataRows = tableLines.filter(r => !/^\|[\s\-:|]+\|$/.test(r));
      if (dataRows.length > 0) {
        const parsedRows = dataRows.map(r =>
          r.split("|").slice(1, -1).map(cell => cell.trim())
        );
        const colCount = Math.max(...parsedRows.map(r => r.length));
        const table = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: parsedRows.map((cells, rowIdx) =>
            new TableRow({
              children: Array.from({ length: colCount }, (_, ci) =>
                new TableCell({
                  children: [new Paragraph({
                    children: rowIdx === 0
                      ? [new TextRun({ text: cells[ci] || "", bold: true, size: 20 })]
                      : parseInlineFormatting(cells[ci] || ""),
                    spacing: { before: 40, after: 40 },
                  })],
                })
              ),
            })
          ),
        });
        paragraphs.push(new Paragraph({ spacing: { before: 120 } }));
        paragraphs.push(table as any);
        paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
      }
      continue;
    }

    // Regular paragraph
    paragraphs.push(new Paragraph({
      children: parseInlineFormatting(trimmed),
      spacing: { after: 80, line: 276 },
    }));
  }

  return paragraphs;
}

function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Simple inline parsing: **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], italics: true }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], font: "Consolas", size: 20, color: "333333" }));
    } else if (match[5]) {
      runs.push(new TextRun({ text: match[5] }));
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text })];
}

/**
 * Export a single document (contract, draft, etc.) to DOCX.
 * Uses the `docx` npm library for valid OOXML output.
 */
export async function exportDocumentToDocx(opts: DocumentExportOptions) {
  const now = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const sections: Paragraph[] = [];

  // Title
  sections.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    children: [new TextRun({ text: opts.title, bold: true, size: 36, font: "Calibri" })],
    spacing: { after: 100 },
  }));

  // Metadata line
  const metaParts: TextRun[] = [new TextRun({ text: `Datum: ${now}`, size: 18, color: "888888", italics: true })];
  if (opts.matterName) {
    metaParts.push(new TextRun({ text: `  |  Akte: ${opts.matterName}`, size: 18, color: "888888", italics: true }));
  }
  sections.push(new Paragraph({ children: metaParts, spacing: { after: 200 } }));

  // Separator
  sections.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
    spacing: { after: 200 },
  }));

  // Document content
  sections.push(...parseMarkdownToParagraphs(opts.content));

  // Disclaimer
  sections.push(new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
    spacing: { before: 400, after: 80 },
  }));
  sections.push(new Paragraph({
    children: [new TextRun({ text: `Erstellt am ${now} — KI-generiert, keine Rechtsberatung. Transparenzhinweis gem. Art. 50 AI Act.`, italics: true, size: 16, color: "999999" })],
    spacing: { after: 200 },
  }));

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
      },
      children: sections,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${(opts.title).replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, "").replace(/\s+/g, "-").toLowerCase()}.docx`;
  saveAs(blob, filename);
  toast({ title: "Exportiert", description: "Word-Dokument heruntergeladen." });
}

/**
 * Export full chat conversation to DOCX (used from toolbar).
 */
export async function exportToDocx(opts: DocxExportOptions) {
  const now = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const sections: Paragraph[] = [];

  sections.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    children: [new TextRun({ text: opts.title || "Recherche-Ergebnis", bold: true, size: 36 })],
    spacing: { after: 200 },
  }));

  if (opts.matterName) {
    sections.push(new Paragraph({
      children: [new TextRun({ text: "Akte: ", bold: true }), new TextRun({ text: opts.matterName })],
      spacing: { after: 60 },
    }));
  }
  sections.push(new Paragraph({
    children: [new TextRun({ text: "Datum: ", bold: true }), new TextRun({ text: now })],
    spacing: { after: 200 },
  }));

  sections.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
    spacing: { after: 200 },
  }));

  for (const msg of opts.messages) {
    const isUser = msg.role === "user";
    sections.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: isUser ? "Frage" : "Antwort", bold: true, size: 28, color: isUser ? "333333" : "1a5276" })],
      spacing: { before: 300, after: 120 },
    }));
    sections.push(...parseMarkdownToParagraphs(msg.content.text));
  }

  if (opts.sources && opts.sources.length > 0) {
    sections.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
      spacing: { before: 300, after: 200 },
    }));
    sections.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Quellenverzeichnis", bold: true, size: 28 })],
      spacing: { after: 120 },
    }));

    for (let i = 0; i < opts.sources.length; i++) {
      const s = opts.sources[i];
      const dateStr = s.date ? ` (${s.date})` : "";
      const children: TextRun[] = [
        new TextRun({ text: `${i + 1}. `, bold: true }),
        new TextRun({ text: s.title + dateStr, bold: true }),
      ];
      if (s.doc_ref) children.push(new TextRun({ text: ` — ${s.provider}: ${s.doc_ref}`, color: "666666" }));
      sections.push(new Paragraph({ children, spacing: { after: 40 } }));

      if (s.pinpoint && s.pinpoint !== s.doc_ref) {
        sections.push(new Paragraph({
          children: [new TextRun({ text: `   Fundstelle: ${s.pinpoint}`, color: "666666", size: 20 })],
          indent: { left: 360 },
        }));
      }
      if (s.url) {
        sections.push(new Paragraph({
          children: [new ExternalHyperlink({ children: [new TextRun({ text: s.url, color: "2980B9", underline: {} as any, size: 20 })], link: s.url })],
          indent: { left: 360 },
          spacing: { after: 80 },
        }));
      }
    }
  }

  sections.push(new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" } },
    spacing: { before: 400, after: 100 },
  }));
  sections.push(new Paragraph({
    children: [new TextRun({ text: `Exportiert am ${now} — KI-generiert, keine Rechtsberatung.`, italics: true, size: 18, color: "999999" })],
  }));

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
      },
      children: sections,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${(opts.title || "recherche").replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, "").replace(/\s+/g, "-").toLowerCase()}.docx`;
  saveAs(blob, filename);
  toast({ title: "Exportiert", description: "Word-Dokument heruntergeladen." });
}
