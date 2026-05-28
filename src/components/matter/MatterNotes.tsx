import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, StickyNote, Loader2 } from "lucide-react";
import { type MatterNote, addMatterNote, deleteMatterNote } from "@/lib/matters-api";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface MatterNotesProps {
  notes: MatterNote[];
  matterId: string;
  workspaceId: string;
  userId: string;
  onNotesChange: (notes: MatterNote[]) => void;
}

export default function MatterNotes({ notes, matterId, workspaceId, userId, onNotesChange }: MatterNotesProps) {
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleAdd = async () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      const note = await addMatterNote(matterId, workspaceId, trimmed, userId);
      if (note) {
        onNotesChange([note, ...notes]);
        setNewContent("");
        setShowForm(false);
      } else {
        toast({ title: "Fehler beim Speichern", variant: "destructive" });
      }
    } catch (error) {
      console.error("Add note failed:", error);
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      const ok = await deleteMatterNote(noteId);
      if (ok) {
        onNotesChange(notes.filter((n) => n.id !== noteId));
      }
    } catch (error) {
      console.error("Delete note failed:", error);
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-foreground/80 flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-muted-foreground/40" />
          Notizen
          <span className="text-muted-foreground/40 font-normal">({notes.length})</span>
        </h2>
        {!showForm && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-[12px] text-muted-foreground/50 hover:text-foreground gap-1.5 rounded-lg"
            onClick={() => setShowForm(true)}
          >
            <Plus className="h-3 w-3" />
            Notiz
          </Button>
        )}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-border/30 bg-background p-4 space-y-3">
              <Textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Notiz schreiben…"
                className="min-h-[80px] text-[13px] resize-none rounded-xl border-border/30 bg-transparent focus-visible:ring-1 focus-visible:ring-primary/20"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[12px] rounded-lg"
                  onClick={() => { setShowForm(false); setNewContent(""); }}
                >
                  Abbrechen
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-[12px] rounded-lg px-4"
                  onClick={handleAdd}
                  disabled={!newContent.trim() || adding}
                >
                  {adding && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                  Speichern
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {notes.length === 0 && !showForm ? (
        <div className="py-6 text-center">
          <StickyNote className="h-8 w-8 text-muted-foreground/15 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground/40">Noch keine Notizen</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <motion.div
              key={note.id}
              layout
              className="rounded-xl border border-border/20 bg-background/50 p-4 group hover:border-border/40 transition-colors"
            >
              <p className="text-[13px] text-foreground/80 whitespace-pre-wrap leading-relaxed">{note.content}</p>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/10">
                <span className="text-[11px] text-muted-foreground/40">
                  {new Date(note.created_at).toLocaleDateString("de-DE", {
                    day: "numeric", month: "short", year: "numeric"
                  })} · {new Date(note.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {note.created_by === userId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all rounded-md"
                    onClick={() => handleDelete(note.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}