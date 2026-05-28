import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, MinusCircle, Loader2, FileBarChart } from "lucide-react";
import { supabase } from "@/lib/supabase-safe";
import { toast } from "@/hooks/use-toast";

export interface RiskClause {
  clause: string;
  risk: "high" | "medium" | "low";
  explanation: string;
  suggestion: string;
}

export interface RiskReportData {
  title: string;
  summary: string;
  clauses: RiskClause[];
  overallScore: number; // 0-100
}

interface RiskReportProps {
  documentText: string;
  chatId: string;
}

const riskConfig = {
  high: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", label: "Hohes Risiko" },
  medium: { icon: MinusCircle, color: "text-amber-600", bg: "bg-amber-500/10 border-amber-500/20", label: "Mittleres Risiko" },
  low: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Geringes Risiko" },
};

export function RiskReport({ documentText, chatId }: RiskReportProps) {
  const [report, setReport] = useState<RiskReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedClauses, setExpandedClauses] = useState<Set<number>>(new Set());

  const toggleClause = (i: number) => {
    setExpandedClauses(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const generateReport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("risk-report", {
        body: { text: documentText.slice(0, 30000) },
      });

      if (error) throw error;
      setReport(data as RiskReportData);
      // Expand all high-risk clauses by default
      const highRisk = new Set<number>();
      (data as RiskReportData).clauses.forEach((c, i) => { if (c.risk === "high") highRisk.add(i); });
      setExpandedClauses(highRisk);
    } catch (err: any) {
      console.error("Risk report error:", err);
      toast({ title: "Fehler", description: "Prüfbericht konnte nicht erstellt werden.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!report) {
    return (
      <div className="mt-4 p-4 rounded-xl border border-border/30 bg-card/30">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <ShieldAlert className="h-4.5 w-4.5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-medium text-foreground/80">Interaktiver Prüfbericht</p>
            <p className="text-[11px] text-muted-foreground/50">Klausel-für-Klausel Risikobewertung mit Handlungsempfehlungen</p>
          </div>
          <Button onClick={generateReport} disabled={loading} size="sm" variant="outline" className="gap-2 rounded-lg">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileBarChart className="h-3.5 w-3.5" />}
            {loading ? "Wird erstellt..." : "Erstellen"}
          </Button>
        </div>
      </div>
    );
  }

  const scoreColor = report.overallScore >= 70 ? "text-emerald-600" : report.overallScore >= 40 ? "text-amber-600" : "text-destructive";
  const highCount = report.clauses.filter(c => c.risk === "high").length;
  const mediumCount = report.clauses.filter(c => c.risk === "medium").length;
  const lowCount = report.clauses.filter(c => c.risk === "low").length;

  return (
    <div className="mt-4 space-y-4">
      {/* Header */}
      <div className="p-5 rounded-xl border border-border/30 bg-card/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileBarChart className="h-4 w-4 text-primary/60" />
            {report.title}
          </h3>
          <div className={`text-2xl font-bold ${scoreColor}`}>
            {report.overallScore}/100
          </div>
        </div>
        <p className="text-[12px] text-foreground/70 leading-relaxed mb-3">{report.summary}</p>
        <div className="flex gap-3">
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-destructive/10 text-destructive font-medium">
            {highCount} Hoch
          </span>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 font-medium">
            {mediumCount} Mittel
          </span>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 font-medium">
            {lowCount} Gering
          </span>
        </div>
      </div>

      {/* Clauses */}
      <div className="space-y-2">
        {report.clauses.map((clause, i) => {
          const config = riskConfig[clause.risk];
          const Icon = config.icon;
          const expanded = expandedClauses.has(i);

          return (
            <div key={i} className={`rounded-xl border ${config.bg} transition-all`}>
              <button
                onClick={() => toggleClause(i)}
                className="w-full flex items-center gap-3 p-3.5 text-left"
              >
                <Icon className={`h-4 w-4 ${config.color} flex-shrink-0`} />
                <span className="text-[13px] font-medium text-foreground flex-1">{clause.clause}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${config.bg} font-medium ${config.color}`}>
                  {config.label}
                </span>
                {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />}
              </button>
              {expanded && (
                <div className="px-3.5 pb-3.5 space-y-2">
                  <div className="p-3 rounded-lg bg-background/60">
                    <p className="text-[10px] font-medium text-muted-foreground/50 mb-1">Bewertung</p>
                    <p className="text-[12px] text-foreground/70 leading-relaxed">{clause.explanation}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background/60">
                    <p className="text-[10px] font-medium text-muted-foreground/50 mb-1">Empfehlung</p>
                    <p className="text-[12px] text-foreground/70 leading-relaxed">{clause.suggestion}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
