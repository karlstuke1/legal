import { useRef, useEffect, useState, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSmoothReveal } from "@/hooks/use-smooth-reveal";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Scale, Search, FileText, Gavel, BookOpen, Upload, PenTool, ListChecks, FolderOpen, CheckSquare, GraduationCap, Brain, ClipboardList, AlertTriangle, RefreshCw, X } from "lucide-react";
import type { CitationAnalysis } from "@/lib/citation-engine";
import type { ChatMessage, ChatMode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { ThinkingSteps, type ThinkingStep } from "@/components/ThinkingSteps";
import type { RetrievalResult } from "@/lib/retrieval";
import { fetchFeedbackForMessages, type FeedbackRating } from "@/lib/feedback-api";
import type { DocumentDetection } from "@/lib/document-detector";
import { upsertFeedback, deleteFeedback } from "@/lib/feedback-api";
import { useAuth } from "@/lib/auth";
import { MessageBubble } from "./chat/MessageBubble";

import { mdComponents, preprocessContent } from "./chat/markdown-config";

interface SourceGroup {
  provider: string;
  results: RetrievalResult[];
}

export const MAX_ITERATIONS = 8;

interface ChatThreadProps {
  messages: ChatMessage[];
  streamingContent?: string;
  thinkingSteps?: ThinkingStep[];
  isThinking?: boolean;
  onRegenerate?: () => void;
  onSuggestionClick?: (text: string) => void;
  sourceResultsMap?: Record<string, SourceGroup[]>;
  sourceResults?: SourceGroup[];  // for streaming/panel
  mode?: ChatMode;
  matterName?: string;
  citationAnalysisMap?: Record<string, CitationAnalysis>;
  documentDetectionMap?: Record<string, DocumentDetection>;
  onOpenDocumentEditor?: (content: string, title: string) => void;
  iterationLimitReached?: boolean;
  onRestartWithSummary?: () => void;
  userRole?: string;
  displayName?: string;
  pinnedMessageIds?: Set<string>;
  onTogglePin?: (messageId: string) => void;
}

/* Draft phase tracker */
export function DraftPhaseTracker({ messageCount }: { messageCount: number }) {
  const phase = messageCount === 0 ? 0 : messageCount <= 2 ? 1 : messageCount <= 4 ? 2 : 3;
  const phases = [
    { label: "Sachverhalt", done: phase > 1 },
    { label: "Gliederung", done: phase > 2 },
    { label: "Entwurf", done: phase > 3 },
  ];

  return (
    <div className="flex items-center justify-center gap-1 py-3 px-4">
      {phases.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
            phase === i + 1
              ? "bg-foreground/[0.08] text-foreground"
              : p.done
              ? "text-foreground/50"
              : "text-muted-foreground/30"
          }`}>
            {p.done ? (
              <CheckSquare className="h-3 w-3 text-emerald-500" />
            ) : (
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] ${
                phase === i + 1 ? "bg-foreground text-background" : "bg-muted/50"
              }`}>{i + 1}</span>
            )}
            {p.label}
          </div>
          {i < 2 && <div className={`w-6 h-px ${p.done ? "bg-foreground/20" : "bg-border/40"}`} />}
        </div>
      ))}
    </div>
  );
}

