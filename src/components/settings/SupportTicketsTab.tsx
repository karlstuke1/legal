import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-safe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatCard } from "@/components/shared/StatCard";
import { TicketCheck, Clock, AlertCircle, CheckCircle2, XCircle, BarChart3 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  type: string;
  status: string;
  user_id: string;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: "open", label: "Offen", icon: AlertCircle, color: "text-amber-600 border-amber-500/30" },
  { value: "in_progress", label: "In Bearbeitung", icon: Clock, color: "text-blue-600 border-blue-500/30" },
  { value: "resolved", label: "Gelöst", icon: CheckCircle2, color: "text-emerald-600 border-emerald-500/30" },
  { value: "closed", label: "Geschlossen", icon: XCircle, color: "text-muted-foreground border-border/40" },
];

function getStatusConfig(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
}

export default function SupportTicketsTab() {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filter, setFilter] = useState<string>("all");

  const fetchTickets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!error && data) {
      setTickets(data as Ticket[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTickets(); }, []);

  const updateStatus = async (ticketId: string, newStatus: string) => {
    const { error } = await supabase
      .from("support_tickets")
      .update({ status: newStatus })
      .eq("id", ticketId);

    if (error) {
      toast({ title: "Fehler", description: "Status konnte nicht aktualisiert werden.", variant: "destructive" });
      return;
    }

    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t));
    toast({ title: "Status aktualisiert" });
  };

  if (loading) return <LoadingSpinner size="md" />;

  const openCount = tickets.filter(t => t.status === "open").length;
  const inProgressCount = tickets.filter(t => t.status === "in_progress").length;
  const resolvedCount = tickets.filter(t => t.status === "resolved" || t.status === "closed").length;

  const filtered = filter === "all" ? tickets : tickets.filter(t => t.status === filter);

  return (
    <div className="space-y-4 pt-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label="Gesamt" value={tickets.length.toString()} />
        <StatCard icon={<AlertCircle className="h-4 w-4 text-amber-600" />} label="Offen" value={openCount.toString()} accent="amber" />
        <StatCard icon={<Clock className="h-4 w-4 text-amber-600" />} label="In Bearbeitung" value={inProgressCount.toString()} accent="amber" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="Erledigt" value={resolvedCount.toString()} accent="emerald" />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-muted-foreground/50">Filter:</span>
        {["all", "open", "in_progress", "resolved", "closed"].map(f => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            className="text-[11px] h-7 rounded-lg"
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Alle" : getStatusConfig(f).label}
          </Button>
        ))}
      </div>

      <Card className="border-border/40 shadow-sm bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TicketCheck className="h-4 w-4 text-muted-foreground/50" />
            <CardTitle className="text-[15px]">Support-Tickets ({filtered.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState icon={TicketCheck} title="Keine Tickets" description="Es gibt keine Support-Tickets in dieser Kategorie." />
          ) : (
            <div className="space-y-0">
              {filtered.map((ticket) => {
                const statusCfg = getStatusConfig(ticket.status);
                const StatusIcon = statusCfg.icon;
                return (
                  <div key={ticket.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 px-3 rounded-lg hover:bg-muted/20 transition-colors border-b border-border/20 last:border-0">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${statusCfg.color.split(" ")[0]}`} />
                        <span className="text-[13px] font-medium truncate">{ticket.subject}</span>
                        <Badge variant="outline" className="text-[9px] px-1.5 shrink-0">
                          {ticket.type}
                        </Badge>
                      </div>
                      <p className="text-[12px] text-muted-foreground/60 line-clamp-2 pl-5.5">
                        {ticket.description}
                      </p>
                      <div className="flex items-center gap-3 pl-5.5">
                        <span className="text-[10px] text-muted-foreground/40 font-mono">{ticket.user_id.slice(0, 8)}…</span>
                        <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                          {new Date(ticket.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 sm:w-40">
                      <Select value={ticket.status} onValueChange={(v) => updateStatus(ticket.id, v)}>
                        <SelectTrigger className="h-8 text-[11px] rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value} className="text-[12px]">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
