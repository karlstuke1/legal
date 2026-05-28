import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Sparkles,
  Loader2,
  Calendar,
  FileText,
  CheckCheck,
  RefreshCw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  startFlowAnalysis,
  fetchAnalyses,
  fetchAnalysisResults,
  toggleResultIncluded,
  updateAnalysisSummary,
  renameFiles,
  type MatterAnalysis,
  type AnalysisResult,
} from "@/lib/analysis-api";

interface FlowAnalysisProps {
  matterId: string;
  workspaceId: string;
  fileCount: number;
}

export default function FlowAnalysis({ matterId, workspaceId, fileCount }: FlowAnalysisProps) {
  const [analysis, setAnalysis] = useState<MatterAnalysis | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [polling, setPolling] = useState(false);

  // Load existing analysis on mount
  useEffect(() => {
    loadExisting();
  }, [matterId]);

  const loadExisting = async () => {
    const analyses = await fetchAnalyses(matterId);
    const flowAnalysis = analyses.find((a) => a.type === "flow");
    if (flowAnalysis) {
      setAnalysis(flowAnalysis);
      setSummaryDraft(flowAnalysis.summary || "");
      if (flowAnalysis.status === "done" || flowAnalysis.status === "error") {
        const res = await fetchAnalysisResults(flowAnalysis.id);
        setResults(res);
      } else if (flowAnalysis.status === "processing" || flowAnalysis.status === "pending") {
        startPolling(flowAnalysis.id);
      }
    }
  };

  const startPolling = (analysisId: string) => {
    setPolling(true);
    const interval = setInterval(async () => {
      const analyses = await fetchAnalyses(matterId);
      const a = analyses.find((x) => x.id === analysisId);
      if (a) {
        setAnalysis(a);
        setSummaryDraft(a.summary || "");
        if (a.status === "done" || a.status === "error") {
          clearInterval(interval);
          setPolling(false);
          if (a.status === "done") {
            const res = await fetchAnalysisResults(a.id);
            setResults(res);
            toast({ title: "Aufbereitung abgeschlossen" });
          } else {
            toast({
              title: "Fehler bei der Aufbereitung",
              description: a.error_message || undefined,
              variant: "destructive",
            });
          }
        }
      }
    }, 3000);
  };

  const handleStart = async () => {
    if (fileCount === 0) {
      toast({
        title: "Keine Dateien",
        description: "Laden Sie zuerst Dateien in diese Akte hoch.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    const a = await startFlowAnalysis(matterId, workspaceId);
    setLoading(false);
    if (a) {
      setAnalysis(a);
      setResults([]);
      startPolling(a.id);
    } else {
      toast({ title: "Fehler beim Starten", variant: "destructive" });
    }
  };

  const handleToggle = async (resultId: string, included: boolean) => {
    const ok = await toggleResultIncluded(resultId, !included);
    if (ok) {
      setResults((prev) =>
        prev.map((r) => (r.id === resultId ? { ...r, included: !included } : r))
      );
    }
  };

  const handleSaveSummary = async () => {
    if (!analysis) return;
    const ok = await updateAnalysisSummary(analysis.id, summaryDraft);
    if (ok) {
      setAnalysis({ ...analysis, summary: summaryDraft });
      setEditingSummary(false);
      toast({ title: "Sachverhalt gespeichert" });
    }
  };

  const handleRenameFiles = async () => {
    const ok = await renameFiles(results);
    if (ok) {
      toast({ title: "Dateinamen übernommen" });
    } else {
      toast({ title: "Fehler beim Umbenennen", variant: "destructive" });
    }
  };

  const isProcessing =
    analysis?.status === "pending" || analysis?.status === "processing";

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="h-14 w-14 rounded-2xl bg-primary/5 flex items-center justify-center">
          <Sparkles className="h-7 w-7 text-primary/40" />
        </div>
        <div className="text-center">
          <h3 className="text-[15px] font-semibold text-foreground/80">
            Automatische Fallaufbereitung
          </h3>
          <p className="text-[13px] text-muted-foreground/50 mt-1 max-w-md">
            Dokumente werden analysiert, umbenannt und chronologisch sortiert. Ein nachprüfbarer
            Sachverhalt wird automatisch erstellt.
          </p>
        </div>
        <Button onClick={handleStart} disabled={loading || fileCount === 0} className="mt-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          Aufbereitung starten
        </Button>
        {fileCount === 0 && (
          <p className="text-[12px] text-muted-foreground/40">
            Laden Sie zuerst Dateien hoch
          </p>
        )}
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
        <p className="text-[14px] text-muted-foreground/60">
          Dokumente werden analysiert…
        </p>
        <p className="text-[12px] text-muted-foreground/30">
          Dies kann je nach Anzahl der Dokumente einige Minuten dauern.
        </p>
      </div>
    );
  }

  if (analysis.status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-[14px] text-destructive/70">Fehler bei der Aufbereitung</p>
        <p className="text-[12px] text-muted-foreground/50">{analysis.error_message}</p>
        <Button variant="outline" size="sm" onClick={handleStart}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Document Results */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-semibold text-foreground/70 flex items-center gap-2">
            <FileText className="h-4 w-4 opacity-40" />
            Dokumente ({results.length})
          </h3>
          <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={handleRenameFiles}>
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            Dateinamen übernehmen
          </Button>
        </div>

        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.id}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                r.included
                  ? "border-border/30 bg-card/30"
                  : "border-border/10 bg-muted/20 opacity-60"
              }`}
            >
              <Checkbox
                checked={r.included}
                onCheckedChange={() => handleToggle(r.id, r.included)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">
                  {r.file_name_suggestion || "Unbenannt"}
                </p>
                {r.doc_date && (
                  <p className="text-[11px] text-muted-foreground/50 flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3 w-3" />
                    {new Date(r.doc_date).toLocaleDateString("de-DE")}
                  </p>
                )}
                {r.doc_summary && (
                  <p className="text-[12px] text-muted-foreground/60 mt-1 leading-relaxed">
                    {r.doc_summary}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Generated Summary */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-semibold text-foreground/70">Sachverhalt</h3>
          <div className="flex items-center gap-2">
            {editingSummary ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[12px]"
                  onClick={() => {
                    setEditingSummary(false);
                    setSummaryDraft(analysis.summary || "");
                  }}
                >
                  Abbrechen
                </Button>
                <Button size="sm" className="h-7 text-[12px]" onClick={handleSaveSummary}>
                  Speichern
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[12px] text-muted-foreground/50"
                  onClick={() => setEditingSummary(true)}
                >
                  Bearbeiten
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[12px]"
                  onClick={handleStart}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Neu generieren
                </Button>
              </>
            )}
          </div>
        </div>

        {editingSummary ? (
          <Textarea
            value={summaryDraft}
            onChange={(e) => setSummaryDraft(e.target.value)}
            className="min-h-[300px] text-[13px] font-mono"
          />
        ) : (
          <div className="prose prose-sm max-w-none text-foreground/80 bg-card/30 rounded-xl p-5 border border-border/20">
            <ReactMarkdown>{analysis.summary || "Kein Sachverhalt generiert."}</ReactMarkdown>
          </div>
        )}
      </section>
    </div>
  );
}
