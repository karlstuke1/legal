import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase-safe";
import { Button } from "@/components/ui/button";
import { ArrowRight, Paperclip, StopCircle, Check, ChevronDown, Home, Briefcase, Gavel, Users, Building2, BookOpen } from "lucide-react";
import { UploadTray } from "@/components/UploadTray";
import { uploadFile, validateFile, QuotaExceededError, type UploadedFile } from "@/lib/file-upload";
import { toast } from "@/hooks/use-toast";
import type { ChatFilters, Jurisdiction, SourceProvider } from "@/lib/types";
import { JURISDICTION_LABELS, JURISDICTION_FLAGS, MODE_LABELS, LEGAL_AREA_LABELS, LEGAL_AREA_DESCRIPTIONS } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";

const UNIVERSAL_PLACEHOLDER = "Beschreiben Sie Anliegen, Kontext und gewünschtes Ergebnis.";

const PROMPT_TEMPLATE = `Was möchte ich wissen?
z.B. "Kann mein Vermieter die Kaution einbehalten, obwohl keine Schäden vorliegen?"

Hintergrund (optional):
z.B. Mietvertrag seit 2019, Wohnung in Wien, Kaution: 3 Monatsmieten

Gewünschtes Format (optional):
z.B. Gutachten-Stil mit Paragraphen / Kurze Zusammenfassung / Checkliste`;

const QUICK_PROMPTS = [
  {
    icon: Home,
    label: "Mietrecht",
    color: "text-emerald-500",
    prompt: "Mein Vermieter hat mir eine Mieterhöhung angekündigt. Ist diese rechtlich zulässig und welche Fristen gelten?\n\nHintergrund:\nMietvertrag seit [Jahr], Mietzins [Betrag] €, Wohnort: [Stadt]\n\nGewünschtes Format:\nPrüfschema mit den relevanten §§ MRG",
  },
  {
    icon: Briefcase,
    label: "Arbeitsrecht",
    color: "text-blue-500",
    prompt: "Ich habe eine Kündigung erhalten. Welche Rechte habe ich und welche Fristen muss ich beachten?\n\nHintergrund:\nBeschäftigt seit [Jahr], Betriebsgröße [Anzahl] MA, Kündigungsgrund: [Grund]\n\nGewünschtes Format:\nCheckliste mit Fristen und nächsten Schritten",
  },
  {
    icon: Gavel,
    label: "Strafrecht",
    color: "text-red-500",
    prompt: "Ich wurde als Beschuldigter in einem Ermittlungsverfahren vorgeladen. Was sind meine Rechte und wie sollte ich mich verhalten?\n\nHintergrund:\nVorwurf: [Tatbestand], Aktenzeichen: [falls bekannt]\n\nGewünschtes Format:\nVerhaltensanleitung mit Rechtsgrundlagen",
  },
  {
    icon: Users,
    label: "Familienrecht",
    color: "text-pink-500",
    prompt: "Wie wird der Unterhalt nach einer Scheidung berechnet und welche Ansprüche bestehen?\n\nHintergrund:\nEhejahre: [Anzahl], Kinder: [Anzahl/Alter], Einkommen: [ungefähr]\n\nGewünschtes Format:\nÜbersicht der Unterhaltsarten mit Berechnungsgrundlagen",
  },
  {
    icon: Building2,
    label: "Gesellschaftsrecht",
    color: "text-amber-500",
    prompt: "Welche Rechtsform ist für mein Vorhaben am besten geeignet und welche Schritte sind zur Gründung nötig?\n\nHintergrund:\nBranche: [Branche], Gründer: [Anzahl], geplantes Stammkapital: [Betrag]\n\nGewünschtes Format:\nVergleichstabelle der Rechtsformen mit Vor-/Nachteilen",
  },
  {
    icon: BookOpen,
    label: "Vertragsrecht",
    color: "text-violet-500",
    prompt: "Ich möchte einen Vertrag prüfen lassen. Worauf muss ich besonders achten und welche Klauseln sind problematisch?\n\nHintergrund:\nVertragstyp: [Typ], Vertragspartner: [Beschreibung]\n\nGewünschtes Format:\nKlausel-für-Klausel-Analyse mit Risikoeinschätzung",
  },
];

