import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/lib/supabase-safe";
import { toast } from "@/hooks/use-toast";
import { fetchWorkspaceMembers } from "@/lib/invitations-api";
import { fetchQuota, type WorkspaceQuota } from "@/lib/quota-api";
import { PLAN_CONFIGS } from "@/lib/pricing-config";
import {
  CreditCard, Users, ExternalLink,
  ArrowRight, Check, Crown, MessageSquare,
  Upload, ShieldCheck, GraduationCap,
} from "lucide-react";
import { motion } from "framer-motion";

interface PlanInfo {
  plan: string;
  seats_limit: number;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
}

export default function BillingSettingsTab() {
  const { activeWorkspace } = useWorkspace();
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [quota, setQuota] = useState<WorkspaceQuota | null>(null);

  useEffect(() => {
    if (!activeWorkspace) return;
    setLoading(true);

    Promise.all([
      supabase
        .from("plans")
        .select("plan, seats_limit, stripe_subscription_id, current_period_end")
        .eq("workspace_id", activeWorkspace.id)
        .single(),
      fetchWorkspaceMembers(activeWorkspace.id),
      fetchQuota(activeWorkspace.id),
    ]).then(([{ data: plan }, members, q]) => {
      if (plan) setPlanInfo(plan as any);
      setMemberCount(members.length);
      if (q) setQuota(q);
      setLoading(false);
    });
  }, [activeWorkspace?.id]);

  const handleCheckout = async (planName: string) => {
    if (!activeWorkspace) return;
    setCheckoutLoading(true);
    try {
      const res = await supabase.functions.invoke("create-checkout", {
        body: { workspace_id: activeWorkspace.id, plan: planName },
      });
      if (res.error) throw res.error;
      if (res.data?.url) window.location.href = res.data.url;
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManage = async () => {
    if (!activeWorkspace) return;
    try {
      const res = await supabase.functions.invoke("create-checkout", {
        body: { workspace_id: activeWorkspace.id, action: "portal" },
      });
      if (res.error) throw res.error;
      if (res.data?.url) window.location.href = res.data.url;
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    }
  };

  const isOwner = activeWorkspace?.role === "owner";
  const currentPlan = planInfo?.plan || "free";
  const seatsUsed = memberCount;
  const seatsLimit = planInfo?.seats_limit || 2;
  const seatsPercent = Math.min((seatsUsed / seatsLimit) * 100, 100);

  if (!activeWorkspace) {
    return <p className="text-sm text-muted-foreground">Kein Workspace ausgewählt.</p>;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const planLabel: Record<string, string> = {
    free: "Free",
    student: "Student",
    starter: "Starter",
    professional: "Professional",
    enterprise: "Enterprise",
  };

  const planPrice: Record<string, string> = {
    free: "Kostenlos",
    student: "19 €/Mo",
    starter: "49 €/Mo",
    professional: "99 €/Mo",
    enterprise: "Individuell",
  };

  // Plans available for upgrade (exclude free and enterprise)
  const upgradePlans = PLAN_CONFIGS.filter(
    (p) => p.key !== "free" && p.key !== "enterprise"
  );

  return (
    <div className="space-y-8">
      {/* Current Plan */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-foreground/[0.02] to-foreground/[0.05] px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Aktueller Plan</span>
                </div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold tracking-tight">{planLabel[currentPlan] || "Free"}</h2>
                  <Badge variant="secondary" className="text-xs font-medium">
                    {planPrice[currentPlan] || "Kostenlos"}
                  </Badge>
                </div>
              </div>
              {isOwner && planInfo?.stripe_subscription_id && (
                <Button variant="outline" size="sm" onClick={handleManage} className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abo verwalten
                </Button>
              )}
            </div>
          </div>

          <CardContent className="p-6 space-y-5">
            {/* Seats */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  Plätze
                </span>
                <span className="font-semibold">{seatsUsed} von {seatsLimit}</span>
              </div>
              <Progress value={seatsPercent} className="h-2" />
            </div>

            {/* Quota Bars */}
            {quota && (
              <div className="space-y-3 pt-2">
                <QuotaBar
                  icon={<MessageSquare className="h-3.5 w-3.5" />}
                  label="Anfragen"
                  used={quota.queriesUsed}
                  limit={quota.queriesLimit}
                />
                <QuotaBar
                  icon={<Upload className="h-3.5 w-3.5" />}
                  label="Uploads"
                  used={quota.uploadsUsed}
                  limit={quota.uploadsLimit}
                />
              </div>
            )}

            {planInfo?.current_period_end && (
              <p className="text-xs text-muted-foreground">
                Nächste Abrechnung: {new Date(planInfo.current_period_end).toLocaleDateString("de-DE")}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Plan Options */}
      {isOwner && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="mb-4">
            <h3 className="text-base font-semibold mb-1">Plan wechseln</h3>
            <p className="text-sm text-muted-foreground">
              Upgraden Sie für mehr Anfragen, Uploads und Team-Plätze.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upgradePlans.map((plan) => {
              const isCurrent = currentPlan === plan.key;

              return (
                <Card
                  key={plan.key}
                  className={`relative border shadow-sm transition-all duration-200 hover:shadow-md ${
                    plan.popular
                      ? "border-foreground/20 ring-1 ring-foreground/5"
                      : "border-border/60"
                  } ${isCurrent ? "bg-foreground/[0.02]" : ""}`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-foreground text-background text-[10px] font-medium px-3 py-0.5 shadow-sm">
                        <Crown className="h-3 w-3 mr-1" />
                        Beliebt
                      </Badge>
                    </div>
                  )}
                  {plan.key === "student" && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge variant="secondary" className="text-[10px] font-medium px-3 py-0.5 shadow-sm">
                        <GraduationCap className="h-3 w-3 mr-1" />
                        Studenten
                      </Badge>
                    </div>
                  )}

                  <CardHeader className="pb-3 pt-5">
                    <CardTitle className="text-lg">{plan.label}</CardTitle>
                    <div className="mt-2">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold tracking-tight">{plan.price} €</span>
                        <span className="text-sm text-muted-foreground">/Mo</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {plan.seats === 1 ? "1 Platz" : `${plan.seats} Plätze`} · {plan.queries} Anfragen
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <ul className="space-y-2">
                      {plan.features.slice(0, 5).map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-foreground/60 mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="pt-2">
                      {isCurrent ? (
                        <Button variant="outline" size="sm" className="w-full" disabled>
                          Aktueller Plan
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full bg-foreground text-background hover:bg-foreground/90"
                          onClick={() => handleCheckout(plan.key)}
                          disabled={checkoutLoading}
                        >
                          {checkoutLoading ? "…" : "Upgraden"}
                          <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Enterprise CTA */}
          <div className="mt-6 rounded-xl border border-border/60 p-6 text-center">
            <h4 className="text-base font-semibold mb-1">Enterprise</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Unbegrenzte Anfragen, SSO, SLA und dedizierter Support.
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="mailto:kontakt@legal-ai.de">Kontakt aufnehmen</a>
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function QuotaBar({
  icon,
  label,
  used,
  limit,
}: {
  icon: React.ReactNode;
  label: string;
  used: number;
  limit: number;
}) {
  const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isHigh = percent >= 80;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className={`font-semibold ${isHigh ? "text-destructive" : ""}`}>
          {used} von {limit >= 999999 ? "∞" : limit}
        </span>
      </div>
      {limit < 999999 && <Progress value={percent} className="h-2" />}
    </div>
  );
}