const MODE_EMPTY_STATES: Record<ChatMode, {
  title: string;
  subtitle: string;
  queries: { icon: typeof Search; text: string; label: string }[];
}> = {
  research: {
    title: "Wie kann ich helfen?",
    subtitle: "Recherche, Dokumentenprüfung und Entwurf mit überprüfbaren Quellen.",
    queries: [
      { icon: Search, text: "Welche Kündigungsfristen gelten nach § 20 AngG?", label: "Arbeitsrecht" },
      { icon: FileText, text: "Prüfe die Wirksamkeit einer AGB-Klausel zur Haftungsbeschränkung nach KSchG", label: "Vertragsrecht" },
      { icon: Gavel, text: "Wie ist die aktuelle Rechtsprechung zum Schadenersatz bei Datenschutzverstößen nach DSG?", label: "Datenschutz" },
      { icon: BookOpen, text: "Erkläre die Voraussetzungen eines Bereicherungsanspruchs nach § 1431 ABGB", label: "Bereicherungsrecht" },
    ],
  },
  document_review: {
    title: "Dokument zur Prüfung hochladen",
    subtitle: "Dokument hochladen, Prüfauftrag ergänzen, Risiken priorisieren.",
    queries: [
      { icon: FileText, text: "Prüfe diesen Arbeitsvertrag auf problematische Klauseln", label: "Vertragsprüfung" },
      { icon: Search, text: "Analysiere diese AGB auf Wirksamkeit nach §§ 864a, 879 ABGB und KSchG", label: "AGB-Prüfung" },
      { icon: Gavel, text: "Prüfe diese Datenschutzerklärung auf DSGVO-Konformität", label: "DSGVO-Check" },
      { icon: Upload, text: "Prüfe diesen NDA auf Lücken und fehlende Klauseln", label: "NDA-Prüfung" },
    ],
  },
  draft: {
    title: "Was möchten Sie erstellen?",
    subtitle: "Sachverhalt beschreiben, Gliederung prüfen, Entwurf erstellen.",
    queries: [
      { icon: PenTool, text: "Erstelle einen Arbeitsvertrag für eine Vollzeitstelle", label: "Arbeitsvertrag" },
      { icon: FileText, text: "Erstelle einen Kaufvertrag für eine Immobilie", label: "Kaufvertrag" },
      { icon: Gavel, text: "Erstelle einen Schriftsatz für eine Kündigungsschutzklage", label: "Schriftsatz" },
      { icon: BookOpen, text: "Erstelle eine Datenschutzerklärung nach DSGVO", label: "Datenschutz" },
    ],
  },
  vault: {
    title: "Ihre Dokumentensammlung durchsuchen",
    subtitle: "Fragen, Vergleiche und Zusammenfassungen zu Ihren Dokumenten.",
    queries: [
      { icon: FolderOpen, text: "Vergleiche die Haftungsklauseln in allen hochgeladenen Verträgen", label: "Vergleich" },
      { icon: Search, text: "Fasse alle Fristen und Termine aus den Dokumenten zusammen", label: "Extraktion" },
      { icon: FileText, text: "Gibt es Widersprüche zwischen den hochgeladenen Dokumenten?", label: "Inkonsistenzen" },
      { icon: BookOpen, text: "Erstelle eine Executive Summary aller Dokumente", label: "Zusammenfassung" },
    ],
  },
  exam: {
    title: "Prüfungsmodus — Jura lernen",
    subtitle: "Falllösung, Quiz oder Karteikarten für die Vorbereitung.",
    queries: [
      { icon: ClipboardList, text: "Starte ein Multiple-Choice Quiz zum österreichischen Strafrecht", label: "Quiz" },
      { icon: Gavel, text: "Gib mir einen Fall zum Bereicherungsrecht nach § 1431 ABGB", label: "Falllösung" },
      { icon: Brain, text: "Frage mich Definitionen und Schemata zum Sachenrecht nach ABGB", label: "Karteikarten" },
      { icon: BookOpen, text: "Prüfungsschema: Schadenersatzanspruch nach § 1295 ABGB durchgehen", label: "Schema" },
    ],
  },
};

const ROLE_GREETINGS: Record<string, { title: string; subtitle: string }> = {
  anwalt: { title: "Guten Tag", subtitle: "Rechtsprechung recherchieren, Dokumente prüfen, Entwürfe erstellen." },
  inhouse: { title: "Guten Tag", subtitle: "Rechtsprechung recherchieren, Verträge prüfen, Compliance bewerten." },
  student: { title: "Bereit zum Lernen?", subtitle: "Starte eine Falllösung, übe mit Karteikarten oder lass dir ein Schema erklären." },
  behoerde: { title: "Guten Tag", subtitle: "Verwaltungsrecht recherchieren, Bescheide prüfen, Gutachten erstellen." },
  other: { title: "Wie kann ich helfen?", subtitle: "Juristische Recherche mit überprüfbaren Quellen." },
};

