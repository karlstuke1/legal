import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";

export const easeOut: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

export const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: easeOut },
};

export const stagger = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
};

export function FeatureCard({
  icon: Icon,
  title,
  description,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <motion.div {...stagger} className="rounded-2xl p-6 card-elevated bg-card/70 relative">
      {badge && <Badge className="absolute top-4 right-4 text-[9px] h-5">{badge}</Badge>}
      <div className="h-10 w-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center mb-4" aria-hidden="true">
        <Icon className="h-5 w-5 text-foreground/50" aria-hidden="true" />
      </div>
      <h3 className="text-[15px] font-semibold mb-1.5">{title}</h3>
      <p className="text-[13px] text-muted-foreground/60 leading-relaxed">{description}</p>
    </motion.div>
  );
}

export function SourcePill({ flag, name, count }: { flag: string; name: string; count?: string }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border/40 bg-card/60">
      <span className="text-sm">{flag}</span>
      <span className="text-[12px] font-medium text-foreground/70">{name}</span>
      {count && <span className="text-[10px] text-muted-foreground/40 ml-auto">{count}</span>}
    </div>
  );
}
