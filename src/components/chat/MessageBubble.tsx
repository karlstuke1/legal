import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, RotateCcw, Scale, ThumbsUp, ThumbsDown, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Pin, PinOff, FileText, Download, Eye, EyeOff } from "lucide-react";
import type { ThinkingStep } from "@/components/ThinkingSteps";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { ChatMessage, ChatMode } from "@/lib/types";
import type { RetrievalResult } from "@/lib/retrieval";
import type { FeedbackRating } from "@/lib/feedback-api";
import { mdComponents, preprocessContent } from "./markdown-config";

import { InteractiveQuestions, parseInteractiveQuestions } from "./InteractiveQuestions";

import { ConfidenceBadge } from "./ConfidenceBadge";
import { RiskReport } from "./RiskReport";
import type { DocumentDetection } from "@/lib/document-detector";
import { DOCUMENT_TYPE_LABELS } from "@/lib/document-detector";

interface SourceGroup {
  provider: string;
  results: RetrievalResult[];
}

interface MessageBubbleProps {
  msg: ChatMessage;
  isLastAssistant: boolean;
  isLastMessage: boolean;
  onRegenerate?: () => void;
  onSuggestionClick?: (text: string) => void;
  sourceResults: SourceGroup[];
  mode: ChatMode;
  feedbackRating?: FeedbackRating;
  onFeedbackChange: (messageId: string, rating: FeedbackRating) => void;
  documentDetection?: DocumentDetection;
  onOpenDocumentEditor?: (content: string, title: string) => void;
  completedThinkingSteps?: ThinkingStep[];
  isPinned?: boolean;
  onTogglePin?: (messageId: string) => void;
}

/* ── User bubble ── */
function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="bg-foreground/[0.06] rounded-2xl px-4 sm:px-5 py-2.5 sm:py-3 max-w-[92%] sm:max-w-[85%]">
        <p className="text-[14px] sm:text-[14.5px] leading-[1.7] text-foreground whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

