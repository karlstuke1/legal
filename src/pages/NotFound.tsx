import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Scale, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="text-center space-y-6"
      >
        <div className="mx-auto h-16 w-16 rounded-2xl bg-foreground/[0.03] border border-border/30 flex items-center justify-center">
          <Scale className="h-7 w-7 text-foreground/15" strokeWidth={1.5} />
        </div>
        <div className="space-y-2">
          <h1 className="text-[40px] font-bold tracking-tight text-foreground">404</h1>
          <p className="text-[14px] text-muted-foreground/45 max-w-xs mx-auto leading-relaxed">
            Die angeforderte Seite existiert nicht oder wurde verschoben.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate("/")}
          className="h-10 rounded-xl text-[13px] font-medium border-border/40 hover:border-border/60 gap-2 shadow-none"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Zur Startseite
        </Button>
      </motion.div>
    </div>
  );
}
