import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Check,
  Gift,
  Users,
  TrendingUp,
  Euro,
  Loader2,
  Sparkles,
  ArrowRight,
  Share2,
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "@/hooks/use-toast";
import {
  generateReferralCode,
  getReferralStats,
  type ReferralStats,
} from "@/lib/referral-api";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

const stagger = (i: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.1 + i * 0.08, duration: 0.4 },
});

export default function ReferralPage() {
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [c, s] = await Promise.all([
          generateReferralCode(),
          getReferralStats(),
        ]);
        setCode(c);
        setStats(s);
      } catch (err: any) {
        toast({
          title: "Fehler",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const referralLink = code
    ? `${window.location.origin}/r/${code}`
    : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast({
      title: "Kopiert!",
      description: "Empfehlungslink in die Zwischenablage kopiert.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "Legal AI — Juristischer KI-Assistent",
        text: "Teste Legal AI kostenlos — der KI-Assistent für juristische Recherche:",
        url: referralLink,
      });
    } else {
      handleCopy();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Einladungen",
      value: String(stats?.total_referrals ?? 0),
      icon: Users,
      color: "bg-primary/[0.06] text-primary/60",
    },
    {
      label: "Conversions",
      value: String(stats?.converted ?? 0),
      icon: TrendingUp,
      color: "bg-primary/[0.06] text-primary/60",
    },
    {
      label: "Verdient",
      value: `€${((stats?.total_earnings_cents ?? 0) / 100).toFixed(2)}`,
      icon: Euro,
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      label: "Ausgezahlt",
      value: `€${((stats?.paid_out_cents ?? 0) / 100).toFixed(2)}`,
      icon: Check,
      color: "bg-emerald-500/10 text-emerald-600",
    },
  ];

  const statusLabel: Record<string, string> = {
    pending: "Registriert",
    converted: "Abo aktiv",
    paid: "Ausgezahlt",
  };

  const statusVariant: Record<string, "default" | "secondary" | "outline"> = {
    pending: "outline",
    converted: "secondary",
    paid: "default",
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-3 py-1.5 border-b border-border/15 sticky top-0 z-10 bg-background/90 backdrop-blur-sm">
        <SidebarTrigger className="h-7 w-7" />
      </div>
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-10 sm:py-16">
        {/* Hero */}
        <motion.div {...fadeUp} className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/[0.06] mb-5">
            <Gift className="h-7 w-7 text-primary/50" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
            Freunde einladen
          </h1>
          <p className="text-muted-foreground/50 text-[15px] max-w-md mx-auto leading-relaxed">
            Teilen Sie Legal AI mit Kolleg:innen und erhalten Sie{" "}
            <span className="text-foreground font-semibold">
              20 % Provision
            </span>{" "}
            auf jedes bezahlte Abonnement — dauerhaft.
          </p>
        </motion.div>

        {/* Referral Link Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          <Card className="border-border/30 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="relative px-6 py-8">
              {/* Subtle gradient accent */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] via-transparent to-primary/[0.01]" />
              <div className="relative">
                <p className="text-[12px] font-medium text-muted-foreground/40 uppercase tracking-wider mb-3">
                  Ihr persönlicher Empfehlungslink
                </p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={referralLink}
                    className="font-mono text-[13px] bg-background/60 border-border/30 h-11 rounded-xl"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    className="shrink-0 h-11 w-11 rounded-xl border-border/30"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <p className="text-[11px] text-muted-foreground/30">
                    Code:{" "}
                    <span className="font-mono font-semibold text-muted-foreground/50">
                      {code}
                    </span>
                  </p>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 rounded-xl gap-1.5 text-[12px]"
                    onClick={handleShare}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Teilen
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          {statCards.map((s, i) => (
            <motion.div key={s.label} {...stagger(i)}>
              <Card className="border-border/20 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-4">
                  <div
                    className={`h-8 w-8 rounded-xl ${s.color} flex items-center justify-center mb-3`}
                  >
                    <s.icon className="h-4 w-4" />
                  </div>
                  <p className="text-xl sm:text-2xl font-bold tracking-tight">
                    {s.value}
                  </p>
                  <p className="text-[11px] text-muted-foreground/40 mt-0.5">
                    {s.label}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          className="mt-10"
        >
          <h2 className="text-[14px] font-semibold text-foreground/80 mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground/30" />
            So funktioniert's
          </h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              {
                step: "1",
                title: "Link teilen",
                desc: "Kopieren Sie Ihren persönlichen Link und senden Sie ihn an Kolleg:innen.",
              },
              {
                step: "2",
                title: "Registrierung",
                desc: "Ihr Kontakt erstellt einen kostenlosen Account über Ihren Link.",
              },
              {
                step: "3",
                title: "Provision",
                desc: "Bei jedem Abo-Abschluss erhalten Sie automatisch 20 % Provision.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                {...stagger(i + 4)}
                className="rounded-2xl border border-border/20 bg-card/40 p-5 relative"
              >
                <span className="absolute top-3 right-3 text-[10px] font-bold text-muted-foreground/15 tabular-nums">
                  {item.step}
                </span>
                <div className="h-8 w-8 rounded-xl bg-primary/[0.04] flex items-center justify-center mb-3">
                  <span className="text-[13px] font-bold text-foreground/30">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-[13px] font-semibold mb-1">
                  {item.title}
                </h3>
                <p className="text-[12px] text-muted-foreground/40 leading-relaxed">
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Referral List */}
        {stats && stats.referrals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.5 }}
            className="mt-10"
          >
            <h2 className="text-[14px] font-semibold text-foreground/80 mb-4">
              Ihre Empfehlungen
            </h2>
            <div className="space-y-2">
              {stats.referrals.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-3 px-4 rounded-xl bg-card/60 border border-border/20"
                >
                  <span className="text-[13px] text-muted-foreground/50">
                    {format(new Date(r.created_at), "dd. MMM yyyy", {
                      locale: de,
                    })}
                  </span>
                  <Badge
                    variant={statusVariant[r.status] ?? "outline"}
                    className="text-[11px]"
                  >
                    {statusLabel[r.status] ?? r.status}
                  </Badge>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {stats && stats.referrals.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="mt-8 rounded-2xl border border-border/20 bg-gradient-to-br from-card/60 to-card/30 p-8 text-center"
          >
            <div className="flex items-center justify-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl bg-primary/[0.06] flex items-center justify-center">
                <Users className="h-5 w-5 text-primary/40" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/25" />
              <div className="h-10 w-10 rounded-xl bg-primary/[0.06] flex items-center justify-center">
                <Gift className="h-5 w-5 text-primary/40" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/25" />
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Euro className="h-5 w-5 text-emerald-600/50" />
              </div>
            </div>
            <p className="text-[15px] font-semibold text-foreground/80 mb-1.5">
              Noch keine Empfehlungen
            </p>
            <p className="text-[13px] text-muted-foreground/45 max-w-sm mx-auto leading-relaxed mb-5">
              Teilen Sie Ihren persönlichen Link mit Kolleg:innen und verdienen Sie bei jedem Abo-Abschluss.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-[13px] gap-2 border-border/40"
              onClick={handleCopy}
            >
              <Copy className="h-3.5 w-3.5" />
              Link jetzt kopieren
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
