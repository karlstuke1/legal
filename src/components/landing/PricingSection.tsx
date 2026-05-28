import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { fadeUp, stagger } from "./shared";

export function PricingSection() {
  const navigate = useNavigate();

  return (
    <section id="pricing" className="border-t border-border/20 bg-card/20" aria-labelledby="pricing-heading">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <motion.div {...fadeUp} className="text-center mb-14">
          <h2 id="pricing-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Einfach starten. Flexibel skalieren.
          </h2>
          <p className="text-muted-foreground/50 text-lg max-w-lg mx-auto">Kostenloser Einstieg. Keine Kreditkarte nötig.</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-5 mb-8">
          {[
            { name: "Free", price: "0 €", period: "", description: "Zum Kennenlernen", features: ["1 Benutzer", "20 Anfragen / Monat", "Basis-Quellen", "Chat-Verlauf"], highlight: false, cta: "Kostenlos starten" },
            { name: "Starter", price: "49 €", period: "/ Monat", description: "Für Einzelanwälte", features: ["3 Benutzer", "200 Anfragen", "Alle 10+ Quellen", "Dokumentenprüfung", "Mandantenakten", "Prüfungsmodus"], highlight: true, cta: "Jetzt starten" },
            { name: "Professional", price: "149 €", period: "/ Monat", description: "Für Kanzleien", features: ["10 Benutzer", "Unbegrenzt", "Alle 6 Modi", "Priority Support", "Team-Verwaltung", "Pseudonymisierung"], highlight: false, cta: "Jetzt starten" },
          ].map((plan, i) => (
            <motion.div
              key={plan.name}
              {...stagger}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className={`relative rounded-2xl border p-6 flex flex-col ${plan.highlight ? "border-foreground/20 shadow-lg ring-1 ring-foreground/5" : "border-border/50"}`}
            >
              {plan.highlight && <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px]">Beliebt</Badge>}
              <h3 className="text-[15px] font-semibold">{plan.name}</h3>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5 mb-4">{plan.description}</p>
              <div className="flex items-baseline gap-1 mb-5">
                <span className="text-3xl font-bold">{plan.price}</span>
                {plan.period && <span className="text-[13px] text-muted-foreground/40">{plan.period}</span>}
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[13px] text-foreground/70">
                    <Check className="h-3.5 w-3.5 text-foreground/25 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Button className="w-full rounded-xl" variant={plan.highlight ? "default" : "outline"} onClick={() => navigate("/auth")}>{plan.cta}</Button>
            </motion.div>
          ))}
        </div>
        <div className="text-center">
          <Button variant="link" className="text-[13px] text-muted-foreground/40" onClick={() => navigate("/pricing")}>Alle Pläne vergleichen →</Button>
        </div>
      </div>
    </section>
  );
}
