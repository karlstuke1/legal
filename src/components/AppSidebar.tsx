import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/lib/supabase-safe";
import { useSidebarChats } from "@/hooks/use-sidebar-chats";
import { fetchMatters, type Matter } from "@/lib/matters-api";
import { useEffect, useState, useCallback } from "react";
import type { Chat } from "@/lib/types";
import { SidebarChatItem } from "@/components/sidebar/SidebarChatItem";
import { useIsAdmin } from "@/hooks/use-admin";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { NavLink } from "@/components/NavLink";
import {
  Plus,
  Settings,
  LogOut,
  Scale,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Moon,
  Sun,
  Search,
  X,
  SquarePen,
  Gift,
  BookOpen,
  ArrowLeftRight,
  Pin,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, NAV_ACTIVE } from "@/lib/utils";


function AdminBlogLink({ collapsed, location }: { collapsed: boolean; location: { pathname: string } }) {
  const { isAdmin } = useIsAdmin();
  if (!isAdmin) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/30">Admin</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location.pathname === "/app/admin/blog"}>
              <NavLink to="/app/admin/blog" className="rounded-xl" activeClassName={NAV_ACTIVE}>
                <FileText className="h-4 w-4" />
                {!collapsed && <span>Blog CMS</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { user, signOut } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { state, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const location = useLocation();
  const wsId = activeWorkspace?.id;
  const { chats, invalidate: invalidateChats } = useSidebarChats(wsId);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [expandedMatters, setExpandedMatters] = useState<Set<string>>(new Set(["unassigned"]));
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [showAllChats, setShowAllChats] = useState(false);
  const INITIAL_CHAT_LIMIT = 5;

  // Load display_name from profile
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_name) setProfileDisplayName(data.display_name);
      });
  }, [user]);
  
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains("dark"));
  const [searchQuery, setSearchQuery] = useState("");

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
      setDarkMode(true);
    }
  }, []);

  useEffect(() => {
    if (wsId) {
      fetchMatters(wsId).then(setMatters);
    }
  }, [wsId]);

  useEffect(() => {
    if (wsId && location.pathname.startsWith("/app/chat")) {
      invalidateChats();
    }
  }, [location.pathname]);

  const handleChatDeleted = useCallback((_id: string) => {}, []);
  const handleChatRenamed = useCallback((_id: string, _title: string) => {}, []);

  const toggleMatter = (id: string) => {
    setExpandedMatters(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleNewChat = () => {
    navigate("/app/chat");
    if (isMobile) setOpenMobile(false);
  };

  const filteredChats = searchQuery
    ? chats.filter(c => (c.title || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : chats;

  const chatsByMatter = new Map<string, Chat[]>();
  const unassigned: Chat[] = [];
  for (const chat of filteredChats) {
    if (chat.matter_id) {
      const list = chatsByMatter.get(chat.matter_id) || [];
      list.push(chat);
      chatsByMatter.set(chat.matter_id, list);
    } else {
      unassigned.push(chat);
    }
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);

  const groupChronologically = (list: Chat[]) => {
    const today: Chat[] = [];
    const yesterday: Chat[] = [];
    const lastWeek: Chat[] = [];
    const older: Chat[] = [];
    for (const c of list) {
      const d = new Date(c.updated_at || c.created_at);
      if (d >= todayStart) today.push(c);
      else if (d >= yesterdayStart) yesterday.push(c);
      else if (d >= weekStart) lastWeek.push(c);
      else older.push(c);
    }
    return { today, yesterday, lastWeek, older };
  };

  const userDisplayName = profileDisplayName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Nutzer";
  const userInitials = userDisplayName.slice(0, 2).toUpperCase();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/40 bg-sidebar">
      {/* Header: Search + New Chat (ChatGPT-style) */}
      <SidebarHeader className={cn("pb-2", collapsed ? "p-2 flex flex-col items-center gap-2" : "p-3")}>
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <div data-tour="sidebar-search" className="flex-1 flex items-center gap-2 rounded-xl border border-border/25 bg-foreground/[0.02] px-2.5 h-9 transition-colors focus-within:border-border/50">
              <Search className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Suche"
                className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
              />
            </div>
            <button
              data-tour="new-chat-btn"
              onClick={handleNewChat}
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-foreground text-background hover:bg-foreground/85 transition-all shadow-sm"
              title="Neuer Chat"
            >
              <SquarePen className="h-4 w-4" />
            </button>
            {isMobile && (
              <button
                onClick={() => setOpenMobile(false)}
                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl hover:bg-muted/50 transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        ) : (
          <>
            <button
              onClick={handleNewChat}
              className="h-8 w-8 flex items-center justify-center rounded-xl bg-foreground text-background hover:bg-foreground/85 transition-all shadow-sm"
              title="Neuer Chat"
            >
              <Plus className="h-4 w-4" />
            </button>
          </>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* Main navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === "/app/chat" || location.pathname.startsWith("/app/chat/")}
                >
                  <NavLink data-tour="nav-assistant" to="/app/chat" className="rounded-xl" activeClassName={NAV_ACTIVE}>
                    <Scale className="h-4 w-4" />
                    {!collapsed && <span>Assistent</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname.startsWith("/app/matters")}
                >
                  <NavLink data-tour="nav-matters" to="/app/matters" className="rounded-xl" activeClassName={NAV_ACTIVE}>
                    <FolderOpen className="h-4 w-4" />
                    {!collapsed && <span>Akten</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === "/app/knowledge"}
                >
                  <NavLink data-tour="nav-knowledge" to="/app/knowledge" className="rounded-xl" activeClassName={NAV_ACTIVE}>
                    <BookOpen className="h-4 w-4" />
                    {!collapsed && <span>Wissensbasis</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === "/app/compare"}
                >
                  <NavLink data-tour="nav-compare" to="/app/compare" className="rounded-xl" activeClassName={NAV_ACTIVE}>
                    <ArrowLeftRight className="h-4 w-4" />
                    {!collapsed && <span>Vergleich</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.pathname === "/app/pinned"}
                >
                  <NavLink data-tour="nav-pinned" to="/app/pinned" className="rounded-xl" activeClassName={NAV_ACTIVE}>
                    <Pin className="h-4 w-4" />
                    {!collapsed && <span>Gepinnt</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin section */}
        <AdminBlogLink collapsed={collapsed} location={location} />



        {!collapsed && (
          <>
            {/* Matters with chats */}
            {matters.filter(m => chatsByMatter.has(m.id)).map(matter => {
              const matterChats = chatsByMatter.get(matter.id) || [];
              const isExpanded = expandedMatters.has(matter.id);
              return (
                <SidebarGroup key={matter.id} className="mt-1">
                  <button
                    onClick={() => toggleMatter(matter.id)}
                    className="flex items-center gap-2 px-2 py-1.5 w-full text-left group"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                    )}
                    <FolderOpen
                      className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 cursor-pointer hover:text-foreground transition-colors"
                      onClick={(e) => { e.stopPropagation(); navigate(`/app/matters/${matter.id}`); }}
                    />
                    <span className="text-[12px] font-medium text-muted-foreground/70 truncate group-hover:text-foreground transition-colors">
                      {matter.name}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground/30 tabular-nums">
                      {matterChats.length}
                    </span>
                  </button>
                  {isExpanded && (
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {matterChats.map(chat => (
                          <SidebarChatItem
                            key={chat.id}
                            chat={chat}
                            indent
                            onDeleted={handleChatDeleted}
                            onRenamed={handleChatRenamed}
                          />
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  )}
                </SidebarGroup>
              );
            })}

            {/* Chronological chat history */}
            {(() => {
              const groups = groupChronologically(unassigned);
              const sections = [
                { label: "Heute", chats: groups.today },
                { label: "Gestern", chats: groups.yesterday },
                { label: "Letzte 7 Tage", chats: groups.lastWeek },
                { label: "Älter", chats: groups.older },
              ].filter(s => s.chats.length > 0);

              if (sections.length === 0) return null;

              // Flatten all chats to apply global limit
              const allChats = sections.flatMap(s => s.chats);
              const totalCount = allChats.length;
              const isLimited = !showAllChats && totalCount > INITIAL_CHAT_LIMIT;

              // Build limited sections
              let remaining = showAllChats ? Infinity : INITIAL_CHAT_LIMIT;

              return (
                <>
                  {sections.map(section => {
                    if (remaining <= 0) return null;
                    const visibleChats = section.chats.slice(0, remaining);
                    remaining -= visibleChats.length;

                    return (
                      <SidebarGroup key={section.label} className="mt-1">
                        <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/55 px-2 mb-1">
                          {section.label}
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                          <SidebarMenu>
                            {visibleChats.map(chat => (
                              <SidebarChatItem
                                key={chat.id}
                                chat={chat}
                                onDeleted={handleChatDeleted}
                                onRenamed={handleChatRenamed}
                              />
                            ))}
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </SidebarGroup>
                    );
                  })}
                  {isLimited && (
                    <button
                      onClick={() => setShowAllChats(true)}
                      className="flex items-center justify-center gap-1.5 w-full py-2 mt-1 rounded-xl text-[12px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30 transition-all"
                    >
                      <ChevronDown className="h-3 w-3" />
                      {totalCount - INITIAL_CHAT_LIMIT} weitere anzeigen
                    </button>
                  )}
                  {showAllChats && totalCount > INITIAL_CHAT_LIMIT && (
                    <button
                      onClick={() => setShowAllChats(false)}
                      className="flex items-center justify-center gap-1.5 w-full py-2 mt-1 rounded-xl text-[12px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30 transition-all"
                    >
                      <ChevronDown className="h-3 w-3 rotate-180" />
                      Weniger anzeigen
                    </button>
                  )}
                </>
              );
            })()}
          </>
        )}
      </SidebarContent>

      {/* Referral CTA */}
      {!collapsed && (
        <div className="px-2 pb-1">
          <button
            onClick={() => { navigate("/app/referral"); if (isMobile) setOpenMobile(false); }}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-2xl bg-muted/50 border border-border/40 hover:bg-muted hover:border-border/60 transition-all duration-300 text-left group"
          >
            <div className="h-7 w-7 rounded-xl bg-muted-foreground/10 group-hover:bg-muted-foreground/15 flex items-center justify-center shrink-0 transition-colors">
              <Gift className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground/70 transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-foreground/80 group-hover:text-foreground transition-colors">Freunde einladen</p>
              <p className="text-[10px] text-muted-foreground/50">20 % Provision verdienen</p>
            </div>
          </button>
        </div>
      )}
      {collapsed && (
        <div className="flex justify-center pb-1">
          <button
            onClick={() => { navigate("/app/referral"); if (isMobile) setOpenMobile(false); }}
            className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] border border-primary/[0.08] hover:from-primary/[0.1] hover:to-primary/[0.05] flex items-center justify-center transition-all duration-300 group"
            title="Freunde einladen"
          >
            <Gift className="h-3.5 w-3.5 text-primary/50 group-hover:text-primary/70 transition-colors" />
          </button>
        </div>
      )}

      {/* Footer: User profile row with popover (ChatGPT-style) */}
      <SidebarFooter className={cn("border-t border-sidebar-border/30", collapsed ? "p-1.5" : "p-2")}>
        {collapsed ? (
          <Popover>
            <PopoverTrigger asChild>
              <button className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-muted/50 transition-colors mx-auto">
                <Avatar className="h-7 w-7 rounded-full">
                  <AvatarFallback className="rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="end" className="w-48 p-1.5">
              <button
                onClick={toggleDarkMode}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-foreground hover:bg-accent transition-colors"
              >
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {darkMode ? "Light Mode" : "Dark Mode"}
              </button>
              <button
                onClick={() => { navigate("/app/settings"); }}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-foreground hover:bg-accent transition-colors"
              >
                <Settings className="h-4 w-4" />
                Einstellungen
              </button>
              <div className="my-1 border-t border-border/30" />
              <button
                onClick={signOut}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Abmelden
              </button>
            </PopoverContent>
          </Popover>
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <button data-tour="nav-settings" className="flex items-center gap-2.5 w-full px-2 py-2 rounded-xl hover:bg-accent/50 transition-colors text-left">
                <Avatar className="h-8 w-8 rounded-full shrink-0">
                  <AvatarFallback className="rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{userDisplayName}</p>
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-56 p-1.5 mb-1">
              <button
                onClick={toggleDarkMode}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-foreground hover:bg-accent transition-colors"
              >
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {darkMode ? "Light Mode" : "Dark Mode"}
              </button>
              <button
                onClick={() => { navigate("/app/settings"); }}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-foreground hover:bg-accent transition-colors"
              >
                <Settings className="h-4 w-4" />
                Einstellungen
              </button>
              <div className="my-1 border-t border-border/30" />
              <button
                onClick={signOut}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Abmelden
              </button>
            </PopoverContent>
          </Popover>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
