import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TourStep {
  selector: string;
  title: string;
  description: string;
  placement?: "top" | "bottom" | "left" | "right";
  route?: string; // navigate here before showing step
}

const TOUR_STEPS: TourStep[] = [
  // Welcome
  {
    selector: "[data-tour='sidebar']",
    title: "Willkommen bei deinem Rechtsassistenten! 👋",
    description: "Lass uns gemeinsam die wichtigsten Funktionen durchgehen. Die Sidebar ist dein Hauptnavigationsbereich — hier findest du alles auf einen Blick.",
    placement: "right",
    route: "/app/chat",
  },
  // New chat button
  {
    selector: "[data-tour='new-chat-btn']",
    title: "Neuen Chat starten",
    description: "Klicke hier, um eine neue Rechtsfrage zu stellen. Jede Frage wird als eigener Chat gespeichert, den du jederzeit wieder aufrufen kannst.",
    placement: "right",
    route: "/app/chat",
  },
  // Sidebar search
  {
    selector: "[data-tour='sidebar-search']",
    title: "Chats durchsuchen",
    description: "Hier kannst du schnell nach früheren Chats suchen. Gib einfach ein Stichwort ein und finde sofort die passende Konversation.",
    placement: "right",
    route: "/app/chat",
  },
  // Nav: Assistent
  {
    selector: "[data-tour='nav-assistant']",
    title: "KI-Rechtsassistent",
    description: "Dein zentraler Arbeitsbereich. Stelle Rechtsfragen, lass Dokumente prüfen, erstelle Entwürfe oder übe für Klausuren — alles an einem Ort.",
    placement: "right",
    route: "/app/chat",
  },
  // Nav: Akten
  {
    selector: "[data-tour='nav-matters']",
    title: "Mandantenakten",
    description: "Organisiere deine Arbeit in Akten. Jede Akte kann mehrere Chats, Dokumente und Notizen enthalten — perfekt für Mandanten oder Projekte.",
    placement: "right",
    route: "/app/chat",
  },
  // Nav: Wissensbasis
  {
    selector: "[data-tour='nav-knowledge']",
    title: "Wissensbasis",
    description: "Lade eigene Dokumente hoch, die der Assistent als zusätzliche Quelle nutzen soll — z.B. interne Richtlinien, Verträge oder Gutachten.",
    placement: "right",
    route: "/app/chat",
  },
  // Nav: Vergleich
  {
    selector: "[data-tour='nav-compare']",
    title: "Vertragsvergleich",
    description: "Vergleiche zwei Verträge nebeneinander. Der Assistent analysiert Unterschiede und zeigt dir kritische Abweichungen auf.",
    placement: "right",
    route: "/app/chat",
  },
  // Nav: Gepinnt
  {
    selector: "[data-tour='nav-pinned']",
    title: "Gepinnte Antworten",
    description: "Speichere besonders hilfreiche Antworten als Favoriten. So findest du wichtige Ergebnisse schnell wieder.",
    placement: "right",
    route: "/app/chat",
  },
  // Pseudonymization info
  {
    selector: "[data-tour='nav-matters']",
    title: "🔒 Pseudonymisierung — Datenschutz für Mandantendaten",
    description: "Innerhalb jeder Mandantenakte kannst du hochgeladene Dokumente automatisch pseudonymisieren lassen. Die KI erkennt und ersetzt personenbezogene Daten (Namen, Adressen, Geburtsdaten) \u2014 so sch\u00fctzt du die Verschwiegenheitspflicht nach \u00a7 9 RAO / \u00a7 43a BRAO.\n\n\u00d6ffne eine Akte \u2192 Dateien \u2192 'Pseudonymisieren'.",
    placement: "right",
    route: "/app/chat",
  },
  // Mode selector
  {
    selector: "[data-tour='mode-selector']",
    title: "Modi — der richtige Modus für jede Aufgabe",
    description: "• Research: Tiefe Rechtsrecherche mit Quellenangaben\n• Prüfung: Dokumente analysieren und bewerten\n• Entwurf: Verträge & Schriftsätze erstellen\n• Study: Klausurtraining mit Falllösungen",
    placement: "top",
    route: "/app/chat",
  },
  // Composer
  {
    selector: "[data-tour='composer']",
    title: "Deine Frage eingeben",
    description: "Formuliere dein Anliegen so, wie du es einem Kollegen erklären würdest. Je mehr Kontext (Sachverhalt, Ziel, Rechtsgebiet), desto besser die Antwort. Du kannst auch Dateien per Drag & Drop anhängen.",
    placement: "top",
    route: "/app/chat",
  },
  // Matter dropdown
  {
    selector: "[data-tour='matter-dropdown']",
    title: "Chat einer Akte zuordnen",
    description: "Ordne den aktuellen Chat einer Mandantenakte zu. So bleiben alle Recherchen, Entwürfe und Analysen zu einem Fall übersichtlich gebündelt.",
    placement: "bottom",
    route: "/app/chat",
  },
  // Settings
  {
    selector: "[data-tour='nav-settings']",
    title: "Einstellungen",
    description: "Passe dein Profil an, verwalte dein Team, stelle Standard-Jurisdiktion und Rechtsgebiet ein oder ändere deinen Abonnement-Plan.",
    placement: "right",
    route: "/app/chat",
  },
  // Support widget (always visible)
  {
    selector: "[data-tour='support-widget']",
    title: "Hilfe & Support",
    description: "Du brauchst Hilfe? Klicke hier, um einen Bug zu melden, Feedback zu geben oder dieses Tutorial jederzeit erneut zu starten. Wir helfen dir gerne!",
    placement: "left",
    route: "/app/chat",
  },
];

