import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  children?: ReactNode;
}

export function PageHeader({ title, description, badge, children }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex items-start justify-between gap-4"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-bold tracking-tight text-foreground">{title}</h1>
          {badge && (
            <Badge
              variant="outline"
              className="text-[9px] font-semibold uppercase tracking-[0.06em] shrink-0 border-foreground/10 text-muted-foreground/60 px-2 py-0.5"
            >
              {badge}
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-[14px] text-muted-foreground/45 mt-1.5 leading-relaxed max-w-lg">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </motion.div>
  );
}
