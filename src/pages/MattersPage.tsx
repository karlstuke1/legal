import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/lib/workspace";
import { fetchMatters, createMatter, deleteMatter, assignChatToMatter, type Matter } from "@/lib/matters-api";
import { fetchChats } from "@/lib/chat-api";
import { supabase } from "@/lib/supabase-safe";
import type { Chat } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FolderOpen, Plus, MessageSquare, FileText, Trash2, Search, Loader2, ArrowRight,
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "@/hooks/use-toast";
import MatterStatusBadge from "@/components/matter/MatterStatusBadge";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";

interface MatterWithCounts extends Matter {
  chatCount: number;
  fileCount: number;
  status?: string;
}

export default function MattersPage() {
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [matters, setMatters] = useState<MatterWithCounts[]>([]);
  const [unassignedChats, setUnassignedChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assigningChatId, setAssigningChatId] = useState<string | null>(null);

  const load = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const [rawMatters, chats] = await Promise.all([
        fetchMatters(activeWorkspace.id),
        fetchChats(activeWorkspace.id),
      ]);

      const { data: files } = await supabase
        .from("files")
        .select("matter_id")
        .eq("workspace_id", activeWorkspace.id)
        .not("matter_id", "is", null);

      const chatCounts = new Map<string, number>();
      const fileCounts = new Map<string, number>();
      const unassigned: Chat[] = [];

      for (const c of chats) {
        if (c.matter_id) chatCounts.set(c.matter_id, (chatCounts.get(c.matter_id) || 0) + 1);
        else unassigned.push(c);
      }
      for (const f of files || []) {
        if (f.matter_id) fileCounts.set(f.matter_id, (fileCounts.get(f.matter_id) || 0) + 1);
      }

      setMatters(rawMatters.map((m) => ({ ...m, chatCount: chatCounts.get(m.id) || 0, fileCount: fileCounts.get(m.id) || 0 })));
      setUnassignedChats(unassigned);
    } catch (err) {
      console.error("MattersPage load error:", err);
      toast({ title: "Fehler beim Laden", description: "Bitte Seite neu laden.", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [activeWorkspace?.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || !activeWorkspace) return;
    setCreating(true);
    try {
      const result = await createMatter(activeWorkspace.id, trimmed);
      if (result.data) {
        setNewName("");
        toast({ title: "Akte erstellt", description: result.data.name });
        await load();
      } else {
        toast({ title: "Fehler", description: result.error || "Akte konnte nicht erstellt werden.", variant: "destructive" });
      }
    } catch (err) {
      console.error("handleCreate error:", err);
      toast({ title: "Fehler", variant: "destructive" });
    }
    setCreating(false);
  };

  const handleDelete = async (e: React.MouseEvent, matter: MatterWithCounts) => {
    e.stopPropagation();
    if (matter.chatCount > 0 || matter.fileCount > 0) {
      toast({ title: "Akte nicht leer", description: "Entferne zuerst alle Chats und Dateien.", variant: "destructive" });
      return;
    }
    const ok = await deleteMatter(matter.id);
    if (ok) {
      setMatters((prev) => prev.filter((m) => m.id !== matter.id));
      toast({ title: "Akte gelöscht" });
    }
  };

  const handleAssignChat = async (chatId: string, matterId: string) => {
    setAssigningChatId(chatId);
    try {
      const result = await assignChatToMatter(chatId, matterId);
      if (result.ok) {
        toast({ title: "Chat zugeordnet" });
        await load();
      } else {
        toast({ title: "Zuordnung fehlgeschlagen", variant: "destructive" });
      }
    } catch (err) {
      console.error("handleAssignChat error:", err);
      toast({ title: "Fehler", variant: "destructive" });
    }
    setAssigningChatId(null);
  };

  const filtered = matters.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || (m.status || "active") === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <PageContainer>
      <div className="flex items-center gap-2">
        <SidebarTrigger className="h-7 w-7 shrink-0" />
        <PageHeader
          title="Mandantenakten"
          description={`${matters.length} ${matters.length === 1 ? "Akte" : "Akten"} · Chats und Dokumente organisieren`}
        />
      </div>

      {/* Search + Create */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Akte suchen…"
            className="pl-9 h-10 rounded-xl border-border/40 bg-muted/20 text-[14px]"
          />
        </div>
        <form onSubmit={handleCreate} className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Neue Akte…"
            className="flex-1 sm:w-52 sm:flex-none h-10 rounded-xl border-border/40 bg-muted/20 text-[14px]"
          />
          <Button
            type="submit"
            disabled={!newName.trim() || creating}
            className="h-10 rounded-xl px-4 text-[13px] bg-foreground text-background hover:bg-foreground/90 shrink-0"
          >
            {creating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Anlegen
          </Button>
        </form>
      </div>

      {/* Status Filter */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mt-4">
        {[
          { key: "all", label: "Alle" },
          { key: "active", label: "Aktiv" },
          { key: "archived", label: "Archiviert" },
          { key: "closed", label: "Abgeschlossen" },
        ].map((f) => (
          <Button
            key={f.key}
            variant={statusFilter === f.key ? "default" : "ghost"}
            size="sm"
            className={`h-7 text-[12px] rounded-lg ${statusFilter === f.key ? "bg-foreground text-background" : "text-muted-foreground/50"}`}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <LoadingSpinner fullPage />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={search ? "Keine Akten gefunden" : "Noch keine Akten angelegt"}
          description="Erstellen Sie eine neue Akte, um Chats und Dokumente zu organisieren."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((matter) => (
            <button
              key={matter.id}
              onClick={() => navigate(`/app/matters/${matter.id}`)}
              className="w-full text-left group flex items-center gap-4 p-4 rounded-xl border border-border/30 bg-card/50 hover:bg-card hover:border-border/50 hover:shadow-md hover:shadow-foreground/[0.02] transition-all duration-300"
            >
              <div className="h-10 w-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center shrink-0">
                <FolderOpen className="h-5 w-5 text-foreground/30" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-medium text-foreground truncate">{matter.name}</p>
                  <MatterStatusBadge status={matter.status || "active"} readOnly />
                </div>
                <div className="flex items-center gap-4 mt-1">
                  <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground/40">
                    <MessageSquare className="h-3 w-3" />{matter.chatCount} {matter.chatCount === 1 ? "Chat" : "Chats"}
                  </span>
                  <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground/40">
                    <FileText className="h-3 w-3" />{matter.fileCount} {matter.fileCount === 1 ? "Datei" : "Dateien"}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all"
                onClick={(e) => handleDelete(e, matter)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </button>
          ))}
        </div>
      )}

      {/* Unassigned Chats */}
      {!loading && unassignedChats.length > 0 && matters.length > 0 && (
        <section>
          <h2 className="text-[16px] font-semibold text-foreground mb-1">Chats ohne Akte</h2>
          <p className="text-[13px] text-muted-foreground/40 mb-4">
            {unassignedChats.length} {unassignedChats.length === 1 ? "Chat" : "Chats"} noch keiner Akte zugeordnet
          </p>
          <div className="space-y-2">
            {unassignedChats.map((chat) => (
              <div key={chat.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-xl border border-border/30 bg-card/50">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <MessageSquare className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                  <span className="flex-1 text-[14px] text-foreground truncate">{chat.title || "Neuer Chat"}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 hidden sm:block" />
                  <Select disabled={assigningChatId === chat.id} onValueChange={(matterId) => handleAssignChat(chat.id, matterId)}>
                    <SelectTrigger className="w-full sm:w-44 h-8 text-[13px] rounded-lg border-border/40">
                      <SelectValue placeholder={assigningChatId === chat.id ? "Wird zugeordnet…" : "Akte wählen…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {matters.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-[13px]">{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </PageContainer>
  );
}
