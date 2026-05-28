import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Gift, Users, Euro, Handshake, ShieldCheck, Zap } from "lucide-react";
import { fadeUp, stagger } from "./shared";

export function PartnerSection() {
  const navigate = useNavigate();

  return (
    <section id="partner" className="border-t border-border/20 bg-gradient-to-b from-background to-card/30" aria-labelledby="partner-heading">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <motion.div {...fadeUp} className="text-center mb-14">
          <Badge variant="outline" className="mb-4 text-[11px] border-primary/20 text-primary/70">
            <Gift className="h-3 w-3 mr-1" /> Partnerprogramm
          </Badge>
          <h2 id="partner-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Empfehlen & verdienen</h2>
          <p className="text-muted-foreground/50 text-lg max-w-lg mx-auto">
            Werden Sie Partner und erhalten Sie <span className="text-foreground font-semibold">20 % Provision</span> auf jedes vermittelte Abonnement — dauerhaft, solange Ihr Kontakt aktiv bleibt.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-3 gap-6 mb-14">
          {[
            { step: "01", icon: Gift, title: "Link teilen", description: "Registrieren Sie sich und erhalten Sie Ihren persönlichen Empfehlungslink unter Einstellungen → Empfehlung." },
            { step: "02", icon: Users, title: "Kollegen einladen", description: "Teilen Sie den Link mit Kolleg:innen, Kanzleien oder Rechtsreferendaren. Kein Limit bei Einladungen." },
            { step: "03", icon: Euro, title: "Provision erhalten", description: "Für jedes bezahlte Abo erhalten Sie 20 % — automatisch abgerechnet, monatlich ausgezahlt." },
          ].map((item, i) => (
            <motion.div key={item.step} {...stagger} transition={{ delay: i * 0.12, duration: 0.5 }} className="relative rounded-2xl border border-border/40 bg-card/60 p-6">
              <span className="absolute top-4 right-4 text-[11px] font-bold text-muted-foreground/20 tabular-nums">{item.step}</span>
              <div className="h-10 w-10 rounded-xl bg-primary/[0.06] flex items-center justify-center mb-4">
                <item.icon className="h-5 w-5 text-primary/60" />
              </div>
              <h3 className="text-[15px] font-semibold mb-1.5">{item.title}</h3>
              <p className="text-[13px] text-muted-foreground/50 leading-relaxed">{item.description}</p>
            </motion.div>
          ))}
        </div>

        <motion.div {...fadeUp} className="rounded-2xl border border-border/40 bg-card/40 p-8">
          <div className="grid sm:grid-cols-2 gap-6">
            {[
              { icon: Handshake, text: "Keine Verpflichtungen — jederzeit kündbar" },
              { icon: ShieldCheck, text: "DSGVO-konform — keine personenbezogenen Daten geteilt" },
              { icon: Euro, text: "20 % wiederkehrende Provision, solange der Kontakt zahlt" },
              { icon: Zap, text: "Sofortiger Start — kein Genehmigungsprozess" },
            ].map((item) => (
              <div key={item.text} className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-foreground/[0.04] flex items-center justify-center shrink-0 mt-0.5">
                  <item.icon className="h-4 w-4 text-foreground/40" />
                </div>
                <p className="text-[13px] text-foreground/70 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div {...fadeUp} className="text-center mt-10">
          <Button size="lg" variant="outline" className="rounded-xl px-8 h-12 text-[14px] gap-2 border-primary/20 hover:border-primary/40" onClick={() => navigate("/auth")}>
            <Gift className="h-4 w-4" /> Jetzt Partner werden
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
