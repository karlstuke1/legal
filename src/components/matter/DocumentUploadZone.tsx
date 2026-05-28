import { useState, useCallback } from "react";
import { Upload, FileText, X, Loader2, CheckCircle2 } from "lucide-react";
import { uploadFile, validateFile, formatFileSize } from "@/lib/file-upload";
import { supabase } from "@/lib/supabase-safe";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface DocumentUploadZoneProps {
  workspaceId: string;
  matterId: string;
  onUploadComplete: () => void;
}

interface PendingFile {
  file: File;
  status: "uploading" | "done" | "error";
  error?: string;
}

export default function DocumentUploadZone({
  workspaceId,
  matterId,
  onUploadComplete,
}: DocumentUploadZoneProps) {
  const { user } = useAuth();
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (!user) return;
      const files = Array.from(fileList);
      const newPending: PendingFile[] = files.map((f) => ({
        file: f,
        status: "uploading" as const,
      }));
      setPending((prev) => [...prev, ...newPending]);

      let successCount = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const validationError = validateFile(file);
        if (validationError) {
          setPending((prev) =>
            prev.map((p) =>
              p.file === file ? { ...p, status: "error", error: validationError } : p
            )
          );
          continue;
        }

        try {
          const result = await uploadFile(file, workspaceId, user.id, undefined);
          if (result) {
            const { error: updateError } = await supabase
              .from("files")
              .update({ matter_id: matterId })
              .eq("id", result.id);

            if (updateError) {
              console.error("Error setting matter_id:", updateError);
            }
            setPending((prev) =>
              prev.map((p) => (p.file === file ? { ...p, status: "done" } : p))
            );
            successCount++;
          } else {
            setPending((prev) =>
              prev.map((p) =>
                p.file === file ? { ...p, status: "error", error: "Upload fehlgeschlagen" } : p
              )
            );
          }
        } catch (error) {
          console.error("Upload error:", error);
          setPending((prev) =>
            prev.map((p) =>
              p.file === file ? { ...p, status: "error", error: "Unerwarteter Fehler" } : p
            )
          );
        }
      }

      if (successCount > 0) {
        toast({ title: `${successCount} Datei(en) hochgeladen` });
        onUploadComplete();
      }

      setTimeout(() => {
        setPending((prev) => prev.filter((p) => p.status === "error"));
      }, 2500);
    },
    [user, workspaceId, matterId, onUploadComplete]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.multiple = true;
          input.accept = ".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp";
          input.onchange = () => input.files && handleFiles(input.files);
          input.click();
        }}
        className={`flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300 ${
          dragging
            ? "border-primary/40 bg-primary/[0.03] scale-[1.01]"
            : "border-border/30 hover:border-border/50 hover:bg-card/30"
        }`}
      >
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center transition-colors duration-300 ${
          dragging ? "bg-primary/10" : "bg-muted/40"
        }`}>
          <Upload className={`h-5 w-5 transition-colors duration-300 ${
            dragging ? "text-primary/60" : "text-muted-foreground/35"
          }`} />
        </div>
        <div className="text-center">
          <p className="text-[13px] text-muted-foreground/60">
            Dateien hierher ziehen oder <span className="text-foreground/70 underline underline-offset-2 decoration-foreground/20">auswählen</span>
          </p>
          <p className="text-[11px] text-muted-foreground/30 mt-1">PDF, DOCX, TXT, Bilder · Max. 20 MB</p>
        </div>
      </div>

      <AnimatePresence>
        {pending.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-1.5 overflow-hidden"
          >
            {pending.map((p, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-card/50 border border-border/20"
              >
                {p.status === "uploading" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/70" />
                ) : p.status === "done" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <X className="h-3.5 w-3.5 text-destructive" />
                )}
                <span className="text-[12px] text-foreground/70 truncate flex-1">{p.file.name}</span>
                <span className="text-[11px] text-muted-foreground/40 tabular-nums">{formatFileSize(p.file.size)}</span>
                {p.error && (
                  <span className="text-[11px] text-destructive truncate max-w-[200px]">{p.error}</span>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}