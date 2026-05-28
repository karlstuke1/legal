import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { motion } from "framer-motion";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  accent?: "emerald" | "rose" | "amber";
  description?: string;
}

const accentStyles = {
  emerald: {
    value: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/[0.06] dark:bg-emerald-500/[0.08]",
    icon: "text-emerald-600/60 dark:text-emerald-400/60",
  },
  rose: {
    value: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/[0.06] dark:bg-rose-500/[0.08]",
    icon: "text-rose-600/60 dark:text-rose-400/60",
  },
  amber: {
    value: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/[0.06] dark:bg-amber-500/[0.08]",
    icon: "text-amber-600/60 dark:text-amber-400/60",
  },
};

export function StatCard({ icon, label, value, accent, description }: StatCardProps) {
  const styles = accent ? accentStyles[accent] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "rounded-2xl p-5 card-elevated",
        styles?.bg || "bg-card/70"
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("text-muted-foreground/40", styles?.icon)}>
          {icon}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/50">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "text-[28px] font-bold tracking-tight leading-none",
          styles?.value || "text-foreground"
        )}
      >
        {value}
      </p>
      {description && (
        <p className="text-[11px] text-muted-foreground/40 mt-1.5">{description}</p>
      )}
    </motion.div>
  );
}
