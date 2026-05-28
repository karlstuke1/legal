import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/lib/workspace";
import { fetchAuditLogs, AUDIT_ACTION_LABELS, AUDIT_ACTION_CATEGORIES, type AuditLogEntry, type AuditAction } from "@/lib/audit";
import { Shield, Clock, Filter, FileText } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

const ACTION_COLORS: Record<string, string> = {
  login: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  logout: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  signup: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  password_reset: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  profile_update: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  data_export: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  account_delete: "bg-red-500/10 text-red-600 border-red-500/20",
  chat_create: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  chat_delete: "bg-red-500/10 text-red-600 border-red-500/20",
  file_upload: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  file_delete: "bg-red-500/10 text-red-600 border-red-500/20",
  matter_create: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  matter_delete: "bg-red-500/10 text-red-600 border-red-500/20",
  member_invite: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  member_remove: "bg-red-500/10 text-red-600 border-red-500/20",
  pseudonymization: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

export default function AuditLogTab() {
  const { activeWorkspace } = useWorkspace();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    if (!activeWorkspace?.id) return;
    setLoading(true);
    fetchAuditLogs(activeWorkspace.id, 200).then((data) => {
      setLogs(data);
      setLoading(false);
    });
  }, [activeWorkspace?.id]);

  const filteredLogs = filter === "all"
    ? logs
    : logs.filter((l) => {
        const category = Object.entries(AUDIT_ACTION_CATEGORIES).find(([, actions]) =>
          actions.includes(l.action)
        );
        return category?.[0] === filter;
      });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Audit-Log</CardTitle>
            </div>
            <Badge variant="outline" className="text-xs font-normal">
              {filteredLogs.length} Einträge
            </Badge>
          </div>
          <CardDescription>
            Protokoll aller datenschutzrelevanten Aktionen gemäß Art. 5 Abs. 2 DSGVO (Rechenschaftspflicht).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Aktionen</SelectItem>
                {Object.keys(AUDIT_ACTION_CATEGORIES).map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/50">
              <FileText className="h-8 w-8 mb-2" />
              <p className="text-sm">Keine Audit-Einträge vorhanden</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px] pr-3">
              <div className="space-y-1">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/30 transition-colors group"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 tabular-nums w-36 shrink-0">
                      <Clock className="h-3 w-3" />
                      {format(new Date(log.created_at), "dd.MM.yy HH:mm", { locale: de })}
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[11px] px-2 py-0.5 font-medium shrink-0 ${ACTION_COLORS[log.action] || ""}`}
                    >
                      {AUDIT_ACTION_LABELS[log.action] || log.action}
                    </Badge>
                    {log.resource_type && (
                      <span className="text-[11px] text-muted-foreground/40 truncate">
                        {log.resource_type}
                        {log.resource_id ? ` · ${log.resource_id.slice(0, 8)}…` : ""}
                      </span>
                    )}
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <span className="text-[11px] text-muted-foreground/30 hidden group-hover:inline truncate">
                        {JSON.stringify(log.metadata).slice(0, 60)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
