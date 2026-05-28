import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/lib/supabase-safe";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Coins, MessageSquare, Clock } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";

interface UsageEntry {
  id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_estimate: number;
  created_at: string;
}

interface UsageStats {
  totalMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byModel: Record<string, { count: number; tokens: number; cost: number }>;
}

export default function UsageSettingsTab() {
  const { activeWorkspace } = useWorkspace();
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [stats, setStats] = useState<UsageStats>({
    totalMessages: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0, byModel: {},
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWorkspace) return;
    const fetchUsage = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("usage_ledger")
        .select("*")
        .eq("workspace_id", activeWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!error && data) {
        const typed = data as unknown as UsageEntry[];
        setEntries(typed);

        const byModel: Record<string, { count: number; tokens: number; cost: number }> = {};
        let totalInput = 0, totalOutput = 0, totalCost = 0;

        for (const e of typed) {
          totalInput += e.input_tokens;
          totalOutput += e.output_tokens;
          totalCost += e.cost_estimate;
          if (!byModel[e.model]) byModel[e.model] = { count: 0, tokens: 0, cost: 0 };
          byModel[e.model].count++;
          byModel[e.model].tokens += e.input_tokens + e.output_tokens;
          byModel[e.model].cost += e.cost_estimate;
        }

        setStats({ totalMessages: typed.length, totalInputTokens: totalInput, totalOutputTokens: totalOutput, totalCost: totalCost, byModel });
      }
      setLoading(false);
    };
    fetchUsage();
  }, [activeWorkspace?.id]);

  const formatTokens = (n: number) => {
    if (n > 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n > 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toString();
  };

  if (loading) return <LoadingSpinner size="md" />;

  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<MessageSquare className="h-4 w-4" />} label="Nachrichten" value={stats.totalMessages.toString()} />
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label="Input-Tokens" value={formatTokens(stats.totalInputTokens)} />
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label="Output-Tokens" value={formatTokens(stats.totalOutputTokens)} />
        <StatCard icon={<Coins className="h-4 w-4" />} label="Geschätzte Kosten" value={`€${stats.totalCost.toFixed(2)}`} />
      </div>

      {Object.keys(stats.byModel).length > 0 && (
        <Card className="border-border/40 shadow-sm bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-[15px]">Nutzung nach Modell</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.byModel).map(([model, data]) => (
                <div key={model} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono">{model}</Badge>
                    <span className="text-[12px] text-muted-foreground/50">{data.count} Anfragen</span>
                  </div>
                  <div className="flex items-center gap-4 text-[12px] text-muted-foreground/50">
                    <span>{formatTokens(data.tokens)} Tokens</span>
                    <span className="font-medium text-foreground">€{data.cost.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/40 shadow-sm bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-[15px]">Letzte Aktivität</CardTitle>
          <CardDescription className="text-[13px]">Die letzten 20 API-Aufrufe</CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <EmptyState icon={BarChart3} title="Noch keine Nutzungsdaten" />
          ) : (
            <div className="space-y-0">
              {entries.slice(0, 20).map((e) => (
                <div key={e.id} className="flex items-center justify-between text-[12px] py-2.5 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-3">
                    <Clock className="h-3 w-3 text-muted-foreground/40" />
                    <span className="text-muted-foreground/50 tabular-nums">
                      {new Date(e.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <Badge variant="outline" className="text-[9px] font-mono">{e.model}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground/50">
                    <span className="tabular-nums">{formatTokens(e.input_tokens + e.output_tokens)} tok</span>
                    <span className="font-medium text-foreground tabular-nums">€{e.cost_estimate.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
