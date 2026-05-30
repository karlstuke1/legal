import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MessageSquare, Pencil, Trash2, Check, X, MoreHorizontal } from "lucide-react";
import { SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { updateChatTitle, deleteChat } from "@/lib/chat-api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Chat } from "@/lib/types";
import { NAV_ACTIVE } from "@/lib/utils";

interface Props {
  chat: Chat;
  indent?: boolean;
  onDeleted: (id: string) => void;
  onRenamed: (id: string, title: string) => void;
}

export function SidebarChatItem({ chat, indent, onDeleted, onRenamed }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(chat.title || "");
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = location.pathname === `/app/chat/${chat.id}`;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleRename = async () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== chat.title) {
      await updateChatTitle(chat.id, trimmed);
      onRenamed(chat.id, trimmed);
    }
    setEditing(false);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isActive) navigate("/app/chat");
    await deleteChat(chat.id);
    onDeleted(chat.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRename();
    if (e.key === "Escape") { setEditing(false); setEditValue(chat.title || ""); }
  };

  if (editing) {
    return (
      <SidebarMenuItem>
        <div className={`flex items-center gap-1 px-2 py-1 ${indent ? "pl-7" : ""}`}>
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleRename}
            className="flex-1 bg-transparent text-[13px] text-foreground border border-border/50 rounded px-1.5 py-0.5 focus:outline-none focus:border-primary/50"
          />
          <button onClick={handleRename} className="p-0.5 text-muted-foreground hover:text-foreground">
            <Check className="h-3 w-3" />
          </button>
          <button onClick={() => { setEditing(false); setEditValue(chat.title || ""); }} className="p-0.5 text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>
      </SidebarMenuItem>
    );
  }

  const isTouchDevice = typeof window !== "undefined" && "ontouchstart" in window;

  return (
    <SidebarMenuItem
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <SidebarMenuButton asChild>
        <NavLink
          to={`/app/chat/${chat.id}`}
          end
          className={`rounded-lg text-muted-foreground hover:text-foreground ${indent ? "pl-7" : ""}`}
          activeClassName={NAV_ACTIVE}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-40" />
          <span className="truncate text-[13px] flex-1">{chat.title || "Neuer Chat"}</span>
          {/* Desktop: show on hover. Touch: always show ellipsis */}
          {(hovered || isTouchDevice) && (
            isTouchDevice ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); }}
                    className="p-1 rounded-md hover:bg-accent/80 text-muted-foreground/40 hover:text-foreground transition-colors shrink-0 ml-auto"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" side="bottom" className="w-36 p-1.5">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditValue(chat.title || ""); setEditing(true); }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-foreground/70 hover:bg-accent transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Umbenennen
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Löschen
                  </button>
                </PopoverContent>
              </Popover>
            ) : (
              <span className="flex items-center gap-0.5 shrink-0 ml-auto" onClick={e => e.preventDefault()}>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditValue(chat.title || ""); setEditing(true); }}
                  className="p-0.5 rounded hover:bg-accent/80 text-muted-foreground/50 hover:text-foreground transition-colors"
                  title="Umbenennen"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground/50 hover:text-destructive transition-colors"
                  title="Löschen"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            )
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
