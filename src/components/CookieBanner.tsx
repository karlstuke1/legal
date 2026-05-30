import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem("cookie_consent");
    if (!accepted) {
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    localStorage.setItem("cookie_consent", "accepted");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg"
        >
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium">Datenschutzhinweis</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Diese Anwendung verwendet ausschließlich funktionale Cookies für die Authentifizierung. 
                  Es werden keine Tracking-Cookies eingesetzt.{" "}
                  <Link to="/datenschutz" className="text-primary hover:underline">
                    Datenschutzerklärung
                  </Link>
                </p>
              </div>
              <button onClick={accept} aria-label="Schließen" className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground/55 hover:bg-muted/50 hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={accept} size="sm" className="h-8 text-xs rounded-lg">
                Verstanden
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
