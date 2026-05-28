import { useCallback } from "react";
import { toast } from "@/hooks/use-toast";

interface ExportOptions {
  messages: { role: string; content: { text: string } }[];
  sources?: { provider: string; title: string; doc_ref: string; url: string; date?: string; snippet?: string; pinpoint?: string }[];
  title?: string;
  matterName?: string;
}

function buildMarkdown({ messages, sources, title, matterName }: ExportOptions): string {
  const lines: string[] = [];
  const now = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  lines.push(`# ${title || "Recherche-Ergebnis"}`);
  lines.push("");
  if (matterName) lines.push(`**Akte:** ${matterName}`);
  lines.push(`**Datum:** ${now}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const msg of messages) {
    if (msg.role === "user") {
      lines.push(`## Frage`);
      lines.push("");
      lines.push(msg.content.text);
      lines.push("");
    } else if (msg.role === "assistant") {
      lines.push(`## Antwort`);
      lines.push("");
      lines.push(msg.content.text);
      lines.push("");
    }
  }

  if (sources && sources.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Quellenverzeichnis");
    lines.push("");
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      const dateStr = s.date ? ` (${s.date})` : "";
      lines.push(`${i + 1}. **${s.title}**${dateStr}  `);
      if (s.doc_ref) lines.push(`   ${s.provider}: ${s.doc_ref}  `);
      if (s.pinpoint && s.pinpoint !== s.doc_ref) lines.push(`   Fundstelle: ${s.pinpoint}  `);
      if (s.snippet) lines.push(`   > ${s.snippet.slice(0, 200)}  `);
      if (s.url) lines.push(`   [Link](${s.url})  `);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(`*Exportiert am ${now} — KI-generierte Antworten ersetzen keine anwaltliche Beratung.*`);
  lines.push("");
  lines.push(`*⚠️ Transparenzhinweis (Art. 50 AI Act): Diese Inhalte wurden maßgeblich durch Künstliche Intelligenz generiert. Bei Verwendung gegenüber Mandanten, Gerichten oder Behörden ist auf den KI-Einsatz hinzuweisen.*`);

  return lines.join("\n");
}

export function useExport() {
  const exportMarkdown = useCallback((opts: ExportOptions) => {
    const md = buildMarkdown(opts);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(opts.title || "recherche").replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, "").replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exportiert", description: "Markdown-Datei heruntergeladen." });
  }, []);

  const copyToClipboard = useCallback((opts: ExportOptions) => {
    const md = buildMarkdown(opts);
    navigator.clipboard.writeText(md);
    toast({ title: "Kopiert", description: "Recherche in Zwischenablage kopiert." });
  }, []);

  return { exportMarkdown, copyToClipboard };
}
