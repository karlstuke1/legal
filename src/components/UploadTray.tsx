import { X, FileText, Image, File as FileIcon, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UploadedFile } from "@/lib/file-upload";
import { formatFileSize } from "@/lib/file-upload";
import { motion, AnimatePresence } from "framer-motion";

interface UploadTrayProps {
  files: UploadedFile[];
  onRemove: (id: string) => void;
}

function getFileIcon(mime: string) {
  if (mime.startsWith("image/")) return <Image className="h-3.5 w-3.5 text-muted-foreground" />;
  if (mime === "application/pdf") return <FileText className="h-3.5 w-3.5 text-destructive/60" />;
  return <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function UploadTray({ files, onRemove }: UploadTrayProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex gap-1.5 flex-wrap px-2.5 pt-2.5 pb-1">
      <AnimatePresence>
        {files.map((f) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs max-w-[220px] transition-colors ${
              f.status === "error"
                ? "border-destructive/30 bg-destructive/5"
                : f.status === "uploading"
                ? "border-primary/20 bg-primary/5"
                : "border-border bg-muted/40"
            }`}
          >
            {f.status === "uploading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/60" />
            ) : f.status === "error" ? (
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            ) : (
              getFileIcon(f.mime)
            )}
            <span className="truncate flex-1 text-foreground/80">{f.name}</span>
            <span className="text-muted-foreground/60 shrink-0 text-[10px]">
              {formatFileSize(f.size)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 shrink-0 text-muted-foreground/40 hover:text-foreground rounded-sm"
              onClick={() => onRemove(f.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
