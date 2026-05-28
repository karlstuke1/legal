import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { easeOut } from "./shared";
import { ChatMockup } from "./ChatMockup";

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <>
      <section className="mx-auto max-w-6xl px-6 pt-24 pb-20 md:pt-32 md:pb-28">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: easeOut }}
          className="text-center max-w-3xl mx-auto"
        >
          <Badge variant="secondary" className="mb-6 text-[11px] px-3 py-1 rounded-full border-border/40">
            Jetzt in der Beta — kostenlos testen
          </Badge>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.08] mb-5">
            KI für Anwälte.{" "}
            <span className="text-muted-foreground/40">Rechtsrecherche neu gedacht.</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground/60 max-w-2xl mx-auto leading-relaxed mb-8">
            Der juristische KI-Assistent mit autonomer Recherche in österreichischen Rechtsdatenbanken. 
            Vertragsprüfung. Dokumentenerstellung. Quellenverifiziert. DSGVO-konform.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button size="lg" className="text-[14px] rounded-xl px-7 h-12 shadow-lg" onClick={() => navigate("/auth")}>
              Kostenlos starten <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
            <Button variant="outline" size="lg" className="text-[14px] rounded-xl px-7 h-12" onClick={() => navigate("/pricing")}>
              Preise ansehen
            </Button>
          </div>
        </motion.div>
      </section>

      <section id="preview" className="mx-auto max-w-4xl px-6 pb-24" aria-label="Produktvorschau">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: easeOut }}
          role="img"
          aria-label="Animierte Demo des Legal AI Chat-Assistenten"
        >
          <ChatMockup />
        </motion.div>
      </section>
    </>
  );
}
