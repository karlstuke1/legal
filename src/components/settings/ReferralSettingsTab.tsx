import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Gift, Users, TrendingUp, Euro, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { generateReferralCode, getReferralStats, type ReferralStats } from "@/lib/referral-api";
import { StatCard } from "@/components/shared/StatCard";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export default function ReferralSettingsTab() {
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [c, s] = await Promise.all([generateReferralCode(), getReferralStats()]);
        setCode(c);
        setStats(s);
      } catch (err: any) {
        toast({ title: "Fehler", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const referralLink = code ? `${window.location.origin}/r/${code}` : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast({ title: "Kopiert!", description: "Referral-Link in die Zwischenablage kopiert." });
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

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
    <div className="space-y-6 mt-6">
      {/* Referral link card */}
      <Card className="border-border/30 bg-card/60 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-4 w-4 text-primary" />
            Ihr Empfehlungslink
          </CardTitle>
          <CardDescription className="text-[13px]">
            Teilen Sie diesen Link mit Kollegen. Für jedes bezahlte Abonnement erhalten Sie <span className="font-semibold text-foreground">20% Provision</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              readOnly
              value={referralLink}
              className="font-mono text-[13px] bg-muted/30 border-border/30"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground/40 mt-2">
            Code: <span className="font-mono font-semibold text-muted-foreground/60">{code}</span>
          </p>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Einladungen"
          value={String(stats?.total_referrals ?? 0)}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Conversions"
          value={String(stats?.converted ?? 0)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Verdient"
          value={`€${((stats?.total_earnings_cents ?? 0) / 100).toFixed(2)}`}
          icon={<Euro className="h-4 w-4" />}
          accent="emerald"
        />
        <StatCard
          label="Ausgezahlt"
          value={`€${((stats?.paid_out_cents ?? 0) / 100).toFixed(2)}`}
          icon={<Check className="h-4 w-4" />}
        />
      </div>

      {/* Referral list */}
      {stats && stats.referrals.length > 0 && (
        <Card className="border-border/30 bg-card/60 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base">Empfehlungen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.referrals.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-muted/20 border border-border/20"
                >
                  <div className="text-[13px]">
                    <span className="text-muted-foreground/60">
                      {format(new Date(r.created_at), "dd. MMM yyyy", { locale: de })}
                    </span>
                  </div>
                  <Badge variant={statusVariant[r.status] ?? "outline"} className="text-[11px]">
                    {statusLabel[r.status] ?? r.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {stats && stats.referrals.length === 0 && (
        <div className="text-center py-10">
          <Gift className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-[14px] text-muted-foreground/50">
            Noch keine Empfehlungen. Teilen Sie Ihren Link!
          </p>
        </div>
      )}
    </div>
  );
}
