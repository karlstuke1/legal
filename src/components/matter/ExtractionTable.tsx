import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Loader2,
  Plus,
  X,
  Download,
  TableProperties,
  RefreshCw,
} from "lucide-react";
import {
  startExtractionAnalysis,
  fetchAnalyses,
  fetchAnalysisResults,
  type MatterAnalysis,
  type AnalysisResult,
} from "@/lib/analysis-api";

interface ExtractionTableProps {
  matterId: string;
  workspaceId: string;
  fileCount: number;
}

export default function ExtractionTable({
  matterId,
  workspaceId,
  fileCount,
}: ExtractionTableProps) {
  const [analysis, setAnalysis] = useState<MatterAnalysis | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [questions, setQuestions] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => {
    loadExisting();
  }, [matterId]);

  const loadExisting = async () => {
    const analyses = await fetchAnalyses(matterId);
    const extractionAnalysis = analyses.find((a) => a.type === "extraction");
    if (extractionAnalysis) {
      setAnalysis(extractionAnalysis);
      if (extractionAnalysis.questions) {
        setQuestions(extractionAnalysis.questions);
      }
      if (extractionAnalysis.status === "done") {
        const res = await fetchAnalysisResults(extractionAnalysis.id);
        setResults(res);
      } else if (
        extractionAnalysis.status === "processing" ||
        extractionAnalysis.status === "pending"
      ) {
        startPolling(extractionAnalysis.id);
      }
    }
  };

  const startPolling = (analysisId: string) => {
    const interval = setInterval(async () => {
      const analyses = await fetchAnalyses(matterId);
      const a = analyses.find((x) => x.id === analysisId);
      if (a) {
        setAnalysis(a);
        if (a.status === "done" || a.status === "error") {
          clearInterval(interval);
          if (a.status === "done") {
            const res = await fetchAnalysisResults(a.id);
            setResults(res);
            toast({ title: "Extraktion abgeschlossen" });
          } else {
            toast({
              title: "Fehler bei der Extraktion",
              description: a.error_message || undefined,
              variant: "destructive",
            });
          }
        }
      }
    }, 3000);
  };

  const handleStart = async () => {
    const validQuestions = questions.filter((q) => q.trim());
    if (validQuestions.length === 0) {
      toast({
        title: "Keine Fragen",
        description: "Geben Sie mindestens eine Frage ein.",
        variant: "destructive",
      });
      return;
    }
    if (fileCount === 0) {
      toast({
        title: "Keine Dateien",
        description: "Laden Sie zuerst Dateien hoch.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const a = await startExtractionAnalysis(matterId, workspaceId, validQuestions);
    setLoading(false);
    if (a) {
      setAnalysis(a);
      setResults([]);
      startPolling(a.id);
    } else {
      toast({ title: "Fehler beim Starten", variant: "destructive" });
    }
  };

  const exportCSV = () => {
    if (!analysis?.questions || results.length === 0) return;

    const qs = analysis.questions;
    const header = ["Dokument", ...qs].join(";");
    const rows = results.map((r) => {
      const data = r.extracted_data || {};
      return [
        r.file_name_suggestion || r.file_id,
        ...qs.map((q) => `"${(data[q] || "—").replace(/"/g, '""')}"`),
      ].join(";");
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "extraktion.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const isProcessing =
    analysis?.status === "pending" || analysis?.status === "processing";

  // No analysis yet — show question input
  if (!analysis || analysis.status === "error") {
    return (
      <div className="space-y-6">
        {analysis?.status === "error" && (
          <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20">
            <p className="text-[13px] text-destructive/80">
              {analysis.error_message || "Ein Fehler ist aufgetreten."}
            </p>
          </div>
        )}

        <div className="flex flex-col items-center justify-center py-10 gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/5 flex items-center justify-center">
            <TableProperties className="h-7 w-7 text-primary/40" />
          </div>
          <div className="text-center">
            <h3 className="text-[15px] font-semibold text-foreground/80">
              Informationen extrahieren
            </h3>
            <p className="text-[13px] text-muted-foreground/50 mt-1 max-w-md">
              Stellen Sie Fragen an Ihre Dokumente. Die KI extrahiert die Antworten in eine
              strukturierte Tabelle.
            </p>
          </div>
        </div>

        <div className="space-y-2 max-w-lg mx-auto">
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={q}
                onChange={(e) => {
                  const next = [...questions];
                  next[i] = e.target.value;
                  setQuestions(next);
                }}
                placeholder={`Frage ${i + 1}, z.B. "Welche Fristen gibt es?"`}
                className="text-[13px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && q.trim()) {
                    setQuestions([...questions, ""]);
                  }
                }}
              />
              {questions.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="text-[12px] text-muted-foreground/50"
            onClick={() => setQuestions([...questions, ""])}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Weitere Frage
          </Button>
        </div>

        <div className="flex justify-center">
          <Button onClick={handleStart} disabled={loading || fileCount === 0}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Extraktion starten
          </Button>
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
        <p className="text-[14px] text-muted-foreground/60">
          Informationen werden extrahiert…
        </p>
      </div>
    );
  }

  // Show results table
  const qs = analysis.questions || [];
  const filteredResults = searchFilter
    ? results.filter((r) => {
        const data = r.extracted_data || {};
        const allText = Object.values(data).join(" ").toLowerCase();
        return allText.includes(searchFilter.toLowerCase());
      })
    : results;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
            <Input
              placeholder="Ergebnisse filtern…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="h-8 text-[12px] pl-8 w-56"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[12px]"
            onClick={() => {
              setAnalysis(null);
              setResults([]);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Neue Extraktion
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            CSV Export
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border/30 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[12px] font-semibold w-[180px]">Dokument</TableHead>
              {qs.map((q, i) => (
                <TableHead key={i} className="text-[12px] font-semibold">
                  {q}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredResults.map((r) => {
              const data = r.extracted_data || {};
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-[12px] font-medium">
                    {r.file_name_suggestion || r.file_id.slice(0, 8)}
                  </TableCell>
                  {qs.map((q, i) => (
                    <TableCell key={i} className="text-[12px] text-foreground/70">
                      {data[q] || "—"}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
