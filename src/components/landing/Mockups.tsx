import { Badge } from "@/components/ui/badge";
import { FolderOpen, FileText, MessageSquare, Check } from "lucide-react";

export function MattersMockup() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border/30">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-foreground/40" />
          <span className="text-[14px] font-semibold">Mandantenakten</span>
        </div>
      </div>
      <div className="p-4 space-y-2">
        {[
          { name: "Müller ./. Schmidt", status: "Aktiv", chats: 4, color: "bg-emerald-500" },
          { name: "Vertrag XYZ GmbH", status: "In Prüfung", chats: 2, color: "bg-amber-500" },
          { name: "Datenschutz-Audit 2026", status: "Aktiv", chats: 7, color: "bg-emerald-500" },
        ].map((m) => (
          <div key={m.name} className="flex items-center justify-between rounded-xl border border-border/30 px-4 py-3 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-3">
              <FolderOpen className="h-4 w-4 text-muted-foreground/40" />
              <div>
                <p className="text-[13px] font-medium">{m.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${m.color}`} />
                  <span className="text-[11px] text-muted-foreground/50">{m.status}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground/30">
              <MessageSquare className="h-3 w-3" />
              <span className="text-[11px]">{m.chats}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DocumentMockup() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border/30">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-foreground/40" />
          <span className="text-[14px] font-semibold">Dokumentenprüfung</span>
        </div>
      </div>
      <div className="p-5 space-y-3">
        <div className="rounded-xl bg-muted/20 border border-border/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-muted-foreground/40" />
            <span className="text-[12px] font-medium">Mietvertrag_2024.pdf</span>
            <Badge variant="secondary" className="text-[9px] h-4 ml-auto">12 Seiten</Badge>
          </div>
          <div className="space-y-2">
            {[
              { label: "Kündigungsfrist", value: "§ 12 — 3 Monate zum Quartalsende", risk: false },
              { label: "Mieterhöhung", value: "§ 8 — Indexklausel (VPI)", risk: false },
              { label: "Konkurrenzklausel", value: "§ 15 — Branchenausschluss fehlt", risk: true },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-2">
                <div className={`h-4 w-4 rounded-full flex items-center justify-center mt-0.5 shrink-0 ${
                  item.risk ? "bg-amber-500/10" : "bg-emerald-500/10"
                }`}>
                  {item.risk ? (
                    <span className="text-[8px] text-amber-600">!</span>
                  ) : (
                    <Check className="h-2.5 w-2.5 text-emerald-600" />
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-medium text-foreground/70">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground/50">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