export function ChatThread({
  messages,
  streamingContent,
  thinkingSteps = [],
  isThinking = false,
  onRegenerate,
  onSuggestionClick,
  sourceResultsMap = {},
  sourceResults = [],
  mode = "research",
  matterName,
  citationAnalysisMap = {},
  documentDetectionMap = {},
  onOpenDocumentEditor,
  iterationLimitReached,
  onRestartWithSummary,
  userRole,
  displayName,
  pinnedMessageIds,
  onTogglePin,
}: ChatThreadProps) {
   const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);
  const newAnswerRef = useRef<HTMLDivElement>(null);
  const userHasScrolledRef = useRef(false);
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isStreaming = !!streamingContent;
  const revealedContent = useSmoothReveal(streamingContent, isStreaming);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackRating>>({});
  // Store completed thinking steps per assistant message
  const [completedStepsMap, setCompletedStepsMap] = useState<Record<string, ThinkingStep[]>>({});
  const [aiHintDismissed, setAiHintDismissed] = useState(false);

  useEffect(() => {
    const assistantIds = messages
      .filter(m => m.role === "assistant" && !m.id.startsWith("__"))
      .map(m => m.id);
    if (assistantIds.length > 0) {
      fetchFeedbackForMessages(assistantIds).then(setFeedbackMap);
    }
  }, [messages]);

  // Capture completed thinking steps when a new assistant message appears
  const prevThinkingRef = useRef<ThinkingStep[]>([]);
  useEffect(() => {
    // When thinking steps exist and streaming just completed (new message appeared)
    if (prevThinkingRef.current.length > 0 && !isThinking && !streamingContent) {
      const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
      if (lastAssistant && !completedStepsMap[lastAssistant.id]) {
        setCompletedStepsMap(prev => ({
          ...prev,
          [lastAssistant.id]: prevThinkingRef.current.map(s => ({ ...s, status: "done" as const })),
        }));
      }
    }
    if (thinkingSteps.length > 0) {
      prevThinkingRef.current = [...thinkingSteps];
    }
  }, [messages, isThinking, streamingContent, thinkingSteps]);

  // Track when user scrolls manually during streaming
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      // If user scrolled up significantly, mark as manually scrolled
      userHasScrolledRef.current = distanceFromBottom > 150;
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Only auto-scroll when the USER sends a new message (user message count increases)
  const userMessageCountRef = useRef(0);
  useEffect(() => {
    const userCount = messages.filter(m => m.role === "user").length;
    if (userCount > userMessageCountRef.current) {
      userMessageCountRef.current = userCount;
      userHasScrolledRef.current = false;
      requestAnimationFrame(() => {
        newAnswerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else {
      // Assistant message appeared (streaming finished) — don't scroll, user stays where they are
      userMessageCountRef.current = Math.max(userMessageCountRef.current, userCount);
    }
    lastMessageCountRef.current = messages.length + (streamingContent ? 1 : 0);
  }, [messages, streamingContent, isThinking]);

  const handleFeedback = useCallback(async (messageId: string, rating: FeedbackRating) => {
    if (!user) return;
    const current = feedbackMap[messageId];
    if (current === rating) {
      const ok = await deleteFeedback(messageId, user.id);
      if (ok) setFeedbackMap(prev => { const next = { ...prev }; delete next[messageId]; return next; });
    } else {
      // For "down" ratings, include query context metadata for feedback learning
      const metadata = rating === "down" ? {
        source_count: (sourceResults || []).reduce((sum, sr) => sum + sr.results.length, 0),
        confidence_score: citationAnalysisMap?.[messageId]?.confidence?.score,
        has_sources: (sourceResults || []).length > 0,
        fabricated_count: citationAnalysisMap?.[messageId]?.verification?.fabricatedSuspects?.length || 0,
        mode,
      } : undefined;
      const result = await upsertFeedback(messageId, user.id, rating, metadata);
      if (result) setFeedbackMap(prev => ({ ...prev, [messageId]: rating }));
    }
  }, [user, feedbackMap, sourceResults, citationAnalysisMap, mode]);

  const allMessages = [...messages];
  const lastAssistantMessageId = [...allMessages].reverse().find(m => m.role === "assistant")?.id;
  const emptyState = MODE_EMPTY_STATES[mode] || MODE_EMPTY_STATES.research;

  const streamingMsg: ChatMessage | null = revealedContent
    ? {
        id: "__streaming__",
        chat_id: "",
        role: "assistant",
        content: { text: revealedContent },
        created_at: new Date().toISOString(),
      }
    : null;



  // Build personalized greeting
  const roleGreeting = ROLE_GREETINGS[userRole || "other"] || ROLE_GREETINGS.other;
  const firstName = displayName?.split(" ")[0];
  const personalizedTitle = firstName
    ? `Wie kann ich helfen, ${firstName}?`
    : emptyState.title;
  const personalizedSubtitle = mode === "research" ? roleGreeting.subtitle : emptyState.subtitle;

  if (allMessages.length === 0 && !isThinking) {
    return (
      <div className="flex flex-1 items-center justify-center px-3 sm:px-6 py-5 sm:py-0">
        <div className="w-full max-w-lg -translate-y-3 text-center space-y-4 sm:translate-y-0 sm:space-y-6">
          {/* Art. 50 AI Act – KI-Transparenzhinweis */}
          {!aiHintDismissed && !isMobile && (
            <div className="mx-auto max-w-md rounded-xl border border-border/30 bg-muted/30 px-4 py-3 text-left relative">
              <button
                onClick={() => setAiHintDismissed(true)}
                className="absolute top-2 right-2 p-0.5 rounded-md text-muted-foreground/40 hover:text-foreground/60 transition-colors"
                aria-label="Schließen"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-start gap-2.5 pr-5">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/60" />
                <p className="text-[12px] sm:text-[12.5px] leading-relaxed text-muted-foreground/70">
                  <span className="font-medium text-foreground/60">KI-Transparenzhinweis</span>{" "}
                  (Art.&nbsp;50 AI Act): Antworten sind KI-generiert, keine anwaltliche Beratung und mit Quellen zu prüfen.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2 sm:space-y-3">
            <h2 className="text-[19px] sm:text-[24px] font-semibold tracking-tight text-foreground/75">
              {personalizedTitle}
            </h2>
            <p className="text-[13px] sm:text-[14px] text-muted-foreground/50 leading-relaxed max-w-xs mx-auto text-balance">
              {personalizedSubtitle}
            </p>
            {mode === "vault" && matterName && (
              <p className="text-[13px] text-foreground/50 font-medium mt-2">{matterName}</p>
            )}
          </div>
          {onSuggestionClick && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {emptyState.queries.slice(0, isMobile ? 2 : emptyState.queries.length).map((q, i) => {
                const Icon = q.icon;
                return (
                  <button
                    key={i}
                    onClick={() => onSuggestionClick(q.text)}
                    className="group flex items-start gap-2.5 rounded-xl border border-border/35 bg-card/65 px-3.5 py-3 text-left shadow-[0_10px_32px_-28px_hsl(var(--foreground))] transition-all duration-200 hover:-translate-y-0.5 hover:border-border/60 hover:bg-card hover:shadow-[0_18px_42px_-32px_hsl(var(--foreground))] active:scale-[0.99]"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/45 transition-colors group-hover:text-foreground/55" />
                    <div className="min-w-0">
                      <span className="text-[11px] sm:text-[12px] font-medium text-muted-foreground/60">{q.label}</span>
                      <p className="text-[12.5px] sm:text-[13px] text-foreground/75 leading-snug line-clamp-2">{q.text}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl py-4 sm:py-10 px-3 sm:px-6 lg:px-8">
        <AnimatePresence initial={false}>
          {allMessages.map((msg, idx) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: isMobile ? 0.15 : 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="mb-5 sm:mb-8 last:mb-0"
            >
              <MessageBubble
                msg={msg}
                isLastAssistant={msg.id === lastAssistantMessageId}
                isLastMessage={idx === allMessages.length - 1 || !allMessages.slice(idx + 1).some(m => m.role === "assistant")}
                onRegenerate={onRegenerate}
                onSuggestionClick={onSuggestionClick}
                sourceResults={sourceResultsMap[msg.id] || []}
                mode={mode}
                feedbackRating={feedbackMap[msg.id]}
                onFeedbackChange={handleFeedback}
                documentDetection={documentDetectionMap[msg.id]}
                onOpenDocumentEditor={onOpenDocumentEditor}
                completedThinkingSteps={completedStepsMap[msg.id]}
                isPinned={pinnedMessageIds?.has(msg.id)}
                onTogglePin={msg.role === "assistant" ? onTogglePin : undefined}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Thinking steps shown while processing */}
        {isThinking && !streamingMsg && thinkingSteps.length > 0 && (
          <motion.div
            ref={newAnswerRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="mb-8"
          >
            <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Scale className="h-3 w-3" />
              Denken
            </div>
        <div className="flex items-start gap-2 sm:gap-3">
              <div className="mt-0.5 flex-shrink-0 h-7 w-7 rounded-full bg-foreground/[0.05] hidden sm:flex items-center justify-center">
                <Scale className="h-3.5 w-3.5 text-foreground/35" />
              </div>
              <div className="flex-1 min-w-0">
                <ThinkingSteps steps={thinkingSteps} isVisible={true} />
              </div>
            </div>
          </motion.div>
        )}

        {/* Streaming response */}
        {streamingMsg && (
          <motion.div
            ref={newAnswerRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="mb-8"
          >
            {thinkingSteps.length > 0 && (
              <>
                <ThinkingSteps steps={thinkingSteps} isVisible={true} />
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Scale className="h-3 w-3" />
                  Denken abgeschlossen · Antwort wird erstellt
                </div>
              </>
            )}
            <div className="group">
              <div className="flex items-start gap-2 sm:gap-3">
                <div className="mt-0.5 flex-shrink-0 h-7 w-7 rounded-full bg-foreground/[0.05] hidden sm:flex items-center justify-center">
                  <Scale className="h-3.5 w-3.5 text-foreground/35" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="chat-prose max-w-none">
                    {(
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                        {preprocessContent(streamingMsg.content.text, sourceResults)}
                      </ReactMarkdown>
                    )}
                    <span className="typing-cursor" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Iteration limit banner */}
        {iterationLimitReached && !streamingMsg && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-8"
          >
            <div className="rounded-xl border border-border/50 bg-muted/30 p-4 flex flex-col items-center gap-3 text-center">
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-[13px] font-medium">Für bessere Qualität: neue Anfrage starten.</span>
              </div>
              <p className="text-[12px] text-muted-foreground/60 max-w-md">
                Lange Konversationen können zu Qualitätsverlust führen. Starten Sie einen neuen Chat — die bisherigen Informationen werden zusammengefasst.
              </p>
              {onRestartWithSummary && (
                <Button
                  onClick={onRestartWithSummary}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-xl"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Neu starten (mit Zusammenfassung)
                </Button>
              )}
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
