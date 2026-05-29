import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/lib/supabase-safe";
import { Composer } from "@/components/Composer";
import { ChatThread } from "@/components/ChatThread";
import { DraftPhaseTracker, MAX_ITERATIONS } from "@/components/ChatThread";
import { SourcesPanel } from "@/components/SourcesPanel";
import { DocumentEditor } from "@/components/chat/DocumentEditor";
import { ChatToolbarExport } from "@/components/chat/ChatToolbarExport";
import { ChatBanners } from "@/components/chat/ChatBanners";
import { LawyerHintDialog } from "@/components/chat/LawyerHintDialog";
import { fetchChat, fetchMessages, updateChatFilters, createChat } from "@/lib/chat-api";
import { fetchMatters, assignChatToMatter, type Matter } from "@/lib/matters-api";
import { useChatExport } from "@/hooks/use-chat-export";
import { toast } from "@/hooks/use-toast";
import { useChatSend } from "@/hooks/use-chat-send";
import { pinMessage, unpinMessage, fetchPinnedMessageIds } from "@/lib/pin-api";
import type { ChatFilters, ChatMessage } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, FolderOpen } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { hasRecoverableStreamingDraft } from "@/lib/streaming-draft";

export default function ChatPage() {
  const { chatId } = useParams<{ chatId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();

  const [filters, setFilters] = useState<ChatFilters>({
    jurisdiction: ["AT"],
    sources: ["AUTO"],
    mode: "research",
    autoRouter: true,
    legalArea: "allgemein",
  });

  const [privacyNoStore, setPrivacyNoStore] = useState(false);
  const [autoPseudonymize, setAutoPseudonymize] = useState(false);
  const [userRole, setUserRole] = useState<string>("other");
  const [displayName, setDisplayName] = useState<string>("");
  const [showLawyerHint, setShowLawyerHint] = useState(false);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [currentMatterId, setCurrentMatterId] = useState<string | null>(null);

  const {
    messages, setMessages,
    streamingContent, isStreaming,
    thinkingSteps, isThinking,
    sourceResults, setSourceResults,
    sourceResultsMap, setSourceResultsMap,
    isSearchingSources,
    citationAnalysisMap,
    documentDetectionMap,
    activeChatId, setActiveChatId,
    justCreatedRef,
    quotaExceeded, setQuotaExceeded,
    handleSend, handleStop,
    resetState,
  } = useChatSend(filters, currentMatterId, privacyNoStore);

  const [isExportingDocument, setIsExportingDocument] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Set<string>>(new Set());
  const [editorContent, setEditorContent] = useState("");
  const [editorTitle, setEditorTitle] = useState("");

  const currentMatter = useMemo(() => matters.find(m => m.id === currentMatterId), [matters, currentMatterId]);
  const { handleDocumentExport } = useChatExport(currentMatter, setIsExportingDocument);
  const isLawyer = userRole === "anwalt" || userRole === "inhouse";
  const userMessageCount = messages.filter(m => m.role === "user").length;
  const iterationLimitReached = userMessageCount >= MAX_ITERATIONS;
  const draftRecoveryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopDraftRecovery = useCallback(() => {
    if (draftRecoveryTimerRef.current) {
      clearInterval(draftRecoveryTimerRef.current);
      draftRecoveryTimerRef.current = null;
    }
  }, []);

  const applyLoadedMessages = useCallback((loadedMessages: ChatMessage[]) => {
    setMessages(loadedMessages);
    const restoredMap: Record<string, any[]> = {};
    let latestSources: any[] = [];
    for (const msg of loadedMessages) {
      const sources = msg.content?.sources;
      if (msg.role === "assistant" && Array.isArray(sources) && sources.length > 0) {
        restoredMap[msg.id] = sources;
        latestSources = sources;
      }
    }
    setSourceResultsMap(restoredMap);
    setSourceResults(latestSources);
  }, [setMessages, setSourceResults, setSourceResultsMap]);

  const startDraftRecovery = useCallback((targetChatId: string, loadedMessages: ChatMessage[]) => {
    stopDraftRecovery();
    if (!hasRecoverableStreamingDraft(loadedMessages)) return;

    let attempts = 0;
    draftRecoveryTimerRef.current = setInterval(async () => {
      attempts += 1;
      const latestMessages = await fetchMessages(targetChatId);
      applyLoadedMessages(latestMessages);
      if (!hasRecoverableStreamingDraft(latestMessages) || attempts >= 80) {
        stopDraftRecovery();
      }
    }, 1500);
  }, [applyLoadedMessages, stopDraftRecovery]);

  useEffect(() => () => stopDraftRecovery(), [stopDraftRecovery]);

  // Load profile defaults — re-run whenever we switch to a new (unsaved) chat
  const profileLoadedForChat = useRef<string | null>(null);
  useEffect(() => {
    const key = chatId || "__new__";
    if (!user || chatId || profileLoadedForChat.current === key) return;
    profileLoadedForChat.current = key;
    supabase
      .from("profiles")
      .select("default_jurisdiction, default_sources, default_mode, privacy_no_store, auto_pseudonymize_chat, user_role, default_legal_area, display_name")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setFilters(prev => ({
            ...prev,
            jurisdiction: (data.default_jurisdiction as any) || prev.jurisdiction,
            sources: (data.default_sources as any) || prev.sources,
            mode: (data.default_mode as any) || prev.mode,
            autoRouter: ((data.default_sources as any) || ["AUTO"]).includes("AUTO"),
            legalArea: ((data as any).default_legal_area as any) || prev.legalArea,
          }));
          setPrivacyNoStore(data.privacy_no_store || false);
          setAutoPseudonymize((data as any).auto_pseudonymize_chat || false);
          setDisplayName((data as any).display_name || "");
          const role = (data as any).user_role || "other";
          setUserRole(role);
          if ((role === "anwalt" || role === "inhouse") && !localStorage.getItem("lawyer_hint_dismissed")) {
            setShowLawyerHint(true);
          }
        }
      });
  }, [user, chatId]);

  useEffect(() => {
    if (activeWorkspace) fetchMatters(activeWorkspace.id).then(setMatters);
  }, [activeWorkspace]);

  useEffect(() => {
    if (!activeWorkspace || !user) return;
    fetchPinnedMessageIds(activeWorkspace.id, user.id).then(setPinnedMessageIds);
  }, [activeWorkspace, user]);

  const handleTogglePin = useCallback(async (messageId: string) => {
    if (!user || !activeWorkspace || !activeChatId) return;
    if (pinnedMessageIds.has(messageId)) {
      await unpinMessage(messageId, user.id);
      setPinnedMessageIds(prev => { const next = new Set(prev); next.delete(messageId); return next; });
      toast({ title: "Entpinnt" });
    } else {
      await pinMessage(messageId, activeChatId, user.id, activeWorkspace.id);
      setPinnedMessageIds(prev => new Set(prev).add(messageId));
      toast({ title: "Gepinnt", description: "Antwort als Favorit gespeichert." });
    }
  }, [user, activeWorkspace, activeChatId, pinnedMessageIds]);

  // Load chat + messages when chatId changes
  useEffect(() => {
    if (chatId) {
      setActiveChatId(chatId);
      const loadChat = (skipMessages: boolean) => {
        if (!skipMessages) {
          fetchMessages(chatId).then((loadedMessages) => {
            applyLoadedMessages(loadedMessages);
            startDraftRecovery(chatId, loadedMessages);
          });
        }
        fetchChat(chatId).then(chat => {
          if (chat) {
            setFilters({
              jurisdiction: chat.jurisdiction || ["AT"],
              sources: chat.sources || ["AUTO"],
              mode: chat.mode || "research",
              autoRouter: (chat.sources || ["AUTO"]).includes("AUTO"),
              legalArea: "allgemein",
            });
            setCurrentMatterId(chat.matter_id);
          }
        });
      };
      if (justCreatedRef.current === chatId) {
        // Keep the marker until the send pipeline finishes. In dev/StrictMode
        // this effect can run more than once for the newly-created route; if we
        // clear it here, the second pass calls resetState() and kills the first
        // stream before title generation can run.
        loadChat(true);
      } else {
        resetState();
        loadChat(false);
      }
    } else {
      setActiveChatId(null);
      setMessages([]);
      stopDraftRecovery();
      resetState();
    }
  }, [chatId, applyLoadedMessages, startDraftRecovery, stopDraftRecovery]);

  const handleFiltersChange = (newFilters: ChatFilters) => {
    setFilters(newFilters);
    if (activeChatId) updateChatFilters(activeChatId, newFilters);
  };

  const handleMatterChange = async (matterId: string | null) => {
    setCurrentMatterId(matterId);
    if (activeChatId) await assignChatToMatter(activeChatId, matterId);
  };

  const handleSuggestionClick = useCallback(
    (text: string) => handleSend(text, []),
    [handleSend]
  );

  const handleRestartWithSummary = useCallback(async () => {
    if (!activeWorkspace || !user) return;
    const userQuestions: string[] = [];
    const assistantConclusions: string[] = [];
    const norms = new Set<string>();

    for (const m of messages) {
      const text = m.content?.text || "";
      if (m.role === "user") {
        userQuestions.push(text.slice(0, 150));
      } else if (m.role === "assistant") {
        assistantConclusions.push(text.slice(0, 200));
        text.match(/§§?\s*\d+[a-z]?\s+[\wÄÖÜäöüß-]+/g)?.slice(0, 3).forEach(n => norms.add(n.trim()));
        text.match(/RS\d{5,}/g)?.forEach(r => norms.add(r));
      }
    }

    const parts = ["[Zusammenfassung des bisherigen Gesprächs]"];
    parts.push("\nFragen:\n" + userQuestions.map(q => `- ${q}`).join("\n"));
    if (assistantConclusions.length > 0) {
      parts.push("\nBisherige Ergebnisse:\n" + assistantConclusions.map(c => `- ${c}${c.length >= 200 ? "…" : ""}`).join("\n"));
    }
    if (norms.size > 0) {
      parts.push("\nReferenzierte Normen: " + Array.from(norms).slice(0, 10).join(", "));
    }

    const newChat = await createChat(activeWorkspace.id, user.id, filters);
    if (newChat) {
      navigate(`/app/chat/${newChat.id}`, { state: { prefill: parts.join("\n") } });
    }
  }, [messages, activeWorkspace, user, filters, navigate]);

  return (
    <div className="flex flex-1 h-full min-h-0">
      <LawyerHintDialog open={showLawyerHint} onOpenChange={setShowLawyerHint} />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-2 sm:px-6 py-1.5 shrink-0 border-b border-border/15 sticky top-0 z-10 bg-background/90 backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            <SidebarTrigger className="h-7 w-7" />
            <DropdownMenu>
              <DropdownMenuTrigger data-tour="matter-dropdown" className="flex items-center gap-1 text-[12px] sm:text-[13px] font-medium text-foreground/50 hover:text-foreground transition-colors">
                <FolderOpen className="h-3.5 w-3.5 opacity-40 sm:hidden" />
                <span className="hidden sm:inline">{currentMatter ? currentMatter.name : "Mandantenakte"}</span>
                <span className="sm:hidden truncate max-w-[100px]">{currentMatter ? currentMatter.name : ""}</span>
                <ChevronDown className="h-3 w-3 opacity-40" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => handleMatterChange(null)} className={!currentMatterId ? "bg-accent font-medium" : ""}>
                  Ohne Akte
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {matters.map(m => (
                  <DropdownMenuItem key={m.id} onClick={() => handleMatterChange(m.id)} className={currentMatterId === m.id ? "bg-accent font-medium" : ""}>
                    {m.name}
                  </DropdownMenuItem>
                ))}
                {matters.length === 0 && (
                  <DropdownMenuItem disabled className="text-muted-foreground/50 text-[12px]">
                    Erstelle eine Akte über "Erstellen"
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-1">
            <ChatToolbarExport
              messages={messages}
              sourceResults={sourceResults}
              sourceResultsMap={sourceResultsMap}
              activeChatId={activeChatId}
              userId={user?.id}
              matterName={currentMatter?.name}
            />
          </div>
        </div>

        {filters.mode === "draft" && <DraftPhaseTracker messageCount={messages.length} />}
        
        <ChatBanners
          filters={filters}
          currentMatter={currentMatter}
          privacyNoStore={privacyNoStore}
          autoPseudonymize={autoPseudonymize}
          isLawyer={isLawyer}
          onShowLawyerHint={() => setShowLawyerHint(true)}
        />

        <ChatThread
          messages={messages}
          streamingContent={isStreaming ? streamingContent : undefined}
          thinkingSteps={thinkingSteps}
          isThinking={isThinking}
          onSuggestionClick={handleSuggestionClick}
          onRegenerate={messages.length > 0 && !isStreaming ? () => {
            const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
            if (lastUserMsg) {
              setMessages(prev => {
                for (let i = prev.length - 1; i >= 0; i--) {
                  if (prev[i].role === "assistant") {
                    return [...prev.slice(0, i), ...prev.slice(i + 1)];
                  }
                }
                return prev;
              });
              handleSend(lastUserMsg.content.text, []);
            }
          } : undefined}
          sourceResults={sourceResults}
          sourceResultsMap={sourceResultsMap}
          mode={filters.mode}
          matterName={currentMatter?.name}
          citationAnalysisMap={citationAnalysisMap}
          documentDetectionMap={documentDetectionMap}
          onOpenDocumentEditor={(content, title) => {
            setEditorContent(content);
            setEditorTitle(title);
            setEditorOpen(true);
          }}
          iterationLimitReached={iterationLimitReached}
          onRestartWithSummary={handleRestartWithSummary}
          userRole={userRole}
          displayName={displayName}
          pinnedMessageIds={pinnedMessageIds}
          onTogglePin={handleTogglePin}
        />
        <Composer
          onSend={handleSend}
          onStop={handleStop}
          loading={isStreaming}
          disabled={isStreaming || iterationLimitReached}
          workspaceId={activeWorkspace?.id}
          userId={user?.id}
          chatId={activeChatId || undefined}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          isLawyer={isLawyer}
          iterationLimitReached={iterationLimitReached}
          initialText={(location.state as any)?.prefill}
          onUploadQuotaExceeded={() => setQuotaExceeded({ type: "uploads", message: "Upload-Limit erreicht" })}
          modeLocked={messages.length > 0}
        />
      </div>
      {filters.mode !== "exam" && messages.length > 0 && (
        <SourcesPanel
          results={sourceResults}
          isLoading={isSearchingSources}
        />
      )}
      <DocumentEditor
        content={editorContent}
        title={editorTitle}
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onExport={handleDocumentExport}
        isExporting={isExportingDocument}
      />
      <UpgradeDialog
        open={!!quotaExceeded}
        onOpenChange={(open) => !open && setQuotaExceeded(null)}
        limitType={
          quotaExceeded?.type === "uploads" ? "Upload"
          : quotaExceeded?.type === "pseudonymizations" ? "Pseudonymisierungs"
          : "Anfragen"
        }
      />
    </div>
  );
}
