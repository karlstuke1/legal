import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg";
}

const maxWidthMap = {
  sm: "max-w-2xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
};

export function PageContainer({ children, className, maxWidth = "md" }: PageContainerProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className={cn(
        "mx-auto px-5 sm:px-8 py-8 sm:py-12 space-y-8",
        maxWidthMap[maxWidth],
        className
      )}>
        {children}
      </div>
    </div>
  );
}
