import React, { useState } from "react";
import { Send, MessageCircleQuestion, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";

/** Strip markdown bold/italic and render as HTML */
function renderMarkdownInline(text: string) {
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export interface ParsedQuestion {
  question: string;
  options: string[];
}

export function parseInteractiveQuestions(text: string): { questions: ParsedQuestion[]; textBefore: string; textAfter: string } {
  const lines = text.split("\n");
  const questions: ParsedQuestion[] = [];
  let currentQuestion: ParsedQuestion | null = null;
  let firstQuestionLine = -1;
  let lastQuestionLine = -1;

  // Find "Weiterführend" or similar headers
  let weiterführendLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (
      /^\*?\*?Weiterf[uü]hrend:?\*?\*?\s*$/i.test(trimmed) ||
      /^\*?\*?Folge-?\s*Fragen:?\*?\*?\s*$/i.test(trimmed) ||
      /^#{1,4}\s*Weiterf[uü]hrend/i.test(trimmed) ||
      /^#{1,4}\s*Folge-?\s*Fragen/i.test(trimmed)
    ) {
      weiterführendLine = i;
      break;
    }
  }

  // Also detect trailing numbered questions even without a header
  // (e.g. last 3-5 lines are all "1. ...?" "2. ...?" "3. ...?")
  if (weiterführendLine === -1) {
    let trailingStart = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed === "") continue;
      if (/^\d+\.\s+.+\?$/.test(trimmed)) {
        trailingStart = i;
      } else {
        break;
      }
    }
    // Need at least 2 trailing questions to trigger
    if (trailingStart >= 0) {
      const count = lines.slice(trailingStart).filter(l => /^\d+\.\s+.+\?$/.test(l.trim())).length;
      if (count >= 2) {
        weiterführendLine = trailingStart;
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const boldMatch = line.match(/^\*\*\d+\.\s+(.+\?)\s*\*\*$/);
    const plainMatch = !boldMatch && i > weiterführendLine && weiterführendLine >= 0
      ? line.match(/^\d+\.\s+(.+\?)$/)
      : null;
    const qMatch = boldMatch || plainMatch;

    if (qMatch) {
      if (currentQuestion) questions.push(currentQuestion);
      currentQuestion = { question: qMatch[1], options: [] };
      if (firstQuestionLine === -1) firstQuestionLine = weiterführendLine >= 0 ? weiterführendLine : i;
      lastQuestionLine = i;
      continue;
    }
    if (currentQuestion && /^-\s+.+/.test(line)) {
      currentQuestion.options.push(line.replace(/^-\s+/, ""));
      lastQuestionLine = i;
      continue;
    }
    if (currentQuestion && line === "") {
      lastQuestionLine = i;
      continue;
    }
    if (currentQuestion && line !== "") {
      questions.push(currentQuestion);
      currentQuestion = null;
      break;
    }
  }
  if (currentQuestion) {
    questions.push(currentQuestion);
    lastQuestionLine = lines.length - 1;
  }

  if (questions.length === 0) {
    return { questions: [], textBefore: text, textAfter: "" };
  }

  const textBefore = lines.slice(0, firstQuestionLine).join("\n").trim();
  const textAfter = lines.slice(lastQuestionLine + 1).join("\n").trim();
  return { questions, textBefore, textAfter };
}

export function InteractiveQuestions({
  questions,
  onOptionClick,
}: {
  questions: ParsedQuestion[];
  onOptionClick?: (text: string) => void;
}) {
  const [customText, setCustomText] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  // Questions without options = "Weiterführend" follow-up suggestions (no step-by-step)
  const isFollowUp = questions.every(q => q.options.length === 0);
  // Single question = send immediately on click
  const isSingleQuestion = questions.length === 1 && questions[0].options.length > 0;

  const handleOptionSelect = (qIdx: number, option: string) => {
    // Single question: send immediately
    if (isSingleQuestion) {
      onOptionClick?.(option);
      return;
    }

    // Multi-question step-by-step: record answer and advance
    const newAnswers = { ...answers, [qIdx]: option };
    setAnswers(newAnswers);

    // If this was the last question, send all answers
    if (qIdx >= questions.length - 1) {
      const parts = questions.map((_, i) => newAnswers[i]).filter(Boolean);
      if (parts.length > 0) onOptionClick?.(parts.join(". "));
    } else {
      // Advance to next step after a brief delay for the selection to register visually
      setTimeout(() => setCurrentStep(qIdx + 1), 300);
    }
  };

  const handleSendCustom = () => {
    if (customText.trim()) {
      const parts = questions.map((_, i) => answers[i]).filter(Boolean);
      parts.push(customText.trim());
      onOptionClick?.(parts.join(". "));
      setCustomText("");
    }
  };

  const currentQ = questions[currentStep];
  const totalSteps = questions.length;
  const isLastStep = currentStep >= totalSteps - 1;

  if (isFollowUp) {
    return (
      <div className="mt-5 space-y-2">
        <p className="text-[12px] font-medium text-muted-foreground/50 uppercase tracking-wider">Weiterführend</p>
        <div className="flex flex-col gap-2">
          {questions.map((q, qIdx) => (
            <button
              key={qIdx}
              onClick={() => onOptionClick?.(q.question)}
              className="group text-left px-4 py-3 rounded-xl border border-border/40 bg-card/50 hover:bg-card hover:border-border/60 hover:shadow-md hover:shadow-foreground/[0.02] transition-all duration-200 flex items-start gap-2.5"
            >
              <Send className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-foreground/50 transition-colors mt-0.5 shrink-0" />
              <span className="text-[13.5px] text-foreground/70 group-hover:text-foreground leading-relaxed transition-colors">
                {renderMarkdownInline(q.question)}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {/* Progress indicator for multi-step */}
      {totalSteps > 1 && (
        <div className="flex items-center gap-1.5 px-1">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i < currentStep
                  ? "bg-foreground/25 flex-1"
                  : i === currentStep
                  ? "bg-foreground/50 flex-[2]"
                  : "bg-border/50 flex-1"
              }`}
            />
          ))}
          <span className="text-[11px] text-muted-foreground/40 ml-1.5 tabular-nums">
            {currentStep + 1}/{totalSteps}
          </span>
        </div>
      )}

      {/* Answered questions summary */}
      {currentStep > 0 && (
        <div className="space-y-1 pl-1">
          {questions.slice(0, currentStep).map((q, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px] text-muted-foreground/50">
              <span className="truncate">{renderMarkdownInline(q.question)}</span>
              <ChevronRight className="h-3 w-3 shrink-0 opacity-30" />
              <span className="font-medium text-foreground/60 truncate">{renderMarkdownInline(answers[i] || "")}</span>
            </div>
          ))}
        </div>
      )}

      {/* Current question with animation */}
      <AnimatePresence mode="wait">
        {currentQ && (
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="space-y-2.5"
          >
            <div className="flex items-start gap-2">
              <MessageCircleQuestion className="h-4 w-4 text-foreground/40 mt-0.5 shrink-0" />
              <p className="text-[14px] font-medium text-foreground/80">{renderMarkdownInline(currentQ.question)}</p>
            </div>
            <div className="flex flex-wrap gap-2 pl-6">
              {currentQ.options.map((opt, oIdx) => {
                const isSelected = answers[currentStep] === opt;
                return (
                  <button
                    key={oIdx}
                    onClick={() => handleOptionSelect(currentStep, opt)}
                    className={`px-3.5 py-2 rounded-xl text-[13px] font-medium border transition-all duration-200 ${
                      isSelected
                        ? "border-foreground/30 bg-foreground/[0.08] text-foreground shadow-sm"
                        : "border-border/50 bg-card/60 text-foreground/70 hover:bg-card hover:border-border/70 hover:text-foreground hover:shadow-sm"
                    }`}
                  >
                    {renderMarkdownInline(opt)}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom input — always visible */}
      <div className="pl-6 pt-1">
        <div className="flex items-center gap-2">
          <Input
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendCustom();
              }
            }}
            placeholder="Oder eigene Antwort eingeben…"
            className="h-9 text-[13px] rounded-xl border-border/40 bg-card/40 placeholder:text-muted-foreground/30 focus-visible:ring-foreground/10"
          />
          {customText.trim().length > 0 && (
            <button
              onClick={handleSendCustom}
              className="h-9 w-9 shrink-0 rounded-xl bg-foreground text-background flex items-center justify-center hover:bg-foreground/90 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
