import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/lib/supabase-safe";
import { fetchChats } from "@/lib/chat-api";
import {
  updateMatter, deleteMatter, updateMatterStatus,
  fetchMatterTags, fetchMatterNotes,
  type Matter, type MatterTag, type MatterNote,
} from "@/lib/matters-api";
import type { Chat } from "@/lib/types";
import { MODE_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  FolderOpen, ArrowLeft, MessageSquare, FileText, Trash2, Pencil,
  Check, X, ExternalLink, Sparkles, TableProperties, ShieldCheck,
} from "lucide-react";
import DocumentUploadZone from "@/components/matter/DocumentUploadZone";
import FlowAnalysis from "@/components/matter/FlowAnalysis";
import ExtractionTable from "@/components/matter/ExtractionTable";
import MatterStatusBadge from "@/components/matter/MatterStatusBadge";
import MatterTags from "@/components/matter/MatterTags";
import MatterNotes from "@/components/matter/MatterNotes";
import { readFileAsText } from "@/lib/pseudonymize-client";
import PseudonymizeDialog from "@/components/matter/PseudonymizeDialog";
import { useAuth } from "@/lib/auth";

interface FileRecord {
  id: string;
  name: string;
  mime: string;
  size: number;
  created_at: string;
}

export default function MatterDetailPage() {
  const { matterId } = useParams<{ matterId: string }>();
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();

  const [matter, setMatter] = useState<(Matter & { status?: string }) | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [tags, setTags] = useState<MatterTag[]>([]);
  const [notes, setNotes] = useState<MatterNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [pseudoDialog, setPseudoDialog] = useState<{ text: string; fileName: string } | null>(null);
  const pseudoFileRef = React.useRef<HTMLInputElement>(null);

  const loadData = async () => {
    if (!matterId || !activeWorkspace) return;
    setLoading(true);

    try {
      const [matterRes, allChats, filesRes, tagsRes, notesRes] = await Promise.all([
        supabase.from("matters").select("*").eq("id", matterId).single(),
        fetchChats(activeWorkspace.id),
        supabase.from("files").select("id, name, mime, size, created_at").eq("matter_id", matterId),
        fetchMatterTags(matterId),
        fetchMatterNotes(matterId),
      ]);

      if (matterRes.data) {
        const m = matterRes.data as unknown as Matter & { status?: string };
        setMatter(m);
        setEditName(m.name);
      }
      setChats(allChats.filter((c) => c.matter_id === matterId));
      setFiles((filesRes.data || []) as unknown as FileRecord[]);
      setTags(tagsRes);
      setNotes(notesRes);
    } catch (error) {
      console.error("Failed to load matter data:", error);
      toast({ title: "Fehler beim Laden", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [matterId, activeWorkspace?.id]);

  const handleRename = async () => {
    if (!matter || !editName.trim()) return;
    try {
      const ok = await updateMatter(matter.id, editName.trim());
      if (ok) {
        setMatter({ ...matter, name: editName.trim() });
        setEditing(false);
        toast({ title: "Akte umbenannt" });
      }
    } catch (error) {
      console.error("Rename failed:", error);
      toast({ title: "Fehler beim Umbenennen", variant: "destructive" });
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!matter) return;
    try {
      const ok = await updateMatterStatus(matter.id, status);
      if (ok) {
        setMatter({ ...matter, status });
        toast({ title: `Status: ${status === "active" ? "Aktiv" : status === "archived" ? "Archiviert" : "Abgeschlossen"}` });
      }
    } catch (error) {
      console.error("Status change failed:", error);
      toast({ title: "Fehler beim Ändern", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!matter) return;
    if (chats.length > 0 || files.length > 0) {
      toast({ title: "Akte nicht leer", description: "Entferne zuerst alle Chats und Dateien.", variant: "destructive" });
      return;
    }
    try {
      const ok = await deleteMatter(matter.id);
      if (ok) {
        toast({ title: "Akte gelöscht" });
        navigate("/app/matters");
      }
    } catch (error) {
      console.error("Delete failed:", error);
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    }
  };

  const handlePseudoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const supported = [".txt", ".md", ".csv", ".rtf", ".log", ".xml", ".json", ".html"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!supported.includes(ext)) {
      toast({
        title: "Format nicht unterstützt",
        description: "Bitte lade eine Textdatei hoch (.txt, .md, .csv, .html, .xml). PDFs und DOCX können nicht lokal verarbeitet werden.",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }
    try {
      const text = await readFileAsText(file);
      setPseudoDialog({ text, fileName: file.name });
    } catch {
      toast({ title: "Datei konnte nicht gelesen werden", variant: "destructive" });
    }
    e.target.value = "";
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (!matter) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <FolderOpen className="h-10 w-10 text-muted-foreground/20" />
        <p className="text-muted-foreground/50 text-sm">Akte nicht gefunden</p>
        <Button variant="ghost" size="sm" onClick={() => navigate("/app/matters")}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Zurück
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl py-6 sm:py-10 px-4 sm:px-6">
        {/* Back */}
        <motion.button
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate("/app/matters")}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground/50 hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Alle Akten
        </motion.button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-foreground/[0.04] border border-border/30 flex items-center justify-center shrink-0">
                <FolderOpen className="h-6 w-6 sm:h-7 sm:w-7 text-foreground/25" />
              </div>
              {editing ? (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="h-10 rounded-xl text-lg font-semibold w-52 sm:w-72"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename();
                      if (e.key === "Escape") { setEditing(false); setEditName(matter.name); }
                    }} autoFocus />
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={handleRename}>
                    <Check className="h-4 w-4 text-emerald-600" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setEditing(false); setEditName(matter.name); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="min-w-0 pt-0.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">{matter.name}</h1>
                    <MatterStatusBadge status={matter.status || "active"} onStatusChange={handleStatusChange} />
                  </div>
                  <p className="text-[13px] text-muted-foreground/40 mt-1">
                    Erstellt am {new Date(matter.created_at).toLocaleDateString("de-DE", {
                      day: "numeric", month: "long", year: "numeric"
                    })}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 pl-16 sm:pl-0 shrink-0">
              {!editing && (
                <Button variant="ghost" size="sm"
                  className="h-9 px-3 text-[13px] text-muted-foreground/60 hover:text-foreground rounded-xl gap-1.5"
                  onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />Umbenennen
                </Button>
              )}
              <Button variant="ghost" size="sm"
                className="h-9 px-3 text-[13px] text-muted-foreground/60 hover:text-destructive rounded-xl gap-1.5"
                onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5" />Löschen
              </Button>
            </div>
          </div>

          {/* Tags */}
          <div className="mt-4 pl-16 sm:pl-[72px]">
            <MatterTags tags={tags} matterId={matterId!} workspaceId={activeWorkspace!.id} onTagsChange={setTags} />
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          <Tabs defaultValue="overview" className="space-y-8">
            <TabsList className="bg-muted/30 p-1 rounded-xl h-auto gap-0.5">
              <TabsTrigger value="overview" className="text-[13px] gap-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
                <FolderOpen className="h-3.5 w-3.5" />Übersicht
              </TabsTrigger>
              <TabsTrigger value="flow" className="text-[13px] gap-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
                <Sparkles className="h-3.5 w-3.5" />Aufbereitung
              </TabsTrigger>
              <TabsTrigger value="extraction" className="text-[13px] gap-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2">
                <TableProperties className="h-3.5 w-3.5" />Extraktion
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-8">
              {/* Upload */}
              <section>
                <DocumentUploadZone workspaceId={activeWorkspace!.id} matterId={matterId!} onUploadComplete={loadData} />
              </section>

              {/* Notes */}
              {user && (
                <section className="rounded-2xl border border-border/30 bg-card/20 p-5 sm:p-6">
                  <MatterNotes notes={notes} matterId={matterId!} workspaceId={activeWorkspace!.id} userId={user.id} onNotesChange={setNotes} />
                </section>
              )}

              {/* Chats */}
              <section className="rounded-2xl border border-border/30 bg-card/20 p-5 sm:p-6">
                <h2 className="text-[14px] font-semibold text-foreground/80 mb-4 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground/40" />
                  Chats
                  <span className="text-muted-foreground/40 font-normal">({chats.length})</span>
                </h2>
                {chats.length === 0 ? (
                  <div className="py-8 text-center">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/15 mx-auto mb-2" />
                    <p className="text-[13px] text-muted-foreground/40">Noch keine Chats in dieser Akte</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {chats.map((chat) => (
                      <button key={chat.id} onClick={() => navigate(`/app/chat/${chat.id}`)}
                        className="w-full text-left flex items-center gap-3 p-3.5 rounded-xl border border-border/20 bg-background/50 hover:bg-background hover:border-border/40 hover:shadow-sm transition-all duration-200 group">
                        <div className="h-9 w-9 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                          <MessageSquare className="h-4 w-4 text-muted-foreground/40" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-foreground truncate">{chat.title || "Neuer Chat"}</p>
                          <p className="text-[11px] text-muted-foreground/40 mt-0.5">
                            Chat / {MODE_LABELS[chat.mode]} · {new Date(chat.updated_at).toLocaleDateString("de-DE")}
                          </p>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Pseudonymization — direct local file upload */}
              <section className="rounded-2xl border border-border/30 bg-card/20 p-5 sm:p-6">
                <h2 className="text-[14px] font-semibold text-foreground/80 mb-1 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground/40" />
                  Pseudonymisierung
                </h2>
                <p className="text-[12px] text-muted-foreground/50 mb-4">
                  Komplett lokal im Browser — keine Daten verlassen dein Gerät.
                </p>
                <input
                  ref={pseudoFileRef}
                  type="file"
                  accept=".txt,.md,.csv,.rtf,.log,.xml,.json,.html"
                  className="hidden"
                  onChange={handlePseudoFileSelect}
                />
                <button
                  onClick={() => pseudoFileRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-border/40 hover:border-primary/30 bg-background/50 hover:bg-primary/[0.02] transition-all duration-200 py-8 flex flex-col items-center gap-2 group"
                >
                  <div className="h-10 w-10 rounded-xl bg-muted/40 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                    <ShieldCheck className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary/60 transition-colors" />
                  </div>
                  <span className="text-[13px] font-medium text-muted-foreground/50 group-hover:text-foreground/70 transition-colors">
                    Dokument auswählen & pseudonymisieren
                  </span>
                  <span className="text-[11px] text-muted-foreground/30">
                    .txt, .md, .csv, .html, .xml — Textdateien
                  </span>
                </button>
              </section>

              {pseudoDialog && (
                <PseudonymizeDialog
                  open={!!pseudoDialog}
                  onOpenChange={(open) => { if (!open) setPseudoDialog(null); }}
                  text={pseudoDialog.text}
                  fileName={pseudoDialog.fileName}
                />
              )}

              {/* Files */}
              <section className="rounded-2xl border border-border/30 bg-card/20 p-5 sm:p-6">
                <h2 className="text-[14px] font-semibold text-foreground/80 mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground/40" />
                  Dateien
                  <span className="text-muted-foreground/40 font-normal">({files.length})</span>
                </h2>
                {files.length === 0 ? (
                  <div className="py-8 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground/15 mx-auto mb-2" />
                    <p className="text-[13px] text-muted-foreground/40">Noch keine Dateien in dieser Akte</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {files.map((file) => (
                      <div key={file.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-border/20 bg-background/50 group hover:border-border/40 transition-all">
                        <div className="h-9 w-9 rounded-lg bg-muted/40 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-muted-foreground/40" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-foreground truncate">{file.name}</p>
                          <p className="text-[11px] text-muted-foreground/40 mt-0.5">
                            {formatSize(file.size)} · {new Date(file.created_at).toLocaleDateString("de-DE")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </TabsContent>

            <TabsContent value="flow">
              <FlowAnalysis matterId={matterId!} workspaceId={activeWorkspace!.id} fileCount={files.length} />
            </TabsContent>

            <TabsContent value="extraction">
              <ExtractionTable matterId={matterId!} workspaceId={activeWorkspace!.id} fileCount={files.length} />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
}