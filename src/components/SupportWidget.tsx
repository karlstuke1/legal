import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LifeBuoy, Bug, RotateCcw, X, Send } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface SupportWidgetProps {
  onStartTour: () => void;
}

export function SupportWidget({ onStartTour }: SupportWidgetProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "bug">("menu");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const location = useLocation();
  const isMobile = useIsMobile();
  const avoidComposer = isMobile && location.pathname.startsWith("/app/chat");

  if (avoidComposer) return null;

  const handleSubmitBug = async () => {
    if (!subject.trim() || !description.trim() || !user) return;
    setSending(true);
    try {
      const { error } = await supabase.from("support_tickets").insert({
        user_id: user.id,
        workspace_id: activeWorkspace?.id || null,
        type: "bug",
        subject: subject.trim(),
        description: description.trim(),
      });
      if (error) throw error;

      // Also try to send email notification via edge function
      try {
        await supabase.functions.invoke("support-notify", {
          body: { subject: subject.trim(), description: description.trim(), userId: user.id },
        });
      } catch {
        // email notification is best-effort
      }

      toast({ title: "Gesendet", description: "Deine Nachricht wurde übermittelt. Danke!" });
      setSubject("");
      setDescription("");
      setView("menu");
      setOpen(false);
    } catch (err) {
      toast({ title: "Fehler", description: "Konnte nicht gesendet werden.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed right-4 z-[100] sm:right-5",
        "bottom-[calc(env(safe-area-inset-bottom)+1rem)] sm:bottom-5",
      )}
      data-tour="support-widget"
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-14 right-0 w-[calc(100vw-2rem)] max-w-[320px] bg-card border border-border/40 rounded-2xl shadow-xl overflow-hidden"
          >
            {view === "menu" && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[14px] font-semibold text-foreground">Hilfe & Support</h3>
                  <button onClick={() => setOpen(false)} className="text-muted-foreground/40 hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <button
                    onClick={() => setView("bug")}
                    className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-accent/60 transition-colors text-left"
                  >
                    <div className="h-9 w-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                      <Bug className="h-4 w-4 text-destructive" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-foreground">Bug melden</p>
                      <p className="text-[11px] text-muted-foreground">Problem oder Fehler beschreiben</p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setOpen(false);
                      onStartTour();
                    }}
                    className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-accent/60 transition-colors text-left"
                  >
                    <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <RotateCcw className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-foreground">Tutorial starten</p>
                      <p className="text-[11px] text-muted-foreground">Geführte Tour erneut ansehen</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {view === "bug" && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setView("menu")}
                    className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ← Zurück
                  </button>
                  <button onClick={() => { setView("menu"); setOpen(false); }} className="text-muted-foreground/40 hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <h3 className="text-[14px] font-semibold text-foreground mb-3">Bug melden</h3>
                <div className="space-y-3">
                  <Input
                    placeholder="Betreff"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="text-[13px] h-9"
                    maxLength={200}
                  />
                  <Textarea
                    placeholder="Beschreibe das Problem…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="text-[13px] min-h-[100px] resize-none"
                    maxLength={2000}
                  />
                  <Button
                    onClick={handleSubmitBug}
                    disabled={!subject.trim() || !description.trim() || sending}
                    className="w-full h-9 text-[13px] gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sending ? "Wird gesendet…" : "Absenden"}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => { setOpen(!open); setView("menu"); }}
        className="h-11 w-11 sm:h-12 sm:w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:shadow-xl transition-shadow"
      >
        <LifeBuoy className="h-5 w-5" />
      </motion.button>
    </div>
  );
}
