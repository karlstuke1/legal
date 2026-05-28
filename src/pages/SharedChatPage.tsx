import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase-safe";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Scale, AlertTriangle, ExternalLink } from "lucide-react";
import { mdComponents } from "@/components/chat/markdown-config";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";

interface SharedMessage {
  id: string;
  role: string;
  content: { text: string };
  created_at: string;
}

export default function SharedChatPage() {
  const { token } = useParams<{ token: string }>();
  const [messages, setMessages] = useState<SharedMessage[]>([]);
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    loadSharedChat(token);
  }, [token]);

  async function loadSharedChat(shareToken: string) {
    setLoading(true);
    try {
      // Fetch via edge function (no auth needed)
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shared-chat?token=${encodeURIComponent(shareToken)}`,
        { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setError(data.error || "Dieser Link ist ungültig oder abgelaufen.");
        return;
      }

      const data = await resp.json();
      setChatTitle(data.title);
      setMessages(data.messages || []);
    } catch {
      setError("Fehler beim Laden des geteilten Chats.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-foreground/15 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-sm text-center space-y-4">
          <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <h1 className="text-lg font-semibold text-foreground/80">{error}</h1>
          <Link to="/">
            <Button variant="outline" size="sm">Zur Startseite</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={chatTitle ? `${chatTitle} – Geteilte Recherche` : "Geteilte Recherche | Legal AI"}
        description="KI-gestützte juristische Recherche – geteilt über Legal AI. Quellenverifizierte Antworten mit Direktlinks zu Primärquellen."
        noindex
      />
      <div className="sticky top-0 z-10 border-b border-border/30 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-foreground/40" />
            <h1 className="text-sm font-medium text-foreground/70 truncate">{chatTitle || "Geteilte Recherche"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/40 bg-muted/30 px-2 py-0.5 rounded-full">Schreibgeschützt</span>
            <Link to="/auth">
              <Button variant="ghost" size="sm" className="h-7 text-[12px] gap-1.5">
                <ExternalLink className="h-3 w-3" /> Anmelden
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="mx-auto max-w-4xl py-6 sm:py-10 px-4 sm:px-6">
        {/* AI transparency notice */}
        <div className="mb-8 mx-auto max-w-md rounded-xl border border-border/30 bg-muted/30 px-4 py-3 text-center">
          <p className="text-[11px] leading-relaxed text-muted-foreground/60">
            <span className="font-medium text-foreground/50">KI-Transparenzhinweis</span> (Art. 50 AI Act): Diese Inhalte wurden von KI generiert und ersetzen keine anwaltliche Beratung.
          </p>
        </div>

        <div className="space-y-6 sm:space-y-8">
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  <div className="bg-foreground/[0.06] rounded-2xl px-4 sm:px-5 py-2.5 sm:py-3 max-w-[92%] sm:max-w-[85%]">
                    <p className="text-[14px] sm:text-[14.5px] leading-[1.7] text-foreground whitespace-pre-wrap">{msg.content.text}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="mt-0.5 flex-shrink-0 h-7 w-7 rounded-full bg-foreground/[0.05] hidden sm:flex items-center justify-center">
                    <Scale className="h-3.5 w-3.5 text-foreground/35" />
                  </div>
                  <div className="flex-1 min-w-0 chat-prose max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                      {msg.content.text}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-border/20 text-center">
          <p className="text-[12px] text-muted-foreground/40">
            Erstellt mit dem KI-Rechtsassistenten · <Link to="/" className="underline hover:text-foreground transition-colors">Mehr erfahren</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
