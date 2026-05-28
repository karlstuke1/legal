import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col items-center justify-center py-20 gap-4"
    >
      <div className="h-14 w-14 rounded-2xl bg-foreground/[0.03] border border-border/30 flex items-center justify-center">
        <Icon className="h-6 w-6 text-foreground/15" strokeWidth={1.5} />
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-[14px] font-medium text-muted-foreground/50">{title}</p>
        {description && (
          <p className="text-[13px] text-muted-foreground/30 max-w-xs leading-relaxed">{description}</p>
        )}
      </div>
      {action && (
        <Button
          variant="outline"
          size="sm"
          onClick={action.onClick}
          className="mt-1 h-9 rounded-xl text-[13px] border-border/40 hover:border-border/60 shadow-none"
        >
          {action.label}
        </Button>
      )}
    </motion.div>
  );
}
