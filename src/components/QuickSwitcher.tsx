import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/lib/workspace";
import { fetchChats } from "@/lib/chat-api";
import { fetchMatters, type Matter } from "@/lib/matters-api";
import type { Chat } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { MessageSquare, FolderOpen, Plus, Search } from "lucide-react";

export function QuickSwitcher() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Load data when opened
  useEffect(() => {
    if (open && activeWorkspace) {
      fetchChats(activeWorkspace.id).then(setChats);
      fetchMatters(activeWorkspace.id).then(setMatters);
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open, activeWorkspace?.id]);

  const q = query.toLowerCase();
  const filteredChats = q
    ? chats.filter(c => (c.title || "").toLowerCase().includes(q))
    : chats.slice(0, 8);
  const filteredMatters = q
    ? matters.filter(m => m.name.toLowerCase().includes(q))
    : matters.slice(0, 5);

  const items = [
    { type: "action" as const, label: "Neuer Chat", icon: Plus, path: "/app/chat" },
    ...filteredMatters.map(m => ({ type: "matter" as const, label: m.name, icon: FolderOpen, path: `/app/matters/${m.id}` })),
    ...filteredChats.map(c => ({ type: "chat" as const, label: c.title || "Neuer Chat", icon: MessageSquare, path: `/app/chat/${c.id}` })),
  ];

  const handleSelect = useCallback((path: string) => {
    navigate(path);
    setOpen(false);
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && items[selectedIndex]) {
      e.preventDefault();
      handleSelect(items[selectedIndex].path);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden rounded-2xl border-border/50 shadow-2xl">
        <DialogTitle className="sr-only">Quick-Switcher</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border/30 px-4 h-12">
          <Search className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Chat oder Akte suchen…"
            className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground/40 font-mono">
            ESC
          </kbd>
        </div>
        <div className="max-h-[360px] overflow-y-auto py-2">
          {items.length === 0 && (
            <p className="text-center text-[13px] text-muted-foreground/40 py-8">Keine Ergebnisse</p>
          )}
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={`${item.type}-${item.path}`}
                onClick={() => handleSelect(item.path)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors ${
                  i === selectedIndex
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/70 hover:bg-muted/20"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${
                  item.type === "action" ? "text-foreground/50" : "text-muted-foreground/40"
                }`} />
                <span className="text-[13px] truncate flex-1">{item.label}</span>
                <span className="text-[10px] text-muted-foreground/30 uppercase tracking-wider shrink-0">
                  {item.type === "action" ? "" : item.type === "matter" ? "Akte" : "Chat"}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
