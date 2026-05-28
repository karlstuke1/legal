import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface LoadingSpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  fullPage?: boolean;
}

const sizeMap = {
  sm: "h-4 w-4 border-[1.5px]",
  md: "h-5 w-5 border-[1.5px]",
  lg: "h-7 w-7 border-2",
};

export function LoadingSpinner({ className, size = "md", fullPage = false }: LoadingSpinnerProps) {
  const spinner = (
    <div
      className={cn(
        "rounded-full animate-spin border-foreground/10 border-t-foreground/50",
        sizeMap[size],
        className
      )}
    />
  );

  if (fullPage) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex-1 flex items-center justify-center min-h-[240px]"
      >
        {spinner}
      </motion.div>
    );
  }

  return spinner;
}
