import type { ThinkingStep } from "@/components/ThinkingSteps";
import type { ChatFilters } from "@/lib/types";

/**
 * Generates simulated thinking steps based on the user query and active filters.
 * Steps are revealed progressively via timers to create the Harvey-like "working" effect.
 */
/** Detect draft/document-creation intent from query text */
export function isDraftIntent(query: string): boolean {
  return /(?:erstell|entwirf|formulier|schreib|verfass|mach\s+mir|generier|brauch[e]?\s+(?:einen?|ein)|bestell|dokument\s+(?:wie|für)|vorlage|muster|entwurf|template)/i.test(query)
    && /(?:vertrag|vereinbarung|schreiben|brief|klausel|AGB|NDA|kündigung|vollmacht|testament|satzung|beschluss|protokoll|dokument|schriftsatz|antrag|abmahnung|widerspruch|beschwerde|angebot)/i.test(query);
}

export function generateThinkingSteps(
  query: string,
  filters: ChatFilters,
  isFollowUp: boolean = false
): ThinkingStep[] {
  // Draft mode gets simplified, clarification-focused thinking steps
  if (filters.mode === "draft" || isDraftIntent(query)) {
    return generateDraftThinkingSteps(query);
  }

  // Exam mode gets simplified, tutor-focused thinking steps
  if (filters.mode === "exam") {
    return generateExamThinkingSteps(query);
  }

  // Follow-up messages get simplified steps (context already established)
  if (isFollowUp) {
    return generateFollowUpThinkingSteps(query, filters);
  }

  const steps: ThinkingStep[] = [];

  // Step 1: Classify the query
  steps.push({
    id: "assess",
    label: "Anfrage klassifizieren",
    status: "pending",
    description: "Fragetyp, Komplexität und erforderliche Analysetiefe werden bestimmt.",
  });

  // Step 2: Identify jurisdiction & legal area
  const jurisdictionPills = filters.jurisdiction.map((j) => ({
    label: "🇦🇹 Österreich",
    icon: "law" as const,
  }));
  steps.push({
    id: "jurisdiction",
    label: "Rechtsgebiet & Jurisdiktion bestimmen",
    status: "pending",
    pills: jurisdictionPills,
  });

  // Step 3: Check for file references
  const hasFileRef = /Datei|angehängt|Dokument|Vertrag|Anlage|Upload/i.test(query);
  if (hasFileRef) {
    steps.push({
      id: "review-file",
      label: "Dokument analysieren",
      status: "pending",
      description: "Struktur, Klauseln und rechtlich relevante Passagen werden extrahiert.",
    });
  }

  // Step 4: Extract legal terms & norms
  const legalTerms = extractLegalTerms(query);
  if (legalTerms.length > 0) {
    steps.push({
      id: "terms",
      label: "Normen & Begriffe identifizieren",
      status: "pending",
      pills: legalTerms.map((t) => ({ label: t, icon: "search" as const })),
    });
  }

  // Step 5: Search legal sources
  const sourceLabels: Record<string, string> = {
    RIS: "RIS",
    FINDOK: "Findok",
    PARLAMENT: "Parlament (AT)",
  };

  const activeSources = filters.autoRouter
    ? getAutoSources(query, filters.jurisdiction)
    : filters.sources.filter((s) => s !== "AUTO");

  if (activeSources.length > 0) {
    steps.push({
      id: "search-sources",
      label: "Rechtsquellen durchsuchen",
      status: "pending",
      pills: activeSources.map((s) => ({
        label: sourceLabels[s] || s,
        icon: "law" as const,
      })),
    });
  }

  // Step 6: Retrieve full text snippets
  steps.push({
    id: "extract-content",
    label: "Volltexte & Leitsätze laden",
    status: "pending",
    description: "Relevante Textpassagen aus den gefundenen Quellen werden extrahiert.",
  });

  // Step 7: Cross-reference & case law
  steps.push({
    id: "cross-reference",
    label: "Rechtsprechung abgleichen",
    status: "pending",
    description: "Gefundene Normen werden mit aktueller Rechtsprechung und h.M. abgeglichen.",
  });

  // Step 8: Subsumption & analysis
  steps.push({
    id: "subsumption",
    label: "Subsumtion durchführen",
    status: "pending",
    description: "Tatbestandsmerkmale werden geprüft und auf den Sachverhalt angewendet.",
  });

  // Step 9: Evaluate & synthesize
  steps.push({
    id: "evaluate",
    label: "Ergebnis bewerten",
    status: "pending",
    description: "Ergebnisse werden gewichtet, Gegenargumente geprüft und Risiken eingeschätzt.",
  });

  // Step 10: Prepare response
  steps.push({
    id: "prepare",
    label: "Antwort strukturieren",
    status: "pending",
  });

  return steps;
}

