import { useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import type { Matter } from "@/lib/matters-api";

export function useChatExport(
  currentMatter: Matter | undefined,
  setIsExporting: (v: boolean) => void,
) {
  const handleDocumentExport = useCallback(async (content: string, title: string, format: "md" | "docx" | "pdf") => {
    const safeTitle = title.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, "").replace(/\s+/g, "-").toLowerCase();

    // Strip AI intro text (lines before the actual document starts)
    const cleanContent = stripAiIntro(content);

    if (format === "md") {
      const blob = new Blob([cleanContent], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeTitle}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exportiert", description: "Markdown-Datei heruntergeladen." });
      return;
    }

    if (format === "pdf") {
      setIsExporting(true);
      try {
        const { default: jsPDF } = await import("jspdf");
        const doc = new jsPDF({ unit: "mm", format: "a4" });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        const maxWidth = pageWidth - margin * 2;
        let y = 25;

        // Subtle header with title and date
        doc.setFontSize(8);
        doc.setTextColor(150);
        const dateStr = new Date().toLocaleDateString("de-DE");
        const headerText = currentMatter?.name ? `${title} — Akte: ${currentMatter.name} | ${dateStr}` : `${title} | ${dateStr}`;
        doc.text(headerText, margin, 15);
        doc.setTextColor(30);

        const lines = cleanContent.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) { y += 4; continue; }

          const h1 = trimmed.match(/^#\s+(.+)/);
          const h2 = trimmed.match(/^##\s+(.+)/);
          const h3 = trimmed.match(/^###\s+(.+)/);
          const bullet = trimmed.match(/^[-*]\s+(.+)/);
          const numbered = trimmed.match(/^(\d+)\.\s+(.+)/);

          if (h1) {
            doc.setFontSize(16); doc.setFont("helvetica", "bold");
            const wrapped = doc.splitTextToSize(h1[1].replace(/\*\*/g, ""), maxWidth);
            if (y + wrapped.length * 7 > 275) { doc.addPage(); y = 25; }
            doc.text(wrapped, margin, y); y += wrapped.length * 7 + 4;
          } else if (h2) {
            doc.setFontSize(13); doc.setFont("helvetica", "bold");
            const wrapped = doc.splitTextToSize(h2[1].replace(/\*\*/g, ""), maxWidth);
            if (y + wrapped.length * 6 > 275) { doc.addPage(); y = 25; }
            doc.text(wrapped, margin, y); y += wrapped.length * 6 + 3;
          } else if (h3) {
            doc.setFontSize(11); doc.setFont("helvetica", "bold");
            const wrapped = doc.splitTextToSize(h3[1].replace(/\*\*/g, ""), maxWidth);
            if (y + wrapped.length * 5 > 275) { doc.addPage(); y = 25; }
            doc.text(wrapped, margin, y); y += wrapped.length * 5 + 2;
          } else if (bullet) {
            doc.setFontSize(10); doc.setFont("helvetica", "normal");
            const cleanText = bullet[1].replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
            const wrapped = doc.splitTextToSize(cleanText, maxWidth - 8);
            if (y + wrapped.length * 4.5 > 275) { doc.addPage(); y = 25; }
            doc.text("\u2022", margin, y);
            doc.text(wrapped, margin + 8, y);
            y += wrapped.length * 4.5 + 1.5;
          } else if (numbered) {
            doc.setFontSize(10); doc.setFont("helvetica", "normal");
            const cleanText = numbered[2].replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
            const wrapped = doc.splitTextToSize(cleanText, maxWidth - 10);
            if (y + wrapped.length * 4.5 > 275) { doc.addPage(); y = 25; }
            doc.text(`${numbered[1]}.`, margin, y);
            doc.text(wrapped, margin + 10, y);
            y += wrapped.length * 4.5 + 1.5;
          } else {
            doc.setFontSize(10); doc.setFont("helvetica", "normal");
            const cleanText = trimmed.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
            const wrapped = doc.splitTextToSize(cleanText, maxWidth);
            if (y + wrapped.length * 4.5 > 275) { doc.addPage(); y = 25; }
            doc.text(wrapped, margin, y); y += wrapped.length * 4.5 + 1.5;
          }
        }

        // Small footer disclaimer
        const totalPages = doc.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
          doc.setPage(p);
          doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "italic");
          doc.text(`Seite ${p}/${totalPages}`, pageWidth - margin, 288, { align: "right" });
        }
        doc.setPage(totalPages);
        doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "italic");
        doc.text("KI-generiert — keine Rechtsberatung. Transparenzhinweis gem. Art. 50 AI Act.", margin, 288);

        doc.save(`${safeTitle}.pdf`);
        toast({ title: "Exportiert", description: "PDF-Datei heruntergeladen." });
      } catch (e: any) {
        toast({ title: "Fehler", description: e.message || "PDF-Export fehlgeschlagen.", variant: "destructive" });
      } finally {
        setIsExporting(false);
      }
      return;
    }

    // DOCX export — client-side using docx library
    setIsExporting(true);
    try {
      const { exportDocumentToDocx } = await import("@/lib/docx-export");
      await exportDocumentToDocx({
        content: cleanContent,
        title,
        matterName: currentMatter?.name,
      });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message || "Export fehlgeschlagen.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }, [currentMatter, setIsExporting]);

  return { handleDocumentExport };
}

/**
 * Strip AI introductory text before the actual document content.
 * Common patterns: "Nachstehend finden Sie...", "Hier ist der Entwurf...", etc.
 */
function stripAiIntro(content: string): string {
  const lines = content.split("\n");
  
  // Find where the actual document starts (first heading or structured content)
  const introPatterns = [
    /^(nachstehend|hier ist|im folgenden|anbei|nachfolgend|gerne|selbstverständlich)/i,
    /^(ich habe|der entwurf|das dokument|die vereinbarung)/i,
    /^(bitte beachten|hinweis:|wichtig:)/i,
  ];
  
  let startIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    
    // If we hit a heading or structured content, that's the document start
    if (trimmed.startsWith("#") || trimmed.startsWith("§") || trimmed.startsWith("|")) {
      startIdx = i;
      break;
    }
    
    // If this line looks like AI intro, skip it
    if (introPatterns.some(p => p.test(trimmed))) {
      startIdx = i + 1;
      // Skip blank lines after intro
      while (startIdx < lines.length && !lines[startIdx].trim()) startIdx++;
      continue;
    }
    
    // If we're past line 3 without finding intro patterns, assume no intro
    if (i >= 3) break;
  }
  
  return lines.slice(startIdx).join("\n");
}
