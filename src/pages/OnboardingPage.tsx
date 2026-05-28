import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Scale, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { useOnboardingContext } from "@/components/AppLayout";
import { toast } from "@/hooks/use-toast";
import type { LegalArea } from "@/lib/types";
import { LEGAL_AREA_LABELS, LEGAL_AREA_DESCRIPTIONS } from "@/lib/types";

const JURISDICTIONS = [
  { value: "AT", label: "Österreich", flag: "🇦🇹" },
];

const LEGAL_AREAS: { value: LegalArea; icon: string }[] = [
  { value: "zivilrecht", icon: "📜" },
  { value: "strafrecht", icon: "⚖️" },
  { value: "steuerrecht", icon: "🧾" },
  { value: "oeffentliches_recht", icon: "🏛️" },
  { value: "arbeitsrecht", icon: "👷" },
  { value: "allgemein", icon: "📚" },
];

const ROLES = [
  { value: "anwalt", label: "Anwält:in", icon: "⚖️" },
  { value: "inhouse", label: "Inhouse Counsel", icon: "🏢" },
  { value: "student", label: "Student:in", icon: "🎓" },
  { value: "behoerde", label: "Behörde", icon: "🏛️" },
  { value: "other", label: "Sonstige", icon: "💼" },
];

function getDefaultModeForRole(role: string) {
  return role === "student" ? "exam" : "research";
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
};

export default function OnboardingPage() {
  const { user } = useAuth();
  const { activeWorkspace, refetch } = useWorkspace();
  const navigate = useNavigate();
  const { markComplete } = useOnboardingContext();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [workspaceName, setWorkspaceName] = useState(activeWorkspace?.name || "Mein Workspace");
  const [jurisdictions, setJurisdictions] = useState<string[]>(["AT"]);
  const [legalArea, setLegalArea] = useState<LegalArea>("allgemein");
  const [role, setRole] = useState<string>("");

  const totalSteps = 5;

  const toggleJurisdiction = (val: string) => {
    setJurisdictions((prev) =>
      prev.includes(val) ? prev.filter((j) => j !== val) : [...prev, val]
    );
  };

  const canNext = () => {
    if (step === 0) return displayName.trim().length > 1;
    if (step === 1) return workspaceName.trim().length > 0;
    if (step === 2) return jurisdictions.length > 0;
    if (step === 3) return true; // legal area always has a default
    if (step === 4) return role.length > 0;
    return false;
  };

  const goNext = () => {
    if (step < totalSteps - 1) {
      setDir(1);
      setStep((s) => s + 1);
    }
  };

  const goBack = () => {
    if (step > 0) {
      setDir(-1);
      setStep((s) => s - 1);
    }
  };

  const finish = async () => {
    if (!user || !activeWorkspace) return;
    setSaving(true);
    try {
      // Update workspace name
      if (workspaceName.trim() !== activeWorkspace.name) {
        const { error: wsErr } = await supabase
          .from("workspaces")
          .update({ name: workspaceName.trim() })
          .eq("id", activeWorkspace.id);
        if (wsErr) throw wsErr;
      }

      // Update profile with all onboarding data
      const { error: profErr } = await (supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          user_role: role,
          default_jurisdiction: jurisdictions,
          default_legal_area: legalArea,
          default_mode: getDefaultModeForRole(role),
          onboarding_completed: true,
        } as any)
        .eq("user_id", user.id));
      if (profErr) throw profErr;

      await refetch();
      markComplete();
      navigate("/app/chat", { replace: true });
    } catch (err: any) {
      console.error("Onboarding save failed:", err);
      toast({ title: "Fehler beim Speichern", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 mb-10"
        >
          <div className="h-10 w-10 rounded-xl bg-foreground/[0.04] border border-border/30 flex items-center justify-center">
            <Scale className="h-4.5 w-4.5 text-foreground/40" />
          </div>
        </motion.div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-8 bg-primary" : i < step ? "w-4 bg-primary/40" : "w-4 bg-muted"
              )}
            />
          ))}
        </div>

        {/* Steps */}
        <div className="relative overflow-x-hidden overflow-y-visible min-h-[320px] px-1">
          <AnimatePresence custom={dir} mode="wait">
            <motion.div
              key={step}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="w-full"
            >
              {step === 0 && (
                <div className="space-y-6 text-center">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Willkommen!</h1>
                    <p className="text-muted-foreground mt-1.5 text-sm">Wie heißen Sie?</p>
                  </div>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="z.B. Max Mustermann"
                    className="text-center text-lg h-12"
                    autoFocus
                  />
                </div>
              )}

              {step === 1 && (
                <div className="space-y-6 text-center">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Workspace</h1>
                    <p className="text-muted-foreground mt-1.5 text-sm">Geben Sie Ihrem Workspace einen Namen.</p>
                  </div>
                  <Input
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="z.B. Kanzlei Müller"
                    className="text-center text-lg h-12"
                    autoFocus
                  />
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6 text-center">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Jurisdiktion</h1>
                    <p className="text-muted-foreground mt-1.5 text-sm">In welchen Jurisdiktionen arbeiten Sie? (Mehrfachauswahl)</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-3">
                    {JURISDICTIONS.map((j) => (
                      <button
                        key={j.value}
                        type="button"
                        onClick={() => toggleJurisdiction(j.value)}
                        className={cn(
                          "flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-medium transition-all",
                          jurisdictions.includes(j.value)
                            ? "border-primary bg-primary/5 text-foreground shadow-sm"
                            : "border-border bg-background text-muted-foreground hover:border-foreground/20"
                        )}
                      >
                        <span className="text-lg">{j.flag}</span>
                        {j.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6 text-center">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Rechtsgebiet</h1>
                    <p className="text-muted-foreground mt-1.5 text-sm">In welchem Bereich arbeiten Sie hauptsächlich?</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {LEGAL_AREAS.map((la) => (
                      <button
                        key={la.value}
                        type="button"
                        onClick={() => setLegalArea(la.value)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 px-3 py-3.5 rounded-xl border text-sm font-medium transition-all",
                          legalArea === la.value
                            ? "border-primary bg-primary/5 text-foreground shadow-sm"
                            : "border-border bg-background text-muted-foreground hover:border-foreground/20"
                        )}
                      >
                        <span className="text-xl">{la.icon}</span>
                        <span className="text-[13px] leading-tight">{LEGAL_AREA_LABELS[la.value]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6 text-center">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Ihre Rolle</h1>
                    <p className="text-muted-foreground mt-1.5 text-sm">Wie nutzen Sie die Plattform?</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {ROLES.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRole(r.value)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 px-4 py-4 rounded-xl border text-sm font-medium transition-all",
                          role === r.value
                            ? "border-primary bg-primary/5 text-foreground shadow-sm"
                            : "border-border bg-background text-muted-foreground hover:border-foreground/20"
                        )}
                      >
                        <span className="text-xl">{r.icon}</span>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={step === 0}
            className={cn(step === 0 && "invisible")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Zurück
          </Button>

          {step < totalSteps - 1 ? (
            <Button onClick={goNext} disabled={!canNext()}>
              Weiter
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={!canNext() || saving}>
              <Sparkles className="h-4 w-4 mr-1" />
              {saving ? "Wird gespeichert…" : "Loslegen"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
