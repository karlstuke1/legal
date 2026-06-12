import { useMemo } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SourcesPanelBody } from "@/components/SourcesPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { countSourceResults, type SourceGroup } from "@/lib/source-groups";

/**
 * Per-answer sources drawer. Citations are linked inline in the answer
 * text; this sheet is the optional "alle Quellen dieser Antwort" overview
 * (numbered Q{n} to match the inline [Quelle N] citations).
 */
export function MessageSourcesSheet({ results }: { results: SourceGroup[] }) {
  const isMobile = useIsMobile();
  const totalResults = useMemo(() => countSourceResults(results), [results]);
  if (totalResults === 0) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1.5 text-[12px] text-muted-foreground/40 hover:text-foreground hover:bg-muted/40 rounded-lg transition-all duration-200"
          title="Quellen dieser Antwort anzeigen"
        >
          <BookOpen className="h-3 w-3" />
          <span>Quellen ({totalResults})</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={isMobile
          ? "max-h-[75vh] flex flex-col p-0 pt-4"
          : "w-[340px] sm:w-[400px] sm:max-w-[400px] flex flex-col p-0 pt-4"}
      >
        <SheetHeader className="px-4 pb-2 text-left">
          <SheetTitle className="text-[14px] font-medium flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground/50" />
            Quellen
            <span className="text-[12px] font-normal text-muted-foreground/40 tabular-nums ml-auto mr-6">
              {totalResults} Treffer
            </span>
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col flex-1 min-h-0">
          <SourcesPanelBody results={results} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
