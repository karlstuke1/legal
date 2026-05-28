import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, GraduationCap, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PLAN_CONFIGS } from "@/lib/pricing-config";

export default function PricingPage() {
  const navigate = useNavigate();

  // Filter out enterprise for the main grid (shown separately)
  const gridPlans = PLAN_CONFIGS.filter((p) => p.key !== "enterprise");
  const enterprise = PLAN_CONFIGS.find((p) => p.key === "enterprise");

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Preise – Legal AI für Kanzleien & Einzelanwälte"
        description="Legal AI Preise: Kostenlos starten mit 20 Anfragen/Monat. Starter ab 49€ für Einzelanwälte, Professional ab 149€ für Kanzleien. Student-Tarif verfügbar. DSGVO-konform."
        path="/pricing"
      />
      {/* Header */}
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background text-sm font-bold">
              L
            </div>
            <span className="text-lg font-semibold tracking-tight">Legal AI</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/auth")}>
            Anmelden
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-6xl px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-12"
        >
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            Einfache, transparente Preise
          </h1>
          <p className="text-muted-foreground text-lg max-w-lg mx-auto">
            Wählen Sie den Plan, der zu Ihnen passt. Jederzeit kündbar.
          </p>
        </motion.div>

        {/* Plans grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
          {gridPlans.map((plan, i) => (
            <motion.div
              key={plan.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className={`relative rounded-xl border p-5 flex flex-col ${
                plan.popular
                  ? "border-primary shadow-lg ring-1 ring-primary/20"
                  : "border-border/60"
              }`}
            >
              {plan.popular && (
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs gap-1">
                  <Crown className="h-3 w-3" />
                  Beliebt
                </Badge>
              )}
              {plan.key === "student" && (
                <Badge
                  variant="secondary"
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs gap-1"
                >
                  <GraduationCap className="h-3 w-3" />
                  Studenten
                </Badge>
              )}
              <div className="mb-5">
                <h3 className="text-lg font-semibold">{plan.label}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  {plan.price === 0 ? (
                    <span className="text-2xl font-bold">Kostenlos</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold">{plan.price} €</span>
                      <span className="text-sm text-muted-foreground">/ Monat</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {plan.seats === 1
                    ? "1 Platz"
                    : plan.seats
                    ? `Bis zu ${plan.seats} Plätze`
                    : "Unbegrenzte Plätze"}
                </p>
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="w-full"
                variant={plan.popular ? "default" : "outline"}
                onClick={() => navigate("/auth")}
              >
                {plan.price === 0 ? "Kostenlos starten" : "Jetzt starten"}
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Enterprise */}
        {enterprise && (
          <div className="rounded-xl border border-border/60 p-8 text-center">
            <h3 className="text-lg font-semibold mb-2">{enterprise.label}</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              {enterprise.features.slice(0, 3).join(" · ")}. Für Großkanzleien und
              Rechtsabteilungen.
            </p>
            <Button variant="outline" asChild>
              <a href="mailto:kontakt@legal-ai.de">Kontaktieren Sie uns</a>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