/* ── Error bubble ── */
function ErrorBubble({ msg, onRegenerate, isLastMessage }: { msg: ChatMessage; onRegenerate?: () => void; isLastMessage: boolean }) {
  return (
    <div className="group">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 h-7 w-7 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive/60" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="chat-prose max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {msg.content.text}
            </ReactMarkdown>
          </div>
          {onRegenerate && isLastMessage && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-8 px-3 text-[12px] gap-1.5 rounded-lg border-destructive/20 text-destructive hover:bg-destructive/5"
              onClick={onRegenerate}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Erneut versuchen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Document Card (collapsed document with export) ── */
function DocumentCard({ detection, content, onOpenEditor, showPreview, onTogglePreview }: {
  detection: DocumentDetection;
  content: string;
  onOpenEditor: () => void;
  showPreview: boolean;
  onTogglePreview: () => void;
}) {
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  return (
    <div className="rounded-xl border border-border/40 bg-card/50 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileText className="h-4.5 w-4.5 text-primary/70" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-foreground/90 truncate">{detection.title}</p>
          <p className="text-[12px] text-muted-foreground/50">
            {DOCUMENT_TYPE_LABELS[detection.documentType]} · {wordCount} Wörter
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-[12px] gap-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground"
            onClick={onTogglePreview}
          >
            {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{showPreview ? "Ausblenden" : "Vorschau"}</span>
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-8 px-3.5 text-[12px] gap-1.5 rounded-lg"
            onClick={onOpenEditor}
          >
            <Download className="h-3.5 w-3.5" />
            Exportieren
          </Button>
        </div>
      </div>
      {showPreview && (
        <div className="border-t border-border/30 px-4 py-4 max-h-[400px] overflow-y-auto">
          <div className="chat-prose max-w-none text-[13px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {content}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Action bar (copy, regenerate, feedback) ── */
function MessageActions({
  msg, onRegenerate, isLastMessage, feedbackRating, onFeedbackChange, isPinned, onTogglePin,
}: {
  msg: ChatMessage; onRegenerate?: () => void; isLastMessage: boolean;
  feedbackRating?: FeedbackRating; onFeedbackChange: (id: string, r: FeedbackRating) => void;
  isPinned?: boolean; onTogglePin?: (messageId: string) => void;
}) {
  const isTemporaryMessage = msg.id.startsWith("__");

  const handleCopy = () => {
    const { textBefore } = parseInteractiveQuestions(msg.content.text);
    navigator.clipboard.writeText(textBefore.trim());
    toast({ title: "Kopiert" });
  };

  return (
    <div className="flex items-center gap-0 pt-1">
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 rounded-lg transition-all duration-200" onClick={handleCopy} title="Kopieren">
        <Copy className="h-3 w-3" />
      </Button>
      {onRegenerate && isLastMessage && (
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 rounded-lg transition-all duration-200" onClick={onRegenerate} title="Neu generieren">
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
      {onTogglePin && (
        <Button variant="ghost" size="sm" className={`h-7 w-7 p-0 rounded-lg transition-all duration-200 ${isPinned ? "text-amber-600 bg-amber-500/10 hover:bg-amber-500/15" : "text-muted-foreground/40 hover:text-amber-600 hover:bg-muted/40"}`} onClick={() => onTogglePin(msg.id)} title={isPinned ? "Entpinnen" : "Pinnen"}>
          {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
        </Button>
      )}
      {!isTemporaryMessage && <div className="ml-auto flex items-center gap-0">
        <Button
          variant="ghost" size="sm"
          className={`h-7 w-7 p-0 rounded-lg transition-all duration-200 ${feedbackRating === "up" ? "text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/15" : "text-muted-foreground/30 hover:text-emerald-600 hover:bg-muted/40"}`}
          onClick={() => onFeedbackChange(msg.id, "up")}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost" size="sm"
          className={`h-7 w-7 p-0 rounded-lg transition-all duration-200 ${feedbackRating === "down" ? "text-rose-600 bg-rose-500/10 hover:bg-rose-500/15" : "text-muted-foreground/30 hover:text-rose-600 hover:bg-muted/40"}`}
          onClick={() => onFeedbackChange(msg.id, "down")}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </Button>
      </div>}
    </div>
  );
}

/* ── Main MessageBubble ── */
export const MessageBubble = React.memo(function MessageBubble({
  msg, isLastAssistant, isLastMessage, onRegenerate, onSuggestionClick,
  sourceResults, mode, feedbackRating, onFeedbackChange,
  documentDetection, onOpenDocumentEditor, completedThinkingSteps,
  isPinned, onTogglePin,
}: MessageBubbleProps) {
  const [showThinking, setShowThinking] = useState(false);
  const [showDocPreview, setShowDocPreview] = useState(false);
  if (msg.role === "user") return <UserBubble text={msg.content.text} />;

  const { questions, textBefore, textAfter } = parseInteractiveQuestions(msg.content.text);
  const showInteractive = questions.length > 0 && isLastMessage && msg.id !== "__streaming__" && onSuggestionClick;
  const isErrorMessage = msg.content.text.startsWith("⚠️");
  const isComplete = msg.id !== "__streaming__";

  if (isErrorMessage) {
    return <ErrorBubble msg={msg} onRegenerate={onRegenerate} isLastMessage={isLastMessage} />;
  }

  // Document detected — show collapsed card instead of full inline text
  const isDocumentMessage = isComplete && documentDetection?.isDocument && onOpenDocumentEditor;

  return (
    <div className="group">
      {/* Collapsed thinking steps for completed messages */}
      {isComplete && completedThinkingSteps && completedThinkingSteps.length > 0 && (
        <button
          onClick={() => setShowThinking(!showThinking)}
          className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 hover:bg-muted/20 transition-all duration-150"
        >
          {showThinking ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Scale className="h-3 w-3" />
          <span>{completedThinkingSteps.length} Reasoning-Schritte</span>
        </button>
      )}
      {showThinking && completedThinkingSteps && (
        <div className="mb-3 ml-1 pl-3 border-l-2 border-border/20 space-y-1">
          {completedThinkingSteps.map((step) => (
            <div key={step.id} className="flex items-center gap-2 py-0.5 text-[12px] text-muted-foreground/50">
              <span className="text-muted-foreground/30">✓</span>
              <span>{step.label}</span>
              {step.pills && step.pills.length > 0 && (
                <span className="text-[10px] text-muted-foreground/30">
                  ({step.pills.map(p => p.label).join(", ")})
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="mt-0.5 flex-shrink-0 h-7 w-7 rounded-full bg-foreground/[0.05] hidden sm:flex items-center justify-center">
          <Scale className="h-3.5 w-3.5 text-foreground/35" />
        </div>
        <div className="flex-1 min-w-0">
          {/* Document message — collapsed card with export */}
          {isDocumentMessage ? (
            <DocumentCard
              detection={documentDetection!}
              content={msg.content.text}
              onOpenEditor={() => onOpenDocumentEditor!(msg.content.text, documentDetection!.title)}
              showPreview={showDocPreview}
              onTogglePreview={() => setShowDocPreview(!showDocPreview)}
            />
          ) : (
            <>
              {/* Main content */}
              <div className="chat-prose max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {preprocessContent(showInteractive ? textBefore : msg.content.text, sourceResults)}
                </ReactMarkdown>
              </div>

              {/* Interactive questions */}
              {showInteractive && (
                <InteractiveQuestions questions={questions} onOptionClick={onSuggestionClick} />
              )}
              {showInteractive && textAfter && (
                <div className="chat-prose max-w-none mt-4">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {preprocessContent(textAfter, sourceResults)}
                  </ReactMarkdown>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          {isComplete && (
            <MessageActions
              msg={msg}
              onRegenerate={onRegenerate}
              isLastMessage={isLastMessage}
              feedbackRating={feedbackRating}
              onFeedbackChange={onFeedbackChange}
              isPinned={isPinned}
              onTogglePin={onTogglePin}
            />
          )}

          {/* Sources are shown only inline (as clickable citations in the
              text) and in the right-side SourcesPanel — no per-message
              footer list, since it duplicates the sidebar. */}

          {/* Risk report for document review */}
          {isComplete && isLastAssistant && mode === "document_review" && msg.content.text.length > 200 && (
            <RiskReport documentText={msg.content.text} chatId={msg.id} />
          )}
        </div>
      </div>
    </div>
  );
});
