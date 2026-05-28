import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-safe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, TrendingUp, Calendar, BarChart3 } from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";

interface DayStats { date: string; up: number; down: number; total: number; positiveRate: number; }
interface FeedbackRow { id: string; message_id: string; rating: string; created_at: string; comment: string | null; }

export default function FeedbackSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [dayStats, setDayStats] = useState<DayStats[]>([]);
  const [totals, setTotals] = useState({ up: 0, down: 0, total: 0, rate: 0 });
  const [recentFeedback, setRecentFeedback] = useState<FeedbackRow[]>([]);

  useEffect(() => {
    const fetchFeedback = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("message_feedback" as any)
        .select("id, message_id, rating, created_at, comment")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error || !data) { setLoading(false); return; }

      const rows = data as unknown as FeedbackRow[];
      setRecentFeedback(rows.slice(0, 30));

      const byDay: Record<string, { up: number; down: number }> = {};
      let totalUp = 0, totalDown = 0;

      for (const row of rows) {
        const day = row.created_at.slice(0, 10);
        if (!byDay[day]) byDay[day] = { up: 0, down: 0 };
        if (row.rating === "up") { byDay[day].up++; totalUp++; }
        else { byDay[day].down++; totalDown++; }
      }

      const total = totalUp + totalDown;
      setTotals({ up: totalUp, down: totalDown, total, rate: total > 0 ? Math.round((totalUp / total) * 100) : 0 });

      setDayStats(
        Object.entries(byDay)
          .map(([date, { up, down }]) => ({ date, up, down, total: up + down, positiveRate: up + down > 0 ? Math.round((up / (up + down)) * 100) : 0 }))
          .sort((a, b) => b.date.localeCompare(a.date))
      );
      setLoading(false);
    };
    fetchFeedback();
  }, []);

  if (loading) return <LoadingSpinner size="md" />;

  const maxBarValue = Math.max(...dayStats.map(d => d.total), 1);

  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label="Gesamt" value={totals.total.toString()} />
        <StatCard icon={<ThumbsUp className="h-4 w-4 text-emerald-600" />} label="Positiv" value={totals.up.toString()} accent="emerald" />
        <StatCard icon={<ThumbsDown className="h-4 w-4 text-rose-600" />} label="Negativ" value={totals.down.toString()} accent="rose" />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Zufriedenheit" value={`${totals.rate}%`} accent={totals.rate >= 70 ? "emerald" : totals.rate >= 40 ? "amber" : "rose"} />
      </div>

      {dayStats.length > 0 && (
        <Card className="border-border/40 shadow-sm bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground/50" />
              <CardTitle className="text-[15px]">Bewertungen pro Tag</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {dayStats.slice(0, 14).map((day) => (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="text-[12px] text-muted-foreground/50 w-20 shrink-0 tabular-nums">
                    {new Date(day.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                  </span>
                  <div className="flex-1 flex items-center gap-0.5 h-7">
                    <div className="h-full rounded-l-md bg-emerald-500/20 transition-all duration-300" style={{ width: `${(day.up / maxBarValue) * 100}%`, minWidth: day.up > 0 ? "4px" : "0" }} />
                    <div className="h-full rounded-r-md bg-rose-500/20 transition-all duration-300" style={{ width: `${(day.down / maxBarValue) * 100}%`, minWidth: day.down > 0 ? "4px" : "0" }} />
                  </div>
                  <div className="flex items-center gap-2 shrink-0 w-28 justify-end">
                    <span className="text-[11px] text-emerald-600 tabular-nums">{day.up}↑</span>
                    <span className="text-[11px] text-rose-600 tabular-nums">{day.down}↓</span>
                    <Badge variant="outline" className={`text-[9px] tabular-nums px-1.5 ${
                      day.positiveRate >= 70 ? "border-emerald-500/30 text-emerald-600" :
                      day.positiveRate >= 40 ? "border-amber-500/30 text-amber-600" :
                      "border-rose-500/30 text-rose-600"
                    }`}>
                      {day.positiveRate}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/40 shadow-sm bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-[15px]">Letzte Bewertungen</CardTitle>
        </CardHeader>
        <CardContent>
          {recentFeedback.length === 0 ? (
            <EmptyState icon={ThumbsUp} title="Noch keine Bewertungen" description="Bewertungen erscheinen, sobald Nutzer KI-Antworten bewerten." />
          ) : (
            <div className="space-y-0">
              {recentFeedback.map((fb) => (
                <div key={fb.id} className="flex items-center justify-between text-[12px] py-2.5 px-2 rounded-lg hover:bg-muted/20 transition-colors border-b border-border/20 last:border-0">
                  <div className="flex items-center gap-3">
                    {fb.rating === "up" ? <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" /> : <ThumbsDown className="h-3.5 w-3.5 text-rose-600" />}
                    <span className="text-muted-foreground/50 font-mono text-[10px] truncate max-w-[200px]">{fb.message_id.slice(0, 8)}…</span>
                    {fb.comment && <span className="text-foreground/70 truncate max-w-[200px]">"{fb.comment}"</span>}
                  </div>
                  <span className="text-muted-foreground/40 tabular-nums shrink-0">
                    {new Date(fb.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
