import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  Scale, Search, FileText, PenTool, ListChecks, FolderOpen,
  GraduationCap, Check, Paperclip, Globe, ArrowRight, RefreshCw,
  MessageSquare,
} from "lucide-react";

const easeOut: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

export function ChatMockup() {
  const [phase, setPhase] = React.useState(0);
  const prefersReducedMotion = React.useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  React.useEffect(() => {
    if (prefersReducedMotion) { setPhase(5); return; }
    const timings = [1200, 2200, 1800, 3200, 1200, 3000];
    const timeout = setTimeout(() => {
      setPhase((p) => (p >= 5 ? 0 : p + 1));
    }, timings[phase]);
    return () => clearTimeout(timeout);
  }, [phase, prefersReducedMotion]);

  const userText = "Voraussetzungen des Betrugs nach § 146 öStGB?";
  const visibleUserText = phase >= 1 ? userText.slice(0, phase === 1 ? Math.floor(userText.length * 0.7) : userText.length) : "";

  const thinkingSteps = [
    { label: "RIS durchsuchen…", delay: 0 },
    { label: "OGH-Judikatur analysieren…", delay: 0.4 },
    { label: "Antwort generieren…", delay: 0.8 },
  ];

  const responseLines = [
    { bold: true, text: "§ 146 öStGB (Betrug)" },
    { bold: false, text: " setzt voraus: Täuschung über Tatsachen → Irrtum → Vermögensverfügung → Vermögensschaden, mit Bereicherungsvorsatz (§ 5 Abs 2 öStGB)." },
  ];

  const sources = ["§ 146 öStGB", "OGH 11 Os 2/22m", "RS0094010", "§ 5 Abs 2 öStGB"];

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-xl overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-background/60">
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-6 rounded-full bg-foreground/[0.04] flex items-center justify-center">
            <Scale className="h-3 w-3 text-foreground/35" />
          </div>
          <span className="text-[13px] font-medium text-foreground/60">Assistent</span>
        </div>
        <div className="flex items-center gap-1.5">
          <motion.div
            animate={{ opacity: phase >= 4 ? 1 : 0.3 }}
            className="h-6 px-2 rounded-md bg-muted/40 flex items-center"
          >
            <span className="text-[10px] text-muted-foreground/50">Export</span>
          </motion.div>
        </div>
      </div>

      {/* Messages */}
      <div className="p-5 space-y-4 min-h-[240px]">
        {/* Thinking steps */}
        <AnimatePresence>
          {phase >= 2 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-1.5 mb-3 overflow-hidden"
            >
              {thinkingSteps.map((step, i) => (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: step.delay, duration: 0.3 }}
                  className="flex items-center gap-2"
                >
                  {phase >= 3 && i < (phase >= 4 ? 3 : 2) ? (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400 }}>
                      <Check className="h-3 w-3 text-emerald-500" />
                    </motion.div>
                  ) : (
                    <RefreshCw className="h-3 w-3 text-muted-foreground/40 animate-spin" />
                  )}
                  <span className={`text-[11px] ${phase >= 3 && i < 2 ? "text-muted-foreground/40" : "text-foreground/60"}`}>
                    {step.label}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* User message */}
        <AnimatePresence>
          {phase >= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.35, ease: easeOut }}
              className="flex justify-end"
            >
              <div className="bg-foreground text-background rounded-2xl rounded-br-md px-4 py-2.5 max-w-[75%]">
                <p className="text-[13px] leading-relaxed">
                  {phase === 1 ? (
                    <>
                      {visibleUserText}
                      <motion.span
                        animate={{ opacity: [1, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity }}
                        className="inline-block w-[2px] h-[14px] bg-background/60 ml-0.5 align-text-bottom"
                      />
                    </>
                  ) : (
                    userText
                  )}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI response */}
        <AnimatePresence>
          {phase >= 3 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: easeOut }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="h-5 w-5 rounded-lg bg-foreground flex items-center justify-center">
                  <span className="text-[8px] font-bold text-background">L</span>
                </div>
                <AnimatePresence>
                  {phase >= 4 && (
                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 300 }}>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-emerald-500/10 text-emerald-600 border-0">
                        Hohe Konfidenz
                      </Badge>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="text-[13px] leading-relaxed text-foreground/80 space-y-2">
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
                  <strong>{responseLines[0].text}</strong>
                  {phase >= 3 && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.6 }}>
                      {responseLines[1].text}
                    </motion.span>
                  )}
                </motion.p>
                {phase >= 4 && (
                  <motion.p
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="text-foreground/60"
                  >
                    Die Täuschung kann ausdrücklich, durch Entstellen oder durch{" "}
                    <span className="text-foreground/80 font-medium">konkludentes Verhalten</span> erfolgen…
                  </motion.p>
                )}
              </div>

              {phase >= 4 && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {sources.map((s, i) => (
                    <motion.span
                      key={s}
                      initial={{ opacity: 0, scale: 0.85, y: 4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.12, duration: 0.3, ease: easeOut }}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-border/40 text-muted-foreground/50 bg-muted/20"
                    >
                      {s}
                    </motion.span>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Idle state */}
        {phase === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center h-32">
            <div className="flex items-center gap-2 text-muted-foreground/30">
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                <Scale className="h-5 w-5" />
              </motion.div>
              <span className="text-[13px]">Bereit für Ihre Frage…</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Composer mockup */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-1 mb-2 px-1">
          {[
            { icon: Search, label: "Research", active: true },
            { icon: FileText, label: "Prüfung", active: false },
            { icon: PenTool, label: "Entwurf", active: false },
            
            { icon: FolderOpen, label: "Akten", active: false },
            { icon: GraduationCap, label: "Exam", active: false },
          ].map((m) => (
            <div
              key={m.label}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium ${
                m.active ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground/30"
              }`}
            >
              <m.icon className="h-3 w-3" />
              <span className="hidden sm:inline">{m.label}</span>
            </div>
          ))}
        </div>

        <div className="rounded-[20px] border border-border/40 bg-card/60 px-4 py-3">
          <p className="text-[13px] text-muted-foreground/30 mb-3">Rechtsfrage stellen…</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="h-7 w-7 rounded-lg border border-border/30 flex items-center justify-center">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground/30" />
              </div>
              <div className="h-7 px-2 rounded-lg border border-border/30 flex items-center gap-1">
                <Globe className="h-3 w-3 text-muted-foreground/30" />
                <span className="text-[10px] text-muted-foreground/40">🇦🇹🇩🇪🇨🇭🇪🇺</span>
              </div>
            </div>
            <motion.div
              animate={{
                scale: phase === 1 ? [1, 1.1, 1] : 1,
              }}
              transition={{ duration: 0.3 }}
              className="h-8 w-8 rounded-xl bg-foreground flex items-center justify-center"
            >
              <ArrowRight className="h-3.5 w-3.5 text-background" />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
