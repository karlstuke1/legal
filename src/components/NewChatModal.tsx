import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FolderOpen, Scale, FileText, BookOpen, Briefcase, GraduationCap } from "lucide-react";
import type { Matter } from "@/lib/matters-api";
import type { ChatMode, Jurisdiction, SourceProvider } from "@/lib/types";
import { MODE_LABELS, JURISDICTION_LABELS, JURISDICTION_FLAGS } from "@/lib/types";

interface NewChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matters: Matter[];
  onCreateMatter: (name: string) => Promise<Matter | null>;
  onStart: (opts: {
    matterId: string | null;
    mode: ChatMode;
    jurisdiction: Jurisdiction[];
    sources: SourceProvider[];
  }) => void;
}

const modeIcons: Record<ChatMode, typeof Scale> = {
  research: Scale,
  document_review: FileText,
  draft: BookOpen,
  vault: FolderOpen,
  exam: GraduationCap,
};

export function NewChatModal({ open, onOpenChange, matters, onCreateMatter, onStart }: NewChatModalProps) {
  const [matterId, setMatterId] = useState<string>("none");
  const [mode, setMode] = useState<ChatMode>("research");
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction[]>(["AT"]);
  const [newMatterName, setNewMatterName] = useState("");
  const [showNewMatter, setShowNewMatter] = useState(false);
  const [creating, setCreating] = useState(false);

  const toggleJurisdiction = (j: Jurisdiction) => {
    setJurisdiction(prev => {
      const next = prev.includes(j) ? prev.filter(x => x !== j) : [...prev, j];
      return next.length === 0 ? [j] : next;
    });
  };

  const handleCreateMatter = async () => {
    if (!newMatterName.trim()) return;
    setCreating(true);
    const m = await onCreateMatter(newMatterName.trim());
    if (m) {
      setMatterId(m.id);
      setNewMatterName("");
      setShowNewMatter(false);
    }
    setCreating(false);
  };

  const handleStart = () => {
    onStart({
      matterId: matterId === "none" ? null : matterId,
      mode,
      jurisdiction,
      sources: ["AUTO"],
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] rounded-2xl border-border/40 bg-card/95 backdrop-blur-xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-[17px] font-semibold tracking-tight">Neue Recherche</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5">
          {/* Matter selection */}
          <div className="space-y-2">
            <Label className="text-[13px] text-muted-foreground/70">Mandantenakte</Label>
            {!showNewMatter ? (
              <div className="flex gap-2">
                <Select value={matterId} onValueChange={setMatterId}>
                  <SelectTrigger className="flex-1 h-10 rounded-xl border-border/40 bg-muted/20 text-[14px]">
                    <SelectValue placeholder="Keine Akte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-[13px]">Ohne Akte</SelectItem>
                    {matters.map(m => (
                      <SelectItem key={m.id} value={m.id} className="text-[13px]">
                        <span className="flex items-center gap-2">
                          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground/50" />
                          {m.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-xl border-border/40 shrink-0"
                  onClick={() => setShowNewMatter(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={newMatterName}
                  onChange={e => setNewMatterName(e.target.value)}
                  placeholder="z.B. Müller GmbH / Kündigungsschutz"
                  className="flex-1 h-10 rounded-xl border-border/40 bg-muted/20 text-[14px]"
                  onKeyDown={e => e.key === "Enter" && handleCreateMatter()}
                  autoFocus
                />
                <Button
                  onClick={handleCreateMatter}
                  disabled={!newMatterName.trim() || creating}
                  className="h-10 rounded-xl px-4 text-[13px]"
                >
                  {creating ? "…" : "Anlegen"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 px-2 text-muted-foreground/50"
                  onClick={() => { setShowNewMatter(false); setNewMatterName(""); }}
                >
                  ✕
                </Button>
              </div>
            )}
          </div>

          {/* Mode selection */}
          <div className="space-y-2">
            <Label className="text-[13px] text-muted-foreground/70">Modus</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(MODE_LABELS) as [ChatMode, string][]).map(([key, label]) => {
                const Icon = modeIcons[key];
                const active = mode === key;
                return (
                  <button
                    key={key}
                    onClick={() => setMode(key)}
                    className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] transition-all duration-200 ${
                      active
                        ? "border-foreground/20 bg-foreground/[0.04] text-foreground font-medium"
                        : "border-border/30 text-muted-foreground/60 hover:border-border/50 hover:text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-50" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Jurisdiction */}
          <div className="space-y-2">
            <Label className="text-[13px] text-muted-foreground/70">Jurisdiktion</Label>
            <div className="flex gap-2">
              {(Object.entries(JURISDICTION_LABELS) as [Jurisdiction, string][]).map(([key, label]) => {
                const active = jurisdiction.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleJurisdiction(key)}
                    className={`flex-1 rounded-xl border py-2 text-[13px] font-medium transition-all duration-200 ${
                      active
                        ? "border-foreground/20 bg-foreground/[0.04] text-foreground"
                        : "border-border/30 text-muted-foreground/50 hover:border-border/50 hover:text-muted-foreground"
                    }`}
                  >
                    {JURISDICTION_FLAGS[key]} {key}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Start button */}
          <Button
            onClick={handleStart}
            className="w-full h-11 rounded-xl text-[14px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-all duration-200"
          >
            Recherche starten
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
