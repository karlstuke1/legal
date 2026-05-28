import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Circle, Archive, CheckCircle2 } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  active: {
    label: "Aktiv",
    icon: Circle,
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20",
  },
  archived: {
    label: "Archiviert",
    icon: Archive,
    className: "bg-muted text-muted-foreground border-border/40 hover:bg-muted/80",
  },
  closed: {
    label: "Abgeschlossen",
    icon: CheckCircle2,
    className: "bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20",
  },
};

interface MatterStatusBadgeProps {
  status: string;
  onStatusChange?: (status: string) => void;
  readOnly?: boolean;
}

export default function MatterStatusBadge({ status, onStatusChange, readOnly }: MatterStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.active;
  const Icon = config.icon;

  const badge = (
    <Badge
      variant="outline"
      className={`text-[11px] font-medium gap-1 cursor-pointer transition-colors ${config.className}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );

  if (readOnly || !onStatusChange) return badge;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{badge}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const ItemIcon = cfg.icon;
          return (
            <DropdownMenuItem
              key={key}
              onClick={() => onStatusChange(key)}
              className="text-[13px] gap-2"
            >
              <ItemIcon className="h-3.5 w-3.5" />
              {cfg.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
