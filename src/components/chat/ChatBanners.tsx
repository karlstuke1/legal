import { Shield, Lock, AlertTriangle, FolderOpen } from "lucide-react";
import type { ChatFilters } from "@/lib/types";
import type { Matter } from "@/lib/matters-api";

interface ChatBannersProps {
  filters: ChatFilters;
  currentMatter?: Matter;
  privacyNoStore: boolean;
  autoPseudonymize?: boolean;
  isLawyer: boolean;
  onShowLawyerHint: () => void;
}

export function ChatBanners({ filters, currentMatter, privacyNoStore, autoPseudonymize, isLawyer, onShowLawyerHint }: ChatBannersProps) {
  return (
    <>
      {/* Draft AI Act transparency */}
      {filters.mode === "draft" && (
        <div className="flex items-center justify-center gap-2 py-1.5 px-3 sm:px-4 text-[10px] sm:text-[11px] text-amber-700/70 dark:text-amber-400/60 bg-amber-50/40 dark:bg-amber-950/15 border-b border-amber-200/20">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Art. 50 AI Act: KI-generierte Schriftsätze sind gegenüber Mandanten und Gerichten als solche zu kennzeichnen.</span>
        </div>
      )}

      {/* Vault context info */}
      {filters.mode === "vault" && currentMatter && (
        <div className="flex items-center justify-center gap-2 py-2 px-3 sm:px-4 text-[12px] sm:text-[13px] text-foreground/60 bg-muted/20 border-b border-border/20">
          <FolderOpen className="h-3.5 w-3.5 opacity-50 shrink-0" />
          <span>Mandantenakte: <strong>{currentMatter.name}</strong></span>
        </div>
      )}
      {filters.mode === "vault" && !currentMatter && (
        <div className="flex items-center gap-2 py-2 sm:py-2.5 px-3 sm:px-4 text-[11px] sm:text-[13px] text-amber-600/70 bg-amber-50/50 dark:bg-amber-950/20 border-b border-amber-200/30">
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span>Wählen Sie eine Mandantenakte aus, um mit Ihren Dokumenten zu arbeiten.</span>
        </div>
      )}

      {/* Privacy no-store banner */}
      {privacyNoStore && (
        <div className="flex items-center justify-center gap-2 py-1.5 sm:py-2 px-3 sm:px-4 text-[11px] sm:text-[13px] text-muted-foreground bg-muted/30 border-b border-border/20">
          <Shield className="h-3.5 w-3.5 opacity-50 shrink-0" />
          <span>Datenschutz-Modus aktiv — Nachrichten werden <strong>nicht gespeichert</strong></span>
        </div>
      )}

      {/* Auto-pseudonymization banner — RAO § 9 mitigation */}
      {autoPseudonymize && (
        <div className="flex items-center justify-center gap-2 py-1.5 sm:py-2 px-3 sm:px-4 text-[11px] sm:text-[13px] text-emerald-700/80 dark:text-emerald-400/70 bg-emerald-50/40 dark:bg-emerald-950/20 border-b border-emerald-200/30">
          <Lock className="h-3.5 w-3.5 opacity-60 shrink-0" />
          <span>
            Auto-Pseudonymisierung aktiv — Mandantendaten werden vor der KI-Anfrage durch Platzhalter ersetzt
          </span>
        </div>
      )}

      {/* Lawyer confidentiality hint — only when neither protection is on */}
      {isLawyer && !privacyNoStore && !autoPseudonymize && (
        <div className="flex items-center justify-center gap-2 py-1.5 px-3 sm:px-4 text-[10px] sm:text-[12px] text-muted-foreground/70 bg-muted/15 border-b border-border/15">
          <Lock className="h-3 w-3 opacity-40 shrink-0" />
          <span>
            <span className="sm:hidden">Mandantendaten pseudonymisieren</span>
            <span className="hidden sm:inline">Mandantendaten vor Eingabe pseudonymisieren</span>
            {" — "}
            <button onClick={onShowLawyerHint} className="underline hover:text-foreground transition-colors">Mehr erfahren</button>
          </span>
        </div>
      )}
    </>
  );
}
