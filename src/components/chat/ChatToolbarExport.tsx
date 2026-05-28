import { useCallback } from "react";
import { createShareLink } from "@/lib/share-api";
import { exportToDocx } from "@/lib/docx-export";
import { useExport } from "@/lib/export";
import { toast } from "@/hooks/use-toast";
import type { ChatMessage } from "@/lib/types";
import type { RetrievalResult } from "@/lib/retrieval";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Download, Copy, Share2, FileText } from "lucide-react";

interface SourceGroup {
  provider: string;
  results: RetrievalResult[];
}

interface ChatToolbarExportProps {
  messages: ChatMessage[];
  sourceResults: SourceGroup[];
  sourceResultsMap: Record<string, SourceGroup[]>;
  activeChatId: string | null;
  userId?: string;
  matterName?: string;
}

export function ChatToolbarExport({
  messages, sourceResults, sourceResultsMap, activeChatId, userId, matterName,
}: ChatToolbarExportProps) {
  const { exportMarkdown, copyToClipboard } = useExport();

  const flattenSources = useCallback((srMap: Record<string, SourceGroup[]> | SourceGroup[]) => {
    const groups = Array.isArray(srMap) ? srMap : Object.values(srMap).flat();
    return groups.flatMap(sr =>
      sr.results.map(r => ({
        provider: sr.provider, title: r.title || "", doc_ref: r.doc_ref || "",
        url: r.url || "", date: r.date, snippet: r.snippet, pinpoint: r.pinpoint,
      }))
    );
  }, []);

  if (messages.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground/40 hover:text-foreground">
          <Download className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => {
          const sources = flattenSources(sourceResults);
          copyToClipboard({ messages, sources, title: messages[0]?.content?.text?.slice(0, 60) || "Recherche", matterName });
        }} className="gap-2 text-[13px]">
          <Copy className="h-3.5 w-3.5" /> Kopieren
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {
          const sources = flattenSources(sourceResults);
          exportMarkdown({ messages, sources, title: messages[0]?.content?.text?.slice(0, 60) || "Recherche", matterName });
        }} className="gap-2 text-[13px]">
          <Download className="h-3.5 w-3.5" /> Markdown Export
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {
          const sources = flattenSources(sourceResultsMap);
          exportToDocx({ messages, sources, title: messages[0]?.content?.text?.slice(0, 50), matterName });
        }} className="gap-2 text-[13px]">
          <FileText className="h-3.5 w-3.5" /> Word Export (.docx)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={async () => {
          if (!activeChatId || !userId) return;
          const share = await createShareLink(activeChatId, userId);
          if (share) {
            const url = `${window.location.origin}/shared/${share.token}`;
            await navigator.clipboard.writeText(url);
            toast({ title: "Link kopiert", description: "Der teilbare Link wurde in die Zwischenablage kopiert." });
          } else {
            toast({ title: "Fehler", description: "Share-Link konnte nicht erstellt werden.", variant: "destructive" });
          }
        }} className="gap-2 text-[13px]">
          <Share2 className="h-3.5 w-3.5" /> Link teilen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
