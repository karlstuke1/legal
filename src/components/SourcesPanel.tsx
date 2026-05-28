import { useState, useMemo } from "react";
import { ExternalLink, ChevronRight, ChevronDown, Clock, Search, Loader2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { RetrievalResult } from "@/lib/retrieval";
import { formatSourceLabel } from "@/lib/ris-url-utils";
import { AnimatePresence, motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface SourcesPanelProps {
  results: { provider: string; results: RetrievalResult[]; latencyMs?: number }[];
  isLoading?: boolean;
}

const PROVIDER_META: Record<string, { color: string; dotColor: string; label: string; description: string }> = {
  RIS: {
    color: "bg-blue-500/8 text-blue-700 dark:text-blue-300",
    dotColor: "bg-blue-500",
    label: "RIS",
    description: "Rechtsinformationssystem (AT)",
  },
  "RIS-Landesrecht": {
    color: "bg-sky-500/8 text-sky-700 dark:text-sky-300",
    dotColor: "bg-sky-500",
    label: "RIS Landesrecht",
    description: "Bundesländer-spezifische Gesetze (RIS)",
  },
  FINDOK: {
    color: "bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
    dotColor: "bg-emerald-500",
    label: "Findok",
    description: "Finanzdokumentation (BMF)",
  },
  PARLAMENT: {
    color: "bg-orange-500/8 text-orange-700 dark:text-orange-300",
    dotColor: "bg-orange-500",
    label: "Parlament",
    description: "Parlamentsmaterialien (AT)",
  },
  VECTOR: {
    color: "bg-indigo-500/8 text-indigo-700 dark:text-indigo-300",
    dotColor: "bg-indigo-500",
    label: "Semantische Suche",
    description: "Vektorbasierte Dokumentensuche",
  },
};

// Wildcard matching for dynamic providers like TOOL:search_law, VECTOR:RIS etc.
const WILDCARD_META: { prefix: string; meta: typeof PROVIDER_META[string] }[] = [
  {
    prefix: "TOOL:",
    meta: {
      color: "bg-orange-500/8 text-orange-700 dark:text-orange-300",
      dotColor: "bg-orange-500",
      label: "Agent-Recherche",
      description: "Autonome KI-Recherche",
    },
  },
  {
    prefix: "VECTOR:",
    meta: {
      color: "bg-indigo-500/8 text-indigo-700 dark:text-indigo-300",
      dotColor: "bg-indigo-500",
      label: "Semantische Suche",
      description: "Vektorbasierte Dokumentensuche",
    },
  },
];

function getProviderMeta(provider: string) {
  if (PROVIDER_META[provider]) return PROVIDER_META[provider];
  for (const w of WILDCARD_META) {
    if (provider.startsWith(w.prefix)) return { ...w.meta, label: `${w.meta.label}` };
  }
  return {
    color: "bg-muted text-foreground",
    dotColor: "bg-muted-foreground",
    label: provider,
    description: provider,
  };
}

const JURISDICTION_CHIPS = [
  { key: "AT", label: "AT", providers: ["RIS", "FINDOK", "PARLAMENT"] },
  { key: "EU", label: "EU", providers: ["EURLEX", "CURIA"] },
];

export function SourcesPanel({ results, isLoading }: SourcesPanelProps) {
  const totalResults = results.reduce((sum, r) => sum + (r.results?.length ?? 0), 0);
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string | null>(null);
  // Harvey-style: on desktop the panel is always visible; on mobile it
  // opens as a bottom drawer triggered by the floating source-count FAB.
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredResults = useMemo(() => {
    let filtered = results;

    // Filter by jurisdiction
    if (jurisdictionFilter) {
      const chip = JURISDICTION_CHIPS.find(c => c.key === jurisdictionFilter);
      if (chip) {
        filtered = filtered.filter(r => chip.providers.some(p => r.provider.startsWith(p)));
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.map(r => ({
        ...r,
        results: r.results.filter(res =>
          (res.title || "").toLowerCase().includes(q) ||
          (res.doc_ref || "").toLowerCase().includes(q) ||
          (res.snippet || "").toLowerCase().includes(q)
        ),
      })).filter(r => r.results.length > 0);
    }

    return filtered;
  }, [results, searchQuery, jurisdictionFilter]);

  // Harvey-style: never disappear on desktop. On mobile we still hide the
  // floating-count button when there's nothing to count (no chip-with-zero
  // noise); the desktop side panel stays visible with an empty state.
  const hasNoResults = totalResults === 0 && !isLoading;
  if (isMobile && hasNoResults) return null;

  const filterBar = (
    <div className="space-y-2 px-3 pb-3 border-b border-border/20">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Quellen durchsuchen…"
          className="h-7 pl-7 text-[11px] bg-muted/20 border-border/30 rounded-lg"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X className="h-3 w-3 text-muted-foreground/40 hover:text-foreground" />
          </button>
        )}
      </div>
      <div className="flex gap-1">
        {JURISDICTION_CHIPS.map(chip => (
          <button
            key={chip.key}
            onClick={() => setJurisdictionFilter(jurisdictionFilter === chip.key ? null : chip.key)}
            className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
              jurisdictionFilter === chip.key
                ? "bg-foreground/10 text-foreground"
                : "bg-muted/20 text-muted-foreground/50 hover:text-muted-foreground/70"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );

  // Shared body rendered on both desktop and mobile.
  const panelBody = (
    <>
      <div className="pt-3">{filterBar}</div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {isLoading && totalResults === 0 && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ))}
            </div>
          )}
          {filteredResults.map(({ provider, results: provResults, latencyMs }) => {
            if (!provResults?.length) return null;
            return (
              <ProviderGroup key={provider} provider={provider} results={provResults} latencyMs={latencyMs} />
            );
          })}
          {filteredResults.length === 0 && !isLoading && (searchQuery || jurisdictionFilter) && (
            <div className="text-center py-6">
              <p className="text-[12px] text-muted-foreground/40">Keine Quellen gefunden</p>
            </div>
          )}
          {hasNoResults && !searchQuery && !jurisdictionFilter && (
            <div className="text-center py-10 px-4">
              <Search className="h-5 w-5 text-muted-foreground/20 mx-auto mb-3" aria-hidden="true" />
              <p className="text-[12px] text-muted-foreground/50 leading-relaxed">
                Quellen zu deiner Frage erscheinen hier automatisch — sobald die KI in RIS, Findok oder Parlament recherchiert.
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );

  // Mobile: floating count button + bottom-sheet drawer, internal state.
  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+7rem)] right-4 z-30 flex items-center gap-1.5 rounded-full bg-card border border-border/50 shadow-lg px-3 py-2 min-h-[44px]"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-[12px] font-medium text-foreground/70">{totalResults}</span>
        </button>
        <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
          <DrawerContent className="max-h-[75vh]">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-[14px] font-medium flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground/50" />
                Quellen
                <span className="text-[12px] text-muted-foreground/40 tabular-nums ml-auto">{totalResults} Treffer</span>
              </DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col flex-1 min-h-0">
              {panelBody}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  // Desktop: always-visible fixed-width side panel (Harvey-style).
  // sticky top-0 + h-screen keeps the panel anchored to the viewport even
  // when an ancestor scrolls — without that, scrolling the chat scrolls
  // the sources away too. min-h-0 on the wrapping flex makes sure the
  // inner ScrollArea can shrink properly.
  return (
    <aside className="border-l border-border/30 bg-background/95 backdrop-blur-md shrink-0 flex flex-col overflow-hidden w-[340px] lg:w-[380px] sticky top-0 self-start h-screen min-h-0">
      <div className="h-12 flex items-center gap-2.5 px-4 border-b border-border/30 shrink-0">
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 text-muted-foreground/50 animate-spin shrink-0" />
        ) : (
          <Search className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        )}
        <span className="text-[13px] font-medium text-foreground/70 flex-1 tracking-tight">
          {isLoading ? "Quellen werden durchsucht…" : "Quellen"}
        </span>
        {!isLoading && (
          <span className="text-[11px] text-muted-foreground/40 tabular-nums">{totalResults}</span>
        )}
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{panelBody}</div>
    </aside>
  );
}