interface ComposerProps {
  onSend: (text: string, fileIds: string[]) => void;
  onStop?: () => void;
  disabled?: boolean;
  loading?: boolean;
  iterationLimitReached?: boolean;
  workspaceId?: string;
  userId?: string;
  chatId?: string;
  filters: ChatFilters;
  onFiltersChange: (filters: ChatFilters) => void;
  isLawyer?: boolean;
  initialText?: string;
  onUploadQuotaExceeded?: () => void;
  modeLocked?: boolean;
}

export function Composer({
  onSend,
  onStop,
  disabled,
  loading,
  workspaceId,
  userId,
  chatId,
  filters,
  onFiltersChange,
  isLawyer,
  iterationLimitReached,
  initialText,
  onUploadQuotaExceeded,
  modeLocked,
}: ComposerProps) {
  const [text, setText] = useState(initialText || "");
  const [queriesRemaining, setQueriesRemaining] = useState<{ used: number; limit: number } | null>(null);

  const refreshQuota = useCallback(() => {
    if (!workspaceId) return;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthStart = startOfMonth.toISOString();

    Promise.all([
      supabase.from("plans").select("monthly_queries_limit").eq("workspace_id", workspaceId).single(),
      supabase.from("usage_ledger").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("created_at", monthStart),
    ]).then(([planRes, usageRes]) => {
      const limit = planRes.data?.monthly_queries_limit || 25;
      const used = usageRes.count || 0;
      if (limit < 999999) {
        setQueriesRemaining({ used, limit });
      }
    });
  }, [workspaceId]);

  // Fetch query quota on mount
  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);
  const initialTextApplied = useRef(false);

  useEffect(() => {
    if (initialText && !initialTextApplied.current) {
      setText(initialText);
      initialTextApplied.current = true;
    }
  }, [initialText]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const showHelper = text.trim().length === 0 && !iterationLimitReached;

  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      refreshQuota();
    }
    prevLoadingRef.current = !!loading;
  }, [loading, refreshQuota]);

  const handleSend = () => {
    const trimmed = text.trim();
    if ((!trimmed && files.filter((f) => f.status === "done").length === 0) || disabled || iterationLimitReached) return;
    const doneFileIds = files.filter((f) => f.status === "done").map((f) => f.id);
    onSend(trimmed, doneFileIds);
    setText("");
    setFiles([]);
    // Optimistic increment
    setQueriesRemaining(prev => prev ? { ...prev, used: prev.used + 1 } : prev);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (!loading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [text]);

  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (!workspaceId || !userId) return;
      const arr = Array.from(fileList);
      for (const file of arr) {
        const error = validateFile(file);
        if (error) {
          toast({ title: "Datei abgelehnt", description: error, variant: "destructive" });
          continue;
        }
        const tempId = crypto.randomUUID();
        const uploadingFile: UploadedFile = {
          id: tempId, name: file.name, mime: file.type, size: file.size,
          storage_path: "", progress: 0, status: "uploading",
        };
        setFiles((prev) => [...prev, uploadingFile]);
        try {
          const result = await uploadFile(file, workspaceId, userId, chatId, (p) => {
            setFiles((prev) => prev.map((f) => (f.id === tempId ? { ...f, progress: p } : f)));
          });
          if (result) {
            setFiles((prev) => prev.map((f) => (f.id === tempId ? result : f)));
          } else {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === tempId ? { ...f, status: "error" as const, error: "Upload fehlgeschlagen" } : f
              )
            );
          }
        } catch (err) {
          if (err instanceof QuotaExceededError) {
            setFiles((prev) => prev.filter((f) => f.id !== tempId));
            onUploadQuotaExceeded?.();
            return; // Stop processing further files
          }
          setFiles((prev) =>
            prev.map((f) =>
              f.id === tempId ? { ...f, status: "error" as const, error: "Upload fehlgeschlagen" } : f
            )
          );
        }
      }
    },
    [workspaceId, userId, chatId]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) processFiles(pastedFiles);
  };

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const hasUploadingFiles = files.some((f) => f.status === "uploading");

  const toggleJurisdiction = (j: Jurisdiction) => {
    const current = filters.jurisdiction;
    const next = current.includes(j) ? current.filter((x) => x !== j) : [...current, j];
    if (next.length === 0) return;
    onFiltersChange({ ...filters, jurisdiction: next });
  };

  const toggleSource = (s: SourceProvider) => {
    if (s === "AUTO") {
      onFiltersChange({ ...filters, sources: ["AUTO"], autoRouter: true });
      return;
    }
    const current = filters.sources.filter((x) => x !== "AUTO");
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    if (next.length === 0) {
      onFiltersChange({ ...filters, sources: ["AUTO"], autoRouter: true });
    } else {
      onFiltersChange({ ...filters, sources: next, autoRouter: false });
    }
  };

  const hasContent = text.trim().length > 0 || files.filter((f) => f.status === "done").length > 0;


  const toolbarButtonClass =
    "flex h-8 sm:h-9 items-center gap-1 sm:gap-1.5 rounded-xl px-2 sm:px-2.5 text-muted-foreground/45 hover:bg-muted/35 hover:text-muted-foreground transition-all duration-200 disabled:opacity-30 shrink-0";

  const filterTriggerClass =
    "flex h-8 sm:h-9 items-center gap-1 sm:gap-1.5 rounded-xl border border-border/40 bg-card/40 px-2 sm:px-2.5 text-muted-foreground/55 hover:border-border/60 hover:bg-card hover:text-foreground/75 transition-all duration-200 shrink-0";

  return (
    <div className="px-2.5 sm:px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-6 pt-1 sm:pt-2" data-tour="composer">
      <div className="mx-auto max-w-3xl">
        {/* Mode tabs — minimal, no background container */}

        {/* Clean composer card */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-2xl border bg-card/70 shadow-[0_18px_55px_-42px_hsl(var(--foreground))] backdrop-blur-sm transition-all duration-200 ${
            isDragging
              ? "border-foreground/25 ring-2 ring-foreground/5"
              : "border-border/45 focus-within:border-border/70 focus-within:shadow-[0_22px_60px_-44px_hsl(var(--foreground))]"
          }`}
        >
          <UploadTray files={files} onRemove={removeFile} />

          {/* Textarea */}
          <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-1.5 sm:pb-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={UNIVERSAL_PLACEHOLDER}
              className="w-full min-h-[50px] sm:min-h-[56px] max-h-[200px] resize-none border-0 bg-transparent p-0 text-[14px] sm:text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/36 focus:outline-none disabled:opacity-50"
              rows={2}
              disabled={iterationLimitReached}
            />
          </div>

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 sm:px-4 pb-3 gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
                onChange={handleFileSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!workspaceId}
                aria-label="Datei anhängen"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-muted/30 transition-all"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <div className="h-4 w-px bg-border/30" />

              {/* Jurisdiction */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-muted-foreground/50 hover:text-muted-foreground/80 hover:bg-muted/30 transition-all">
                    <span className="text-sm tracking-wide">
                      {filters.jurisdiction.map((j) => JURISDICTION_FLAGS[j]).join(" ")}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {(Object.entries(JURISDICTION_LABELS) as [Jurisdiction, string][]).map(([k, v]) => {
                    const isActive = filters.jurisdiction.includes(k);
                    return (
                      <DropdownMenuItem
                        key={k}
                        onClick={() => toggleJurisdiction(k)}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{JURISDICTION_FLAGS[k]}</span>
                          <span>{v}</span>
                        </div>
                        {isActive && <Check className="h-3.5 w-3.5 text-foreground" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center shrink-0">
              {loading ? (
                <Button
                  onClick={onStop}
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-xl border border-border/60 bg-card text-foreground/70 hover:bg-muted/50 hover:text-foreground"
                  title="Generierung stoppen"
                >
                  <StopCircle className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  disabled={!hasContent || disabled || hasUploadingFiles}
                  size="icon"
                  className="h-9 w-9 rounded-xl bg-foreground text-background shadow-sm transition-all hover:bg-foreground/90 hover:shadow-md disabled:opacity-25 disabled:shadow-none"
                  aria-label="Absenden"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="hidden sm:flex items-center justify-center gap-2 mt-2.5 mb-1">
          {queriesRemaining && (
            <span className={`flex items-center gap-1 text-[11px] select-none ${
              queriesRemaining.used >= queriesRemaining.limit
                ? "text-destructive/60"
                : queriesRemaining.used / queriesRemaining.limit >= 0.8
                  ? "text-amber-500/50"
                  : "text-muted-foreground/30"
            }`}>
              {queriesRemaining.limit - queriesRemaining.used} von {queriesRemaining.limit} Anfragen übrig
              <span className="mx-1">·</span>
            </span>
          )}
          <p className="text-[11px] text-muted-foreground/25 select-none">
            KI-generierte Antworten ersetzen keine anwaltliche Beratung.
          </p>
        </div>
      </div>
    </div>
  );
}
