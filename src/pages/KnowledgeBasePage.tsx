import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { fetchKnowledgeDocs, deleteKnowledgeDoc, uploadKnowledgeFile, type KnowledgeDoc } from "@/lib/knowledge-api";
import { validateFile, formatFileSize } from "@/lib/file-upload";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Upload, Trash2, FileText, BookOpen, Loader2, Search } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export default function KnowledgeBasePage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loadDocs = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    const data = await fetchKnowledgeDocs(activeWorkspace.id);
    setDocs(data);
    setLoading(false);
  }, [activeWorkspace]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user || !activeWorkspace) return;

    setUploading(true);
    let successCount = 0;

    for (const file of Array.from(files)) {
      const validationError = validateFile(file);
      if (validationError) {
        toast({ title: "Fehler", description: validationError, variant: "destructive" });
        continue;
      }
      const ok = await uploadKnowledgeFile(file, activeWorkspace.id, user.id);
      if (ok) successCount++;
      else toast({ title: "Fehler", description: `Upload von "${file.name}" fehlgeschlagen.`, variant: "destructive" });
    }

    if (successCount > 0) {
      toast({ title: `${successCount} Dokument(e) hochgeladen`, description: "Werden indexiert und stehen in Kürze als Kontext zur Verfügung." });
      // Wait a moment for embedding to start, then reload
      setTimeout(loadDocs, 2000);
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleDelete = async (doc: KnowledgeDoc) => {
    if (!activeWorkspace) return;
    await deleteKnowledgeDoc(doc.title, activeWorkspace.id);
    toast({ title: "Gelöscht", description: `"${doc.title}" wurde aus der Wissensbasis entfernt.` });
    loadDocs();
  };

  const filtered = searchQuery
    ? docs.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : docs;

  // Group by unique title
  const uniqueDocs = filtered.reduce<KnowledgeDoc[]>((acc, doc) => {
    if (!acc.find(d => d.title === doc.title)) acc.push(doc);
    return acc;
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="Kanzlei-Wissensbasis"
        description="Eigene Vorlagen, Muster und Richtlinien als permanenten Kontext für alle KI-Anfragen hochladen."
      />

      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 flex items-center gap-2 rounded-xl border border-border/30 bg-card/50 px-3 h-10">
          <Search className="h-4 w-4 text-muted-foreground/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Dokumente durchsuchen..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
          />
        </div>
        <label>
          <input
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
          <Button asChild disabled={uploading} className="gap-2 rounded-xl cursor-pointer">
            <span>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Hochladen
            </span>
          </Button>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
        </div>
      ) : uniqueDocs.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Wissensbasis leer"
          description="Laden Sie Vorlagen, Muster oder interne Richtlinien hoch. Diese werden automatisch als zusätzlicher Kontext bei Ihren KI-Anfragen berücksichtigt."
        />
      ) : (
        <div className="grid gap-3">
          {uniqueDocs.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border/30 bg-card/50 hover:bg-card/80 transition-colors group"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-primary/60" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                <p className="text-[11px] text-muted-foreground/50">
                  {format(new Date(doc.created_at), "dd. MMM yyyy, HH:mm", { locale: de })}
                  {doc.metadata?.mime && ` · ${doc.metadata.mime.split("/").pop()?.toUpperCase()}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleDelete(doc)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 p-4 rounded-xl border border-border/20 bg-muted/20">
        <h3 className="text-sm font-medium text-foreground/70 mb-1">Wie funktioniert die Wissensbasis?</h3>
        <p className="text-[12px] text-muted-foreground/50 leading-relaxed">
          Hochgeladene Dokumente werden automatisch analysiert, in Abschnitte unterteilt und mit KI-Embeddings indexiert.
          Bei jeder Recherche-Anfrage werden relevante Abschnitte aus Ihrer Wissensbasis automatisch als zusätzlicher Kontext
          mitgeliefert — neben den öffentlichen Rechtsquellen. So fließen Ihre internen Vorlagen und Muster in jede Antwort ein.
        </p>
      </div>
    </PageContainer>
  );
}
