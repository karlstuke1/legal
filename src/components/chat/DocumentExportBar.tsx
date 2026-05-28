import { FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOCUMENT_TYPE_LABELS, type DocumentDetection } from "@/lib/document-detector";

interface DocumentExportBarProps {
  detection: DocumentDetection;
  onOpenEditor: () => void;
}

export function DocumentExportBar({ detection, onOpenEditor }: DocumentExportBarProps) {
  if (!detection.isDocument) return null;

  return (
    <div className="mt-3 flex items-center gap-3 px-4 py-3 rounded-xl border border-border/40 bg-card/50">
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <FileText className="h-4 w-4 text-primary/70" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground/80 truncate">
          {detection.title}
        </p>
        <p className="text-[11px] text-muted-foreground/50">
          {DOCUMENT_TYPE_LABELS[detection.documentType]} erkannt
        </p>
      </div>
      <Button
        variant="default"
        size="sm"
        className="h-8 px-3.5 text-[12px] gap-1.5 rounded-lg"
        onClick={onOpenEditor}
      >
        <Pencil className="h-3.5 w-3.5" />
        Bearbeiten & Exportieren
      </Button>
    </div>
  );
}
