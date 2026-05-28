import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FileText, Globe, CheckCircle2, Scale, Loader2 } from "lucide-react";

export interface ThinkingStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
  description?: string;
  pills?: { label: string; icon?: "search" | "file" | "web" | "law" }[];
}

interface ThinkingStepsProps {
  steps: ThinkingStep[];
  isVisible: boolean;
}

const pillIcons = {
  search: Search,
  file: FileText,
  web: Globe,
  law: Scale,
};

/* Elapsed timer hook */
function useElapsed(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(Date.now());

  useEffect(() => {
    if (!active) { setElapsed(0); start.current = Date.now(); return; }
    start.current = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - start.current) / 1000), 100);
    return () => clearInterval(id);
  }, [active]);

  return elapsed;
}

function StepIndicator({ status }: { status: ThinkingStep["status"] }) {
  if (status === "done") {
    return (
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
        className="h-5 w-5 flex items-center justify-center"
      >
        <CheckCircle2 className="h-4 w-4 text-foreground/50" />
      </motion.div>
    );
  }

  if (status === "active") {
    return (
      <div className="h-5 w-5 flex items-center justify-center">
        <div className="relative">
          <Loader2 className="h-4 w-4 text-foreground/70 animate-spin" />
          <div className="absolute inset-0 rounded-full bg-foreground/5 animate-pulse scale-150" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-5 w-5 flex items-center justify-center">
      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20" />
    </div>
  );
}

function ActiveTimer() {
  const elapsed = useElapsed(true);
  return (
    <span className="text-[11px] tabular-nums text-muted-foreground/60 ml-2">
      {elapsed.toFixed(1)}s
    </span>
  );
}

export function ThinkingSteps({ steps, isVisible }: ThinkingStepsProps) {
  if (!isVisible || steps.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="py-6"
    >
      <div className="space-y-1 pl-0.5">
        {steps.map((step, index) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.06, ease: "easeOut" }}
          >
            <div
              className={`flex items-start gap-3 py-2 px-2.5 rounded-xl transition-colors duration-300 ${
                step.status === "active" ? "bg-muted/30" : ""
              }`}
            >
              <div className="mt-0.5 flex-shrink-0">
                <StepIndicator status={step.status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center">
                  <p
                    className={`text-[14px] leading-relaxed transition-colors duration-300 ${
                      step.status === "active"
                        ? "text-foreground font-medium"
                        : step.status === "done"
                        ? "text-muted-foreground"
                        : "text-muted-foreground/40"
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.status === "active" && <ActiveTimer />}
                </div>

                {/* Description */}
                {step.description && step.status !== "pending" && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.25 }}
                    className="text-[13px] text-muted-foreground/70 leading-relaxed mt-1.5 border-l-2 border-border/50 pl-3.5"
                  >
                    {step.description}
                  </motion.p>
                )}

                {/* Pills */}
                {step.pills && step.pills.length > 0 && step.status !== "pending" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35, delay: 0.1 }}
                    className="flex flex-wrap gap-2 mt-2.5"
                  >
                    {step.pills.map((pill, pi) => {
                      const Icon = pill.icon ? pillIcons[pill.icon] : Search;
                      return (
                        <motion.span
                          key={pi}
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.25, delay: pi * 0.04 }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-card/80 backdrop-blur-sm px-3 py-1.5 text-[12px] text-muted-foreground shadow-sm"
                        >
                          <Icon className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                          {pill.label}
                        </motion.span>
                      );
                    })}
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
