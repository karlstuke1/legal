import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { fetchQuota, type WorkspaceQuota } from "@/lib/quota-api";
import { AlertTriangle, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

const WARN_THRESHOLD = 0.8; // 80%
const CRITICAL_THRESHOLD = 0.95; // 95%

export function QuotaWarning() {
  const { activeWorkspace } = useWorkspace();
  const [quota, setQuota] = useState<WorkspaceQuota | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (!activeWorkspace) return;
    
    // Check sessionStorage for dismissed state
    const dismissedKey = `quota-warning-dismissed-${activeWorkspace.id}`;
    const dismissedAt = sessionStorage.getItem(dismissedKey);
    if (dismissedAt) {
      const hourAgo = Date.now() - 60 * 60 * 1000;
      if (parseInt(dismissedAt) > hourAgo) {
        setDismissed(dismissedAt);
        return;
      }
    }

    fetchQuota(activeWorkspace.id).then(setQuota);
  }, [activeWorkspace?.id]);

  if (!quota || dismissed) return null;

  const warnings: { type: string; label: string; used: number; limit: number; percent: number }[] = [];

  const checkQuota = (type: string, label: string, used: number, limit: number) => {
    if (limit >= 999999) return; // Unlimited
    const percent = used / limit;
    if (percent >= WARN_THRESHOLD) {
      warnings.push({ type, label, used, limit, percent });
    }
  };

  checkQuota("queries", "Anfragen", quota.queriesUsed, quota.queriesLimit);
  checkQuota("uploads", "Uploads", quota.uploadsUsed, quota.uploadsLimit);
  

  if (warnings.length === 0) return null;

  const maxWarning = warnings.reduce((a, b) => (a.percent > b.percent ? a : b));
  const isCritical = maxWarning.percent >= CRITICAL_THRESHOLD;

  const handleDismiss = () => {
    if (!activeWorkspace) return;
    const key = `quota-warning-dismissed-${activeWorkspace.id}`;
    const now = Date.now().toString();
    sessionStorage.setItem(key, now);
    setDismissed(now);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className={`relative px-4 py-2.5 text-sm flex items-center justify-between gap-4 ${
          isCritical
            ? "bg-destructive/10 text-destructive border-b border-destructive/20"
            : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-b border-amber-500/20"
        }`}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {isCritical ? (
              <>
                <strong>Limit fast erreicht:</strong>{" "}
                {warnings.map((w) => `${w.label} (${w.used}/${w.limit})`).join(", ")}
              </>
            ) : (
              <>
                <strong>{Math.round(maxWarning.percent * 100)}% genutzt:</strong>{" "}
                {warnings.map((w) => `${w.label} (${w.used}/${w.limit})`).join(", ")}
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            asChild
          >
            <Link to="/settings?tab=billing">
              Upgraden
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-60 hover:opacity-100"
            onClick={handleDismiss}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