function generateDraftThinkingSteps(query: string): ThinkingStep[] {
  const steps: ThinkingStep[] = [];

  steps.push({
    id: "assess",
    label: "Anfrage analysieren",
    status: "pending",
    description: "Art des gewünschten Dokuments und Kontext werden bestimmt.",
  });

  steps.push({
    id: "check-context",
    label: "Sachverhalt prüfen",
    status: "pending",
    description: "Vorhandene Informationen zu Parteien, Gegenstand und Rahmenbedingungen werden erfasst.",
  });

  steps.push({
    id: "clarify",
    label: "Rückfragen vorbereiten",
    status: "pending",
    description: "Fehlende Angaben werden identifiziert, um einen präzisen Entwurf zu ermöglichen.",
  });

  steps.push({
    id: "prepare",
    label: "Antwort formulieren",
    status: "pending",
  });

  return steps;
}

function generateExamThinkingSteps(query: string): ThinkingStep[] {
  const steps: ThinkingStep[] = [];

  // Detect format from query
  const isQuiz = /quiz|multiple.choice|mc|fragen/i.test(query);
  const isFall = /fall|sachverhalt|falllösung|gutachten/i.test(query);
  const isKarteikarten = /karteikarte|definition|schema|begriffe/i.test(query);

  steps.push({
    id: "assess",
    label: "Lernformat erkennen",
    status: "pending",
    description: isQuiz ? "Multiple-Choice Quiz wird vorbereitet." : isFall ? "Falllösung wird vorbereitet." : isKarteikarten ? "Karteikarten-Abfrage wird vorbereitet." : "Format und Rechtsgebiet werden bestimmt.",
  });

  steps.push({
    id: "topic",
    label: "Rechtsgebiet & Schwierigkeit bestimmen",
    status: "pending",
  });

  if (isQuiz) {
    steps.push({ id: "generate", label: "Examensrelevante Fragen generieren", status: "pending" });
  } else if (isFall) {
    steps.push({ id: "generate", label: "Sachverhalt konstruieren", status: "pending" });
  } else if (isKarteikarten) {
    steps.push({ id: "generate", label: "Definitionen & Schemata laden", status: "pending" });
  } else {
    steps.push({ id: "generate", label: "Lernmaterial erstellen", status: "pending" });
  }

  steps.push({
    id: "prepare",
    label: "Antwort formulieren",
    status: "pending",
  });

  return steps;
}

function generateFollowUpThinkingSteps(query: string, filters: ChatFilters): ThinkingStep[] {
  const steps: ThinkingStep[] = [];

  // Check if query references files
  const hasFileRef = /Datei|angehängt|Dokument|Vertrag|Anlage|Upload/i.test(query);
  if (hasFileRef) {
    steps.push({
      id: "review-file",
      label: "Dokument analysieren",
      status: "pending",
    });
  }

  // Extract new legal terms
  const legalTerms = extractLegalTerms(query);
  if (legalTerms.length > 0) {
    steps.push({
      id: "terms",
      label: "Normen identifizieren",
      status: "pending",
      pills: legalTerms.map((t) => ({ label: t, icon: "search" as const })),
    });
  }

  // Simplified source search
  steps.push({
    id: "search-sources",
    label: "Quellen aktualisieren",
    status: "pending",
  });

  steps.push({
    id: "prepare",
    label: "Antwort strukturieren",
    status: "pending",
  });

  return steps;
}

