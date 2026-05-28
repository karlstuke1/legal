import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { fadeUp } from "./shared";

export function CtaSection() {
  const navigate = useNavigate();
  return (
    <section className="border-t border-border/20 bg-card/30">
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <motion.div {...fadeUp}>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Bereit, Ihre Recherche zu transformieren?</h2>
          <p className="text-muted-foreground/50 text-lg mb-8 max-w-md mx-auto">Erstellen Sie Ihren kostenlosen Account und starten Sie in weniger als 60 Sekunden.</p>
          <Button size="lg" className="text-[14px] rounded-xl px-8 h-12 shadow-lg" onClick={() => navigate("/auth")}>
            Kostenlosen Account erstellen <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

export function FooterSection() {
  return (
    <footer className="border-t border-border/30">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background text-[10px] font-bold" aria-hidden="true">L</div>
            <span className="text-[13px] font-semibold tracking-tight text-foreground/70">Legal AI</span>
            <span className="sr-only">Legal AI – Juristischer KI-Assistent</span>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            <a href="/datenschutz" className="text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors">Datenschutz</a>
            <a href="/impressum" className="text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors">Impressum</a>
            <a href="/pricing" className="text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors">Preise</a>
            <a href="/blog" className="text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors">Blog</a>
            <a href="#partner" className="text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors">Partner</a>
            <a href="mailto:kontakt@legal-ai.de" className="text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors">Kontakt</a>
          </div>
          <p className="text-[11px] text-muted-foreground/25">© 2026 Legal AI. Alle Rechte vorbehalten.</p>
        </div>
      </div>
    </footer>
  );
}