function ProviderGroup({
  provider,
  results,
  latencyMs,
}: {
  provider: string;
  results: RetrievalResult[];
  latencyMs?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = getProviderMeta(provider);

  const realResults = results.filter(r => r.score > 0.5);
  const fallbackResults = results.filter(r => r.score <= 0.5);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 text-[12px] font-medium text-muted-foreground/60 hover:text-foreground mb-2.5 group transition-colors duration-200"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ${meta.color}`}>
              <div className={`h-1.5 w-1.5 rounded-full ${meta.dotColor}`} />
              {meta.label}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[11px]">{meta.description}</TooltipContent>
        </Tooltip>
        <span className="flex-1 text-left text-muted-foreground/40">{realResults.length}</span>
        {/* latency hidden — not relevant for users */}
      </button>
      {expanded && (
        <div className="pl-5 space-y-2 min-w-0 overflow-hidden">
          {realResults.map((r, i) => (
            <SourceCard key={i} result={r} index={i} />
          ))}
          {fallbackResults.map((r, i) => (
            <div
              key={`fb-${i}`}
              className="rounded-xl border border-dashed border-border/30 bg-muted/20 p-3 text-xs min-w-0 overflow-hidden"
            >
              <div className="flex items-center gap-2 text-muted-foreground/50">
                <AlertCircle className="h-3 w-3" />
                <span className="text-[11px]">Manuelle Suche empfohlen</span>
              </div>
              {r.url && (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-foreground/50 underline underline-offset-2 mt-1 inline-block hover:text-foreground transition-colors"
                >
                  Direkt in {meta.label} suchen →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceCard({ result: r, index: i }: { result: RetrievalResult; index: number }) {
  return (
    <HoverCard openDelay={300}>
      <HoverCardTrigger asChild>
        <div
          className="rounded-xl border border-border/30 bg-card/50 p-3.5 text-xs space-y-2 hover:bg-card hover:shadow-md hover:shadow-foreground/[0.02] hover:border-border/50 transition-all duration-300 group cursor-default overflow-hidden min-w-0"
        >
          <div className="flex items-start justify-between gap-2 min-w-0">
            {/* break-all + overflow-wrap:anywhere force long unspaced
                citation strings like "12Os26/70,9Os36/76,..." to wrap
                instead of overflowing the card horizontally. */}
            <p className="flex-1 min-w-0 font-medium text-foreground/80 leading-snug line-clamp-2 group-hover:text-foreground transition-colors duration-200 break-all [overflow-wrap:anywhere]">
              {r.title ?? "Ohne Titel"}
            </p>
            {r.url && (
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 p-1.5 rounded-lg hover:bg-muted/30 transition-colors duration-200"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3 text-muted-foreground/40 hover:text-foreground" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground/50 flex-wrap min-w-0 max-w-full">
            {r.doc_ref && r.url ? (
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-foreground/60 underline underline-offset-2 decoration-border hover:decoration-foreground/40 hover:text-foreground transition-colors truncate max-w-full"
                onClick={e => e.stopPropagation()}
              >
                {formatSourceLabel(r.doc_ref, r.title)}
              </a>
            ) : r.doc_ref ? (
              <span className="font-mono text-[10px] truncate max-w-full">{formatSourceLabel(r.doc_ref, r.title)}</span>
            ) : null}
            {r.date && (
              <>
                <span className="text-border/50">·</span>
                <span className="text-[10px] tabular-nums text-muted-foreground/50">{r.date}</span>
              </>
            )}
            {r.pinpoint && r.pinpoint !== r.doc_ref && (
              <>
                <span className="text-border/50">·</span>
                <span className="font-medium text-foreground/60 text-[10px]">{r.pinpoint}</span>
              </>
            )}
          </div>
        </div>
      </HoverCardTrigger>
      {(r.snippet || (r.highlights && r.highlights.length > 0)) && (
        <HoverCardContent side="left" className="w-80 p-3">
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed italic line-clamp-6">
            {r.snippet || r.highlights?.[0] || ""}
          </p>
          {r.url && (
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[10px] text-foreground/50 hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Quelle öffnen
            </a>
          )}
        </HoverCardContent>
      )}
    </HoverCard>
  );
}
