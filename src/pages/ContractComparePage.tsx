import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/lib/supabase-safe";
import { validateFile } from "@/lib/file-upload";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Upload, ArrowLeftRight, Loader2, FileText, AlertTriangle, CheckCircle2, MinusCircle } from "lucide-react";

interface DiffClause {
  title: string;
  docA: string;
  docB: string;
  change: "added" | "removed" | "modified" | "unchanged";
  summary: string;
  risk: "high" | "medium" | "low" | "none";
}

interface CompareResult {
  summary: string;
  clauses: DiffClause[];
  overallRisk: string;
}

export default function ContractComparePage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const inputARef = useRef<HTMLInputElement>(null);
  const inputBRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (setter: (f: File | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) { toast({ title: "Fehler", description: err, variant: "destructive" }); return; }
    setter(file);
    setResult(null);
  };

  const handleCompare = async () => {
    if (!fileA || !fileB || !user || !activeWorkspace) return;
    setComparing(true);
    setResult(null);

    try {
      // Upload both files to storage temporarily
      const uploadTemp = async (file: File) => {
        const ext = file.name.split(".").pop() || "";
        const path = `${activeWorkspace.id}/compare/${crypto.randomUUID()}.${ext}`;
        await supabase.storage.from("workspace-files").upload(path, file, { cacheControl: "3600" });
        return path;
      };

      const [pathA, pathB] = await Promise.all([uploadTemp(fileA), uploadTemp(fileB)]);

      const { data, error } = await supabase.functions.invoke("contract-compare", {
        body: {
          workspace_id: activeWorkspace.id,
          file_a: { storage_path: pathA, name: fileA.name, mime: fileA.type },
          file_b: { storage_path: pathB, name: fileB.name, mime: fileB.type },
        },
      });

      if (error) throw error;
      setResult(data as CompareResult);
    } catch (err: any) {
      console.error("Compare error:", err);
      toast({ title: "Vergleich fehlgeschlagen", description: err.message || "Bitte versuchen Sie es erneut.", variant: "destructive" });
    } finally {
      setComparing(false);
    }
  };

  const riskColors = {
    high: "text-destructive bg-destructive/10 border-destructive/20",
    medium: "text-amber-600 bg-amber-500/10 border-amber-500/20",
    low: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
    none: "text-muted-foreground bg-muted/30 border-border/30",
  };

  const changeIcons = {
    added: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    removed: <MinusCircle className="h-4 w-4 text-destructive" />,
    modified: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    unchanged: <CheckCircle2 className="h-4 w-4 text-muted-foreground/30" />,
  };

  const changeLabels = { added: "Neu", removed: "Entfernt", modified: "Geändert", unchanged: "Unverändert" };

  return (
    <PageContainer>
      <PageHeader
        title="Vertragsvergleich"
        description="Zwei Vertragsentwürfe vergleichen und Unterschiede mit KI-Zusammenfassung anzeigen."
      />

      {/* Upload Area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {[{ file: fileA, setter: setFileA, ref: inputARef, label: "Dokument A (Original)" },
          { file: fileB, setter: setFileB, ref: inputBRef, label: "Dokument B (Entwurf)" }].map(({ file, setter, ref, label }) => (
          <div
            key={label}
            onClick={() => ref.current?.click()}
            className="cursor-pointer flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed border-border/30 hover:border-primary/30 bg-card/30 hover:bg-card/50 transition-all"
          >
            <input ref={ref} type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFileSelect(setter)} />
            {file ? (
              <>
                <FileText className="h-8 w-8 text-primary/50" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground/50">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground/30" />
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground/60">{label}</p>
                  <p className="text-[11px] text-muted-foreground/30">PDF, DOCX oder TXT</p>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-center mb-8">
        <Button
          onClick={handleCompare}
          disabled={!fileA || !fileB || comparing}
          className="gap-2 rounded-xl px-6"
          size="lg"
        >
          {comparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
          {comparing ? "Wird verglichen..." : "Vergleichen"}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="p-5 rounded-xl border border-border/30 bg-card/50">
            <h3 className="text-sm font-semibold text-foreground mb-2">Zusammenfassung</h3>
            <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap">{result.summary}</p>
            {result.overallRisk && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 text-[12px] font-medium">
                Gesamtrisiko: <span className="font-semibold">{result.overallRisk}</span>
              </div>
            )}
          </div>

          {/* Clause-by-clause diff */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Klausel-Vergleich</h3>
            {result.clauses.map((clause, i) => (
              <div key={i} className={`p-4 rounded-xl border ${riskColors[clause.risk]} transition-all`}>
                <div className="flex items-center gap-2 mb-2">
                  {changeIcons[clause.change]}
                  <span className="text-sm font-medium">{clause.title}</span>
                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-background/50 font-medium">
                    {changeLabels[clause.change]}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed mb-3">{clause.summary}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-background/50">
                    <p className="text-[10px] font-medium text-muted-foreground/50 mb-1">Dokument A</p>
                    <p className="text-[11px] leading-relaxed text-foreground/70 whitespace-pre-wrap">
                      {clause.docA || "—"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-background/50">
                    <p className="text-[10px] font-medium text-muted-foreground/50 mb-1">Dokument B</p>
                    <p className="text-[11px] leading-relaxed text-foreground/70 whitespace-pre-wrap">
                      {clause.docB || "—"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
