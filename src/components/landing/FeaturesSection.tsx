import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  Search, FileText, PenTool, ListChecks, FolderOpen, GraduationCap,
  Shield, Lock, Globe, Scale, Eye, Check, Brain, Sparkles, Database,
  ShieldCheck, RefreshCw, Layers, Target, Users, MessageSquare, BookOpen, Zap,
} from "lucide-react";
import { fadeUp, stagger, FeatureCard, SourcePill } from "./shared";
import { MattersMockup, DocumentMockup } from "./Mockups";

export function TrustBar() {
  return (
    <section className="border-y border-border/30 bg-card/30" aria-label="Vertrauens-Indikatoren">
      <div className="mx-auto max-w-5xl px-6 py-8 flex flex-wrap items-center justify-center gap-8 md:gap-16">
        {[
          { icon: Shield, label: "DSGVO-konform" },
          { icon: Lock, label: "TLS 1.3 + AES-256" },
          { icon: Globe, label: "EU-Server" },
          { icon: Scale, label: "Mandantenkonform" },
          { icon: Eye, label: "Anti-Halluzination" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 text-muted-foreground/35" aria-hidden="true" />
            <span className="text-[13px] text-muted-foreground/50 font-medium">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ModesSection() {
  return (
    <section id="features" className="mx-auto max-w-5xl px-6 py-24" aria-labelledby="features-heading">
      <motion.div {...fadeUp} className="text-center mb-14">
        <h2 id="features-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          Sechs Modi. Jede juristische Aufgabe.
        </h2>
        <p className="text-muted-foreground/50 text-lg max-w-lg mx-auto">
          Spezialisierte KI-Workflows für Recherche, Prüfung, Entwurf und Prüfungsvorbereitung.
        </p>
      </motion.div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <FeatureCard icon={Search} title="Research" description="Autonome Recherche in RIS, FindOK und Parlament. Mit Multi-Step-Agent und Quellenverifizierung." />
        <FeatureCard icon={FileText} title="Dokumentenprüfung" description="Verträge, AGB und Schriftsätze hochladen. Strukturierte Analyse mit Risiko-Highlights und Alternativformulierungen." />
        <FeatureCard icon={PenTool} title="Entwurf" description="Dreistufiger Drafting-Workflow: Sachverhalt → Gliederung → Entwurf. Export als PDF, DOCX oder Markdown." />
        
        <FeatureCard icon={FolderOpen} title="Mandantenakten" description="Mandantenakten durchsuchen: Vergleiche, Extraktion, Inkonsistenzen und dokumentübergreifende Risikoanalyse." />
        <FeatureCard icon={GraduationCap} title="Prüfungsmodus" description="KI-Repetitor für die Examensvorbereitung: Falllösung, Multiple-Choice-Quiz und Karteikarten mit Bewertung." badge="Neu" />
      </div>
    </section>
  );
}

export function SourcesSection() {
  return (
    <section id="sources" className="border-y border-border/20 bg-card/30" aria-labelledby="sources-heading">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <motion.div {...fadeUp} className="text-center mb-14">
          <h2 id="sources-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Österreichische Rechtsdatenbanken. Vollständig integriert.
          </h2>
          <p className="text-muted-foreground/50 text-lg max-w-xl mx-auto">
            Live-Suche und semantische Vektorsuche — parallel und in Echtzeit. Die KI recherchiert autonom und verifiziert jede Quelle.
          </p>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground/40 uppercase tracking-wider px-1">🇦🇹 RIS — Rechtsinformationssystem</p>
            <SourcePill flag="⚖️" name="Bundesnormen" count="Gesetze" />
            <SourcePill flag="📋" name="Judikatur" count="OGH/VwGH/VfGH" />
            <SourcePill flag="📄" name="Erlässe & BMF" count="Verwaltung" />
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground/40 uppercase tracking-wider px-1">💰 FindOK — Finanzdokumentation</p>
            <SourcePill flag="💰" name="BMF-Erlässe" count="Steuerrecht" />
            <SourcePill flag="⚖️" name="BFG-Entscheidungen" count="Finanzgericht" />
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground/40 uppercase tracking-wider px-1">🏛️ Parlament — Materialien</p>
            <SourcePill flag="📜" name="Regierungsvorlagen" count="RV" />
            <SourcePill flag="📝" name="Ausschussberichte" count="AB" />
          </div>
        </div>
        <motion.div {...fadeUp} className="rounded-2xl border border-border/40 bg-card/60 p-6 mt-8">
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-foreground/[0.04] flex items-center justify-center shrink-0">
                <Target className="h-4 w-4 text-foreground/40" />
              </div>
              <div>
                <p className="text-[13px] font-semibold mb-0.5">Jurisdiktions-Isolation</p>
                <p className="text-[12px] text-muted-foreground/50 leading-relaxed">Strikte Trennung: AT-Quellen nur bei AT-Auswahl. Keine Vermischung von Rechtsordnungen.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-foreground/[0.04] flex items-center justify-center shrink-0">
                <Brain className="h-4 w-4 text-foreground/40" />
              </div>
              <div>
                <p className="text-[13px] font-semibold mb-0.5">Adaptive Rechtslogik</p>
                <p className="text-[12px] text-muted-foreground/50 leading-relaxed">Nicht nur Quellen — auch die dogmatische Methodik passt sich der Jurisdiktion an.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-foreground/[0.04] flex items-center justify-center shrink-0">
                <Layers className="h-4 w-4 text-foreground/40" />
              </div>
              <div>
                <p className="text-[13px] font-semibold mb-0.5">Hybrid-Suche</p>
                <p className="text-[12px] text-muted-foreground/50 leading-relaxed">Live-Retrieval + semantische Vektorsuche parallel für maximale Abdeckung.</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function AgenticSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <div className="grid md:grid-cols-2 gap-12 items-center">
        <motion.div {...fadeUp}>
          <Badge variant="secondary" className="mb-4 text-[11px] rounded-full">Autonome KI-Recherche</Badge>
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Der Agent recherchiert.{" "}
            <span className="text-muted-foreground/40">Sie entscheiden.</span>
          </h2>
          <p className="text-muted-foreground/55 text-[15px] leading-relaxed mb-6">
            Der KI-Agent nutzt drei spezialisierte Tools — <strong>search_law</strong>, <strong>lookup_norm</strong> und <strong>analyze_document</strong> — 
            um autonom in bis zu drei Recherche-Runden die relevantesten Quellen zu finden. Mit 6-stufigem Anti-Halluzinations-Framework.
          </p>
          <ul className="space-y-3">
            {[
              "Autonome Multi-Step-Recherche (max. 3 Runden)",
              "Post-Generation Zitations-Verifizierung",
              "Konfidenz-Bewertung für jede Antwort",
              "Inline-Quellenangaben mit Direktlinks",
              "OpenRouter GPT-5.5 OCR für gescannte Dokumente",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[13px] text-foreground/70">
                <Check className="h-4 w-4 text-foreground/30 mt-0.5 shrink-0" />
                {t}
              </li>
            ))}
          </ul>
        </motion.div>
        <motion.div {...fadeUp} transition={{ delay: 0.15, duration: 0.6 }}>
          <div className="rounded-2xl border border-border/50 bg-card/80 p-6 space-y-4">
            <p className="text-[12px] font-semibold text-muted-foreground/40 uppercase tracking-wider">Agent-Workflow</p>
            {[
              { step: "1", label: "Nutzer stellt Frage", icon: MessageSquare, status: "done" },
              { step: "2", label: "Agent ruft search_law auf", icon: Search, status: "done" },
              { step: "3", label: "Quellen werden analysiert", icon: Database, status: "done" },
              { step: "4", label: "Agent entscheidet: Nachrecherche nötig?", icon: Brain, status: "done" },
              { step: "5", label: "Verifizierte Antwort mit Inline-Quellen", icon: ShieldCheck, status: "active" },
            ].map((item) => (
              <div key={item.step} className="flex items-center gap-3">
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                  item.status === "active" ? "bg-foreground text-background" : "bg-foreground/[0.06]"
                }`}>
                  <item.icon className={`h-3.5 w-3.5 ${item.status === "active" ? "" : "text-foreground/40"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] ${item.status === "active" ? "font-semibold" : "text-muted-foreground/50"}`}>{item.label}</p>
                </div>
                {item.status === "done" && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                {item.status === "active" && <Sparkles className="h-3.5 w-3.5 text-foreground/60 shrink-0" />}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function MattersSection() {
  return (
    <section className="bg-card/30 border-y border-border/20">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div {...fadeUp}>
            <Badge variant="secondary" className="mb-4 text-[11px] rounded-full">Mandantenakten</Badge>
            <h2 className="text-3xl font-bold tracking-tight mb-4">
              Alle Fälle organisiert.{" "}
              <span className="text-muted-foreground/40">An einem Ort.</span>
            </h2>
            <p className="text-muted-foreground/55 text-[15px] leading-relaxed mb-6">
              Erstellen Sie Mandantenakten, ordnen Sie Chats und Dokumente zu und behalten Sie den Überblick 
              über den Status jedes Falls. Mit Tags, Notizen und chronologischer Verlaufsansicht.
            </p>
            <ul className="space-y-3">
              {["Chats automatisch der richtigen Akte zuordnen", "Dokumente hochladen und per KI analysieren", "Flow-Analyse und Datenextraktion", "Team-Zugriff mit Rollen und Berechtigungen"].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[13px] text-foreground/70">
                  <Check className="h-4 w-4 text-foreground/30 mt-0.5 shrink-0" /> {t}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div {...fadeUp} transition={{ delay: 0.15, duration: 0.6 }}>
            <MattersMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export function DocumentSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="grid md:grid-cols-2 gap-12 items-center">
        <motion.div {...fadeUp} className="order-2 md:order-1">
          <DocumentMockup />
        </motion.div>
        <motion.div {...fadeUp} transition={{ delay: 0.15, duration: 0.6 }} className="order-1 md:order-2">
          <Badge variant="secondary" className="mb-4 text-[11px] rounded-full">Dokumentenprüfung</Badge>
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Verträge prüfen.{" "}
            <span className="text-muted-foreground/40">In Sekunden.</span>
          </h2>
          <p className="text-muted-foreground/55 text-[15px] leading-relaxed mb-6">
            Laden Sie PDFs, DOCX oder Bilder hoch. Die KI extrahiert Kernklauseln, identifiziert Risiken 
            und liefert eine strukturierte Zusammenfassung — mit Verweis auf die relevanten Paragraphen.
          </p>
          <ul className="space-y-3">
            {["Automatische Klausel-Erkennung", "Risiko-Highlights und Warnungen", "Export als PDF, DOCX oder Markdown", "Pseudonymisierung sensibler Daten", "OCR-Parsing für gescannte Dokumente"].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[13px] text-foreground/70">
                <Check className="h-4 w-4 text-foreground/30 mt-0.5 shrink-0" /> {t}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  );
}

export function PersonalizationSection() {
  return (
    <section className="border-y border-border/20 bg-card/30">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <motion.div {...fadeUp} className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Lernt Ihren Arbeitsstil.</h2>
          <p className="text-muted-foreground/50 text-lg max-w-xl mx-auto">Session Memory, benutzerdefinierte Anweisungen und kontextbewusste Antworten.</p>
        </motion.div>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: Users, title: "Persönlicher Kontext", desc: "Hinterlegen Sie Ihre Rolle (Anwalt, Student, Inhouse) und individuelle Anweisungen. Die KI passt Detailgrad und Sprache an." },
            { icon: Sparkles, title: "Antwortstil", desc: "Definieren Sie, wie Antworten formatiert werden sollen — von akademisch-dogmatisch bis praxisorientiert-knapp." },
            { icon: RefreshCw, title: "Kontextmanagement", desc: "Intelligentes Sliding-Window mit KI-Zusammenfassung — auch bei langen Konversationen bleibt der Kontext erhalten." },
          ].map(({ icon: Icon, title, desc }) => (
            <motion.div key={title} {...stagger} className="rounded-2xl p-6 card-elevated bg-card/70">
              <div className="h-10 w-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center mb-4">
                <Icon className="h-5 w-5 text-foreground/50" />
              </div>
              <h3 className="text-[15px] font-semibold mb-1.5">{title}</h3>
              <p className="text-[13px] text-muted-foreground/60 leading-relaxed">{desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function StatsSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { value: "3", label: "Datenbanken", icon: BookOpen },
          { value: "6", label: "KI-Modi", icon: Zap },
          { value: "AT", label: "Österreichisches Recht", icon: Globe },
          { value: "100%", label: "DSGVO-konform", icon: Shield },
        ].map(({ value, label, icon: Icon }) => (
          <motion.div key={label} {...stagger} className="text-center">
            <div className="h-10 w-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center mx-auto mb-3">
              <Icon className="h-5 w-5 text-foreground/40" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight">{value}</p>
            <p className="text-[12px] text-muted-foreground/40 mt-1">{label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
