import { useState, useMemo, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, Copy, Plus, Trash2, Search, Replace, Eye, EyeOff,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import {
  detectEntities, applyReplacements, CATEGORY_META,
  type DetectedEntity,
} from "@/lib/pseudonymize-client";

interface PseudonymizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  fileName: string;
}

export default function PseudonymizeDialog({
  open, onOpenChange, text, fileName,
}: PseudonymizeDialogProps) {
  const autoDetected = useMemo(() => detectEntities(text), [text]);
  const [entities, setEntities] = useState<DetectedEntity[]>(autoDetected);
  const [manualFind, setManualFind] = useState("");
  const [manualReplace, setManualReplace] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  // Reset when text changes
  useState(() => {
    setEntities(autoDetected);
  });

  const pseudonymizedText = useMemo(
    () => applyReplacements(text, entities),
    [text, entities]
  );

  const handleToggleEntity = useCallback((index: number) => {
    setEntities(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateReplacement = useCallback((index: number, newReplacement: string) => {
    setEntities(prev => prev.map((e, i) => i === index ? { ...e, replacement: newReplacement } : e));
  }, []);

  const handleAddManual = useCallback(() => {
    if (!manualFind.trim()) return;
    const replacement = manualReplace.trim() || `[MANUELL_${entities.length + 1}]`;

    // Find all occurrences
    const newEntities: DetectedEntity[] = [];
    let idx = 0;
    while (true) {
      const pos = text.indexOf(manualFind, idx);
      if (pos === -1) break;
      // Check overlap with existing
      const overlaps = entities.some(e =>
        (pos < e.end && pos + manualFind.length > e.start)
      );
      if (!overlaps) {
        newEntities.push({
          original: manualFind,
          replacement,
          category: "manual",
          start: pos,
          end: pos + manualFind.length,
        });
      }
      idx = pos + 1;
    }

    if (newEntities.length === 0) {
      toast({ title: "Nicht gefunden", description: `"${manualFind}" wurde im Text nicht gefunden.`, variant: "destructive" });
      return;
    }

    setEntities(prev => [...prev, ...newEntities].sort((a, b) => a.start - b.start));
    setManualFind("");
    setManualReplace("");
    toast({ title: `${newEntities.length}× ersetzt` });
  }, [manualFind, manualReplace, text, entities]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(pseudonymizedText);
    toast({ title: "Pseudonymisierter Text kopiert" });
  }, [pseudonymizedText]);

  const categoryCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entities) {
      counts[e.category] = (counts[e.category] || 0) + 1;
    }
    return counts;
  }, [entities]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            Pseudonymisierung — {fileName}
          </DialogTitle>
          <p className="text-[12px] text-muted-foreground/60 mt-1 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            Alles läuft lokal im Browser — keine Daten verlassen dein Gerät.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Auto-detected summary */}
          <section>
            <h3 className="text-[13px] font-semibold text-foreground/80 mb-2.5 flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground/50" />
              Automatisch erkannt
              <span className="text-muted-foreground/40 font-normal">({entities.length})</span>
            </h3>

            {entities.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground/50 py-3">
                Keine Muster erkannt. Nutze die manuelle Suche unten.
              </p>
            ) : (
              <>
                {/* Category badges */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {Object.entries(categoryCount).map(([cat, count]) => {
                    const meta = CATEGORY_META[cat];
                    return (
                      <Badge key={cat} variant="outline" className="text-[11px] gap-1 rounded-lg">
                        {meta?.label || cat}: {count}
                      </Badge>
                    );
                  })}
                </div>

                {/* Entity list */}
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  <AnimatePresence>
                    {entities.map((entity, i) => (
                      <motion.div
                        key={`${entity.start}-${entity.original}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-border/20 text-[12px]"
                      >
                        <Badge variant="outline" className="text-[10px] shrink-0 rounded">
                          {CATEGORY_META[entity.category]?.label || entity.category}
                        </Badge>
                        <span className="text-muted-foreground/60 line-through truncate shrink min-w-0">
                          {entity.original}
                        </span>
                        <span className="text-foreground/40">→</span>
                        <Input
                          value={entity.replacement}
                          onChange={(e) => handleUpdateReplacement(i, e.target.value)}
                          className="h-7 text-[11px] rounded-md w-32 shrink-0"
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 rounded"
                          onClick={() => handleToggleEntity(i)}>
                          <Trash2 className="h-3 w-3 text-muted-foreground/40" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </>
            )}
          </section>

          {/* Manual find & replace */}
          <section className="rounded-xl border border-border/30 bg-card/30 p-4">
            <h3 className="text-[13px] font-semibold text-foreground/80 mb-3 flex items-center gap-2">
              <Replace className="h-3.5 w-3.5 text-muted-foreground/50" />
              Manuell ersetzen
            </h3>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-muted-foreground/50">Suchen</label>
                <Input
                  value={manualFind}
                  onChange={(e) => setManualFind(e.target.value)}
                  placeholder="z.B. Max Mustermann"
                  className="h-9 text-[13px] rounded-lg"
                  onKeyDown={(e) => e.key === "Enter" && handleAddManual()}
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-muted-foreground/50">Ersetzen durch</label>
                <Input
                  value={manualReplace}
                  onChange={(e) => setManualReplace(e.target.value)}
                  placeholder="z.B. [MANDANT_1]"
                  className="h-9 text-[13px] rounded-lg"
                  onKeyDown={(e) => e.key === "Enter" && handleAddManual()}
                />
              </div>
              <Button onClick={handleAddManual} size="sm" className="h-9 rounded-lg gap-1.5 shrink-0">
                <Plus className="h-3.5 w-3.5" />Hinzufügen
              </Button>
            </div>
          </section>

          {/* Preview toggle */}
          <section>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className="rounded-lg gap-1.5 text-[12px] mb-3"
            >
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPreview ? "Vorschau ausblenden" : "Vorschau anzeigen"}
            </Button>

            <AnimatePresence>
              {showPreview && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Textarea
                    readOnly
                    value={pseudonymizedText}
                    className="text-[12px] min-h-[200px] max-h-[300px] rounded-xl bg-muted/20 leading-relaxed font-mono"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-border/20 pt-4 mt-2">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600/70">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {entities.length} Ersetzungen · Rein lokal
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-lg text-[12px]"
              onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button size="sm" className="rounded-lg gap-1.5 text-[12px]" onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5" />
              Text kopieren
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