interface ProductTourProps {
  isActive: boolean;
  onComplete: () => void;
}

export function ProductTour({ isActive, onComplete }: ProductTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const rafRef = useRef<number>();
  const navigate = useNavigate();
  const location = useLocation();

  const step = TOUR_STEPS[currentStep];

  // Reset on activation
  useEffect(() => {
    if (isActive) {
      setCurrentStep(0);
      setReady(false);
    }
  }, [isActive]);

  // Navigate to required route and wait for element
  useEffect(() => {
    if (!isActive || !step) return;

    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
    }

    // Wait for element to appear
    setReady(false);
    let attempts = 0;
    const interval = setInterval(() => {
      const el = document.querySelector(step.selector);
      if (el) {
        clearInterval(interval);
        setReady(true);
      } else {
        attempts++;
        if (attempts > 30) {
          clearInterval(interval);
          // Skip this step
          if (currentStep < TOUR_STEPS.length - 1) {
            setCurrentStep(s => s + 1);
          } else {
            onComplete();
          }
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isActive, currentStep, step, navigate, location.pathname, onComplete]);

  const positionTooltip = useCallback(() => {
    if (!isActive || !step || !ready) return;
    const el = document.querySelector(step.selector);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    setHighlightRect(rect);

    const padding = 16;
    const tooltipW = 360;
    const tooltipH = tooltipRef.current?.offsetHeight || 240;
    let top = 0, left = 0;
    const placement = step.placement || "bottom";

    switch (placement) {
      case "bottom":
        top = rect.bottom + padding;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
      case "top":
        top = rect.top - tooltipH - padding;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
      case "right":
        top = rect.top + rect.height / 2 - tooltipH / 2;
        left = rect.right + padding;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tooltipH / 2;
        left = rect.left - tooltipW - padding;
        break;
    }

    left = Math.max(12, Math.min(left, window.innerWidth - tooltipW - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - tooltipH - 12));

    setTooltipPos({ top, left });
  }, [isActive, step, ready]);

  useEffect(() => {
    if (!isActive || !ready) return;
    // Position twice: once immediately, once after render to use measured height
    positionTooltip();
    const raf = requestAnimationFrame(positionTooltip);
    const handler = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(positionTooltip);
    };
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, ready, positionTooltip]);

  if (!isActive || !step || !ready) return null;

  const isLast = currentStep === TOUR_STEPS.length - 1;
  const isFirst = currentStep === 0;
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[9998]" onClick={onComplete}>
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <mask id="tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {highlightRect && (
                <rect
                  x={highlightRect.left - 8}
                  y={highlightRect.top - 8}
                  width={highlightRect.width + 16}
                  height={highlightRect.height + 16}
                  rx="14"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0" y="0" width="100%" height="100%"
            fill="hsl(25 12% 10% / 0.6)"
            mask="url(#tour-mask)"
          />
        </svg>
      </div>

      {/* Highlight ring */}
      {highlightRect && (
        <div
          className="fixed z-[9999] pointer-events-none rounded-2xl ring-2 ring-primary/50 ring-offset-4 ring-offset-background/80"
          style={{
            top: highlightRect.top - 8,
            left: highlightRect.left - 8,
            width: highlightRect.width + 16,
            height: highlightRect.height + 16,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        key={currentStep}
        className="fixed z-[10000] w-[360px] bg-card border border-border/40 rounded-2xl shadow-2xl overflow-hidden"
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="h-1 bg-muted/30">
          <div
            className="h-full bg-primary/60 transition-all duration-300 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-5">
          <button
            onClick={onComplete}
            className="absolute top-4 right-4 text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            {isFirst && <Sparkles className="h-4 w-4 text-warning" />}
            <span className="text-[11px] font-medium text-muted-foreground/50">
              Schritt {currentStep + 1} von {TOUR_STEPS.length}
            </span>
          </div>
          <h3 className="text-[15px] font-semibold text-foreground mb-2 pr-6">{step.title}</h3>
          <p className="text-[12.5px] text-muted-foreground leading-relaxed mb-5 whitespace-pre-line">{step.description}</p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentStep((s) => s - 1)}
                disabled={isFirst}
                className="text-[12px] h-8 gap-1 px-2"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Zurück
              </Button>
              <button
                onClick={onComplete}
                className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground px-2 py-1 transition-colors"
              >
                Überspringen
              </button>
            </div>
            <Button
              size="sm"
              onClick={() => {
                if (isLast) {
                  onComplete();
                } else {
                  setCurrentStep((s) => s + 1);
                }
              }}
              className="text-[12px] h-8 gap-1"
            >
              {isLast ? "Los geht's! 🚀" : "Weiter"} {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
