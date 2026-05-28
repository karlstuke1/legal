import React from "react";
import { ShieldCheck, Shield, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";
import type { CitationAnalysis } from "@/lib/citation-engine";

export function ConfidenceBadge({ analysis }: { analysis: CitationAnalysis }) {
  const { confidence } = analysis;

  const colorClass = confidence.level === "high"
    ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/20"
    : confidence.level === "medium"
    ? "text-amber-600 bg-amber-500/10 border-amber-500/20"
    : "text-rose-600 bg-rose-500/10 border-rose-500/20";

  const IconComp = confidence.level === "high" ? ShieldCheck : confidence.level === "medium" ? Shield : ShieldAlert;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.25 }}
      className="mt-3"
    >
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium ${colorClass}`}
      >
        <IconComp className="h-3 w-3" />
        <span>{confidence.score}%</span>
        <span className="opacity-60">— {confidence.label}</span>
      </div>
    </motion.div>
  );
}
