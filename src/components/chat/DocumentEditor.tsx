import React, { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, FileDown, Eye, Pencil, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { mdComponents } from "./markdown-config";

interface DocumentEditorProps {
  content: string;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  onExport: (content: string, title: string, format: "md" | "docx" | "pdf") => void;
  isExporting?: boolean;
}

export function DocumentEditor({
  content: initialContent,
  title: initialTitle,
  isOpen,
  onClose,
  onExport,
  isExporting,
}: DocumentEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [title, setTitle] = useState(initialTitle);
  const [view, setView] = useState<"preview" | "edit">("preview");

  // Reset content when opened with new content
  React.useEffect(() => {
    setContent(initialContent);
    setTitle(initialTitle);
    setView("preview");
  }, [initialContent, initialTitle]);

  const handleExport = useCallback(
    (format: "md" | "docx" | "pdf") => {
      onExport(content, title, format);
    },
    [content, title, onExport]
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-4xl h-[85vh] flex flex-col bg-background border border-border/50 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/30 shrink-0">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileDown className="h-4 w-4 text-primary/70" />
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-[15px] font-semibold text-foreground bg-transparent border-none outline-none flex-1 min-w-0 placeholder:text-muted-foreground/40"
                placeholder="Dokumenttitel…"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* View toggle */}
              <div className="flex items-center bg-muted/40 rounded-lg p-0.5">
                <button
                  onClick={() => setView("preview")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                    view === "preview"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground/60 hover:text-foreground"
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Vorschau
                </button>
                <button
                  onClick={() => setView("edit")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                    view === "edit"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground/60 hover:text-foreground"
                  }`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Bearbeiten
                </button>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {view === "preview" ? (
              <div className="max-w-3xl mx-auto px-8 py-8">
                {/* Document-style header */}
                <div className="mb-6 pb-4 border-b border-border/30">
                  <h1 className="text-[20px] font-bold text-foreground/90">{title}</h1>
                  <p className="text-[12px] text-muted-foreground/40 mt-1">
                    {new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                </div>
                <div className="chat-prose max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {content}
                  </ReactMarkdown>
                </div>
                <div className="mt-8 pt-4 border-t border-border/20 space-y-1.5">
                  <p className="text-[11px] text-muted-foreground/30 italic">
                    KI-generiert — ersetzt keine individuelle anwaltliche Beratung.
                  </p>
                  <p className="text-[10px] text-muted-foreground/25 italic">
                    ⚠️ Transparenzhinweis (Art. 50 AI Act): Bei Verwendung gegenüber Mandanten, Gerichten oder Behörden ist auf den KI-Einsatz hinzuweisen.
                  </p>
                </div>
              </div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-full px-8 py-6 text-[14px] leading-[1.8] text-foreground bg-transparent border-none outline-none resize-none font-mono"
                spellCheck={false}
              />
            )}
          </div>

          {/* Footer with export buttons */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border/30 shrink-0 bg-muted/10">
            <p className="text-[11px] text-muted-foreground/40">
              {content.split(/\s+/).filter(Boolean).length} Wörter · {content.split("\n").length} Zeilen
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-[12px] gap-1.5 rounded-lg"
                onClick={() => handleExport("md")}
              >
                <Download className="h-3.5 w-3.5" />
                Markdown
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-[12px] gap-1.5 rounded-lg"
                onClick={() => handleExport("pdf")}
                disabled={isExporting}
              >
                <Download className="h-3.5 w-3.5" />
                {isExporting ? "…" : "PDF"}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-8 px-3.5 text-[12px] gap-1.5 rounded-lg"
                onClick={() => handleExport("docx")}
                disabled={isExporting}
              >
                <Download className="h-3.5 w-3.5" />
                {isExporting ? "…" : "DOCX"}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
