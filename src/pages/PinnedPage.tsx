import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { fetchPinnedMessages, type PinnedMessage } from "@/lib/pin-api";
import { supabase } from "@/lib/supabase-safe";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pin, Search, MessageSquare, ExternalLink, Calendar } from "lucide-react";

interface EnrichedPin extends PinnedMessage {
  messageText?: string;
  chatTitle?: string;
}

export default function PinnedPage() {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pins, setPins] = useState<EnrichedPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!activeWorkspace?.id) return;
    setLoading(true);

    fetchPinnedMessages(activeWorkspace.id).then(async (raw) => {
      // Enrich with message content and chat titles
      const messageIds = raw.map(p => p.message_id);
      const chatIds = [...new Set(raw.map(p => p.chat_id))];

      const [msgRes, chatRes] = await Promise.all([
        messageIds.length > 0
          ? supabase.from("messages").select("id, content").in("id", messageIds)
          : Promise.resolve({ data: [] }),
        chatIds.length > 0
          ? supabase.from("chats").select("id, title").in("id", chatIds)
          : Promise.resolve({ data: [] }),
      ]);

      const msgMap = new Map((msgRes.data || []).map((m: any) => [m.id, m.content?.text || ""]));
      const chatMap = new Map((chatRes.data || []).map((c: any) => [c.id, c.title || "Unbenannter Chat"]));

      const enriched: EnrichedPin[] = raw.map(p => ({
        ...p,
        messageText: msgMap.get(p.message_id) || "",
        chatTitle: chatMap.get(p.chat_id) || "Unbenannter Chat",
      }));

      setPins(enriched);
      setLoading(false);
    });
  }, [activeWorkspace?.id]);

  const filtered = useMemo(() => {
    if (!search.trim()) return pins;
    const q = search.toLowerCase();
    return pins.filter(p =>
      (p.messageText || "").toLowerCase().includes(q) ||
      (p.chatTitle || "").toLowerCase().includes(q) ||
      (p.note || "").toLowerCase().includes(q)
    );
  }, [pins, search]);

  return (
    <PageContainer>
      <PageHeader
        title="Gepinnte Antworten"
        description="Alle gespeicherten Antworten aus Ihren Chats"
      />

      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Gepinnte Antworten durchsuchen…"
            className="pl-10 rounded-xl border-border/30"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 border-2 border-foreground/15 border-t-foreground rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Pin}
          title={search ? "Keine Ergebnisse" : "Keine gepinnten Antworten"}
          description={search ? "Versuchen Sie einen anderen Suchbegriff." : "Pinnen Sie wichtige Antworten im Chat, um sie hier wiederzufinden."}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(pin => (
            <div
              key={pin.id}
              className="group rounded-2xl border border-border/30 bg-card/70 p-5 hover:border-border/50 hover:shadow-sm transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Pin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="text-[13px] font-medium truncate">{pin.chatTitle}</span>
                  <Badge variant="secondary" className="text-[9px] h-4 shrink-0">
                    <Calendar className="h-2.5 w-2.5 mr-1" />
                    {new Date(pin.created_at).toLocaleDateString("de-DE")}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-[11px] text-muted-foreground/40 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => navigate(`/app/chat/${pin.chat_id}`)}
                >
                  <ExternalLink className="h-3 w-3 mr-1" /> Zum Chat
                </Button>
              </div>

              <p className="text-[13px] text-foreground/70 leading-relaxed line-clamp-4">
                {(pin.messageText || "").slice(0, 400)}
                {(pin.messageText || "").length > 400 && "…"}
              </p>

              {pin.note && (
                <p className="mt-2 text-[11px] text-muted-foreground/50 italic">
                  Notiz: {pin.note}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