function extractLegalTerms(query: string): string[] {
  const terms: string[] = [];
  const patterns = [
    /§\s*\d+[a-z]?\s*(?:Abs\.\s*\d+)?\s*(?:S\.\s*\d+)?\s*\w+/gi,
    /Art\.\s*\d+\s*(?:Abs\.\s*\d+)?\s*\w+/gi,
    /DSGVO|GDPR|ABGB|StGB|ZPO|UGB|GmbHG|AktG|UStG|EStG|MRG|KSchG|StPO|VStG|AVG|B-VG/g,
    /Schadensersatz|Haftung|Vertrag|Kündigung|Gewährleistung|Verjährung/gi,
    /Datenschutz|Compliance|Arbeitsrecht|Mietrecht|Gesellschaftsrecht/gi,
  ];

  for (const pat of patterns) {
    const matches = query.match(pat);
    if (matches) {
      for (const m of matches) {
        const trimmed = m.trim();
        if (trimmed.length > 2 && !terms.includes(trimmed)) {
          terms.push(trimmed);
        }
      }
    }
  }

  return terms.slice(0, 8);
}

function getAutoSources(query: string, jurisdictions: string[]): string[] {
  return ["RIS", "FINDOK", "PARLAMENT"];
}

/**
 * Progressively activates thinking steps.
 * Supports both callback-based (real) and timer-based (fallback) progression.
 * Returns a control object with advance() and cleanup().
 */
export interface ThinkingController {
  /** Advance a specific step by id to active or done */
  advanceStep: (stepId: string, status: "active" | "done") => void;
  /** Mark all steps as done */
  completeAll: () => void;
  /** Cleanup timers */
  cleanup: () => void;
}

export function runThinkingSteps(
  steps: ThinkingStep[],
  onUpdate: (steps: ThinkingStep[]) => void
): () => void {
  let currentIndex = 0;
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const currentSteps = [...steps];

  function advanceStep() {
    if (cancelled || currentIndex >= currentSteps.length) return;

    const updated = currentSteps.map((step, i) => {
      if (i < currentIndex) return { ...step, status: "done" as const };
      if (i === currentIndex) return { ...step, status: "active" as const };
      return { ...step, status: "pending" as const };
    });

    onUpdate(updated);
    currentIndex++;

    const currentStep = currentSteps[currentIndex - 1];
    const delay = currentStep?.pills && currentStep.pills.length > 0
      ? 1800 + Math.random() * 800
      : 1000 + Math.random() * 600;

    const timer = setTimeout(advanceStep, delay);
    timers.push(timer);
  }

  const startTimer = setTimeout(advanceStep, 300);
  timers.push(startTimer);

  return () => {
    cancelled = true;
    timers.forEach(clearTimeout);
  };
}

/**
 * Creates a callback-based thinking controller for real execution sync.
 * Use this when you want to manually control step progression.
 */
export function createThinkingController(
  steps: ThinkingStep[],
  onUpdate: (steps: ThinkingStep[]) => void
): ThinkingController {
  const currentSteps = steps.map(s => ({ ...s }));

  function updateSteps() {
    onUpdate([...currentSteps]);
  }

  return {
    advanceStep(stepId: string, status: "active" | "done") {
      const idx = currentSteps.findIndex(s => s.id === stepId);
      if (idx === -1) return;
      
      // Mark all previous steps as done when advancing
      if (status === "active") {
        for (let i = 0; i < idx; i++) {
          currentSteps[i].status = "done";
        }
      }
      currentSteps[idx].status = status;
      updateSteps();
    },
    completeAll() {
      for (const step of currentSteps) {
        step.status = "done";
      }
      updateSteps();
    },
    cleanup() {
      // No timers to clean up in callback mode
    },
  };
}
