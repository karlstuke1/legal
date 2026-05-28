import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabase-safe";
import { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { Jurisdiction, ChatMode, LegalArea } from "@/lib/types";
import { JURISDICTION_LABELS, JURISDICTION_FLAGS, MODE_LABELS, LEGAL_AREA_LABELS } from "@/lib/types";
import { User, Shield, Sliders, Save, CheckCircle, Download, Trash2, AlertTriangle, Brain, MessageSquare } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { useWorkspace } from "@/lib/workspace";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Profile {
  display_name: string;
  user_role: string;
  default_jurisdiction: Jurisdiction[];
  default_sources: string[];
  default_mode: ChatMode;
  default_legal_area: LegalArea;
  privacy_no_store: boolean;
  auto_pseudonymize_chat: boolean;
  custom_instructions: string;
  response_style: string;
}

export default function ProfileSettingsTab() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [profile, setProfile] = useState<Profile>({
    display_name: "",
    user_role: "other",
    default_jurisdiction: ["AT"],
    default_sources: ["AUTO"],
    default_mode: "research",
    default_legal_area: "allgemein",
    privacy_no_store: false,
    auto_pseudonymize_chat: false,
    custom_instructions: "",
    response_style: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile({
            display_name: data.display_name || "",
            user_role: (data as any).user_role || "other",
            default_jurisdiction: (data.default_jurisdiction as Jurisdiction[]) || ["AT"],
            default_sources: (data.default_sources as string[]) || ["AUTO"],
            default_mode: (data.default_mode as ChatMode) || "research",
            default_legal_area: ((data as any).default_legal_area as LegalArea) || "allgemein",
            privacy_no_store: data.privacy_no_store || false,
            auto_pseudonymize_chat: (data as any).auto_pseudonymize_chat || false,
            custom_instructions: (data as any).custom_instructions || "",
            response_style: (data as any).response_style || "",
          });
        }
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: profile.display_name,
        user_role: profile.user_role,
        default_jurisdiction: profile.default_jurisdiction,
        default_sources: profile.default_sources,
        default_mode: profile.default_mode as any,
        default_legal_area: profile.default_legal_area,
        privacy_no_store: profile.privacy_no_store,
        auto_pseudonymize_chat: profile.auto_pseudonymize_chat,
        custom_instructions: profile.custom_instructions,
        response_style: profile.response_style,
      } as any)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      setSaved(true);
      logAudit({ action: "profile_update", workspaceId: activeWorkspace?.id, resourceType: "profile" });
      toast({ title: "Gespeichert" });
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Keine aktive Sitzung");

      const res = await supabase.functions.invoke("data-export", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.error) throw new Error(res.error.message || "Export fehlgeschlagen");

      const exportData = res.data;
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `datenexport-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      logAudit({ action: "data_export", workspaceId: activeWorkspace?.id, metadata: { format: "json", source: "edge-function" } });
      toast({ title: "Export abgeschlossen", description: "Vollständiger Datenexport heruntergeladen (Art. 15 & 20 DSGVO)." });
    } catch (e: any) {
      toast({ title: "Fehler beim Export", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Keine aktive Sitzung");

      const res = await supabase.functions.invoke("delete-account", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.error) throw new Error(res.error.message || "Löschung fehlgeschlagen");

      logAudit({ action: "account_delete", workspaceId: activeWorkspace?.id });
      toast({ title: "Konto gelöscht", description: "Ihr Konto und alle Daten wurden gelöscht." });
      await supabase.auth.signOut();
      window.location.href = "/auth";
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const roles = [
    { value: "anwalt", label: "Anwalt/Anwältin" },
    { value: "student", label: "Student/in" },
    { value: "inhouse", label: "Inhouse Counsel" },
    { value: "behoerde", label: "Behörde" },
    { value: "other", label: "Sonstige" },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Profil</CardTitle>
          </div>
          <CardDescription>Ihre persönlichen Informationen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={profile.display_name}
              onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">E-Mail</label>
            <Input value={user?.email || ""} disabled className="h-10 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Rolle</label>
            <Select value={profile.user_role} onValueChange={(v) => setProfile({ ...profile, user_role: v })}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Über mich</CardTitle>
          </div>
          <CardDescription>
            Erzählen Sie dem Assistenten etwas über sich. Diese Informationen werden in jedem Chat automatisch berücksichtigt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Was soll der Assistent über Sie wissen?
            </label>
            <Textarea
              value={profile.custom_instructions}
              onChange={(e) => setProfile({ ...profile, custom_instructions: e.target.value })}
              placeholder="z.B. Ich bin Fachanwalt für Arbeitsrecht in Wien. Meine Mandanten sind hauptsächlich KMUs. Ich arbeite oft mit österreichischem und EU-Recht..."
              className="min-h-[100px] resize-y text-sm"
              maxLength={2000}
            />
            <p className="text-[11px] text-muted-foreground/60 text-right">{profile.custom_instructions.length}/2000</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Antwortstil</CardTitle>
          </div>
          <CardDescription>
            Legen Sie fest, wie der Assistent antworten soll. Diese Präferenzen gelten für alle Chats.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Wie soll der Assistent antworten?
            </label>
            <Textarea
              value={profile.response_style}
              onChange={(e) => setProfile({ ...profile, response_style: e.target.value })}
              placeholder="z.B. Antworte immer auf Deutsch. Verwende eine formelle Sprache. Gib bei Urteilen immer das Aktenzeichen an. Fasse dich kurz, außer ich bitte um eine ausführliche Analyse..."
              className="min-h-[100px] resize-y text-sm"
              maxLength={2000}
            />
            <p className="text-[11px] text-muted-foreground/60 text-right">{profile.response_style.length}/2000</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Standard-Einstellungen</CardTitle>
          </div>
          <CardDescription>Werden bei jedem neuen Chat verwendet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Standard-Jurisdiktion</label>
            <div className="flex gap-2">
              {(Object.keys(JURISDICTION_LABELS) as Jurisdiction[]).map((j) => (
                <Badge
                  key={j}
                  variant={profile.default_jurisdiction.includes(j) ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1 text-xs transition-all"
                  onClick={() => {
                    const next = profile.default_jurisdiction.includes(j)
                      ? profile.default_jurisdiction.filter((x) => x !== j)
                      : [...profile.default_jurisdiction, j];
                    if (next.length > 0) setProfile({ ...profile, default_jurisdiction: next });
                  }}
                >
                  {JURISDICTION_FLAGS[j]} {JURISDICTION_LABELS[j]}
                </Badge>
              ))}
            </div>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Standard-Rechtsgebiet</label>
            <Select
              value={profile.default_legal_area}
              onValueChange={(v) => setProfile({ ...profile, default_legal_area: v as LegalArea })}
            >
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(LEGAL_AREA_LABELS) as [LegalArea, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Standard-Modus</label>
            <Select
              value={profile.default_mode}
              onValueChange={(v) => setProfile({ ...profile, default_mode: v as ChatMode })}
            >
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(MODE_LABELS) as [ChatMode, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Datenschutz</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Nachrichteninhalte nicht speichern</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Chat-Verlauf wird deaktiviert. Nachrichten werden nach der Sitzung gelöscht.
              </p>
            </div>
            <Switch
              checked={profile.privacy_no_store}
              onCheckedChange={(v) => setProfile({ ...profile, privacy_no_store: v })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="pr-4">
              <p className="text-sm font-medium">Auto-Pseudonymisierung im Chat</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Personenbezogene Daten (Namen, Adressen, IBAN) werden in deiner Eingabe automatisch
                durch Platzhalter ersetzt, bevor die Anfrage an die KI geht. Empfohlen für Anwält:innen
                bei Mandantenarbeit (RAO § 9 Verschwiegenheitspflicht).
              </p>
            </div>
            <Switch
              checked={profile.auto_pseudonymize_chat ?? false}
              onCheckedChange={(v) => setProfile({ ...profile, auto_pseudonymize_chat: v })}
            />
          </div>
          <Separator />
          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
              className="w-full h-10 text-sm"
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting ? "Exportiere…" : "Alle meine Daten exportieren (Art. 15 & 20 DSGVO)"}
            </Button>
            <Button
              variant="outline"
              className="w-full h-10 text-sm"
              onClick={() => {
                const checklist = `COMPLIANCE-CHECKLISTE FÜR DEN EINSATZ VON KI IN DER ANWALTSPRAXIS
=====================================================================
Stand: ${new Date().toLocaleDateString("de-DE")}

Diese Checkliste basiert auf den Anforderungen aus § 9 RAO, DSGVO und
der Verordnung (EU) 2024/1689 (AI Act).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. BERUFSRECHTLICHE PFLICHTEN (§ 9 RAO / § 43a BRAO / Art. 13 BGFA)

☐ Mandantendaten vor Eingabe pseudonymisiert
☐ ODER: Schriftliche Entbindung von der Verschwiegenheitspflicht eingeholt
   → Entbindung ist freiwillig, informiert und ausdrücklich
   → Mandant wurde über Datenfluss, Speicherort und Risiken aufgeklärt
   → Keine pauschale Klausel in AAB — mandatsspezifische Erklärung
☐ Datenschutz-Modus (Privacy No-Store) für sensible Daten aktiviert

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. DATENSCHUTZ (DSGVO)

☐ Rechtsgrundlage geprüft
   → Art. 6 Abs. 1 lit. a: Einwilligung des Mandanten eingeholt
   → ODER Art. 6 Abs. 1 lit. b: Vertragserfüllung (nur eigene Verarbeitung)
☐ Auftragsverarbeitungsvertrag (AVV) nach Art. 28 DSGVO vorhanden
☐ Drittstaatentransfer geprüft (Kapitel V DSGVO)
   → Standardvertragsklauseln (SCCs) abgeschlossen
   → Transfer Impact Assessment (TIA) durchgeführt
☐ Datenschutz-Folgenabschätzung (DSFA) nach Art. 35 DSGVO durchgeführt
☐ Technische und organisatorische Maßnahmen (TOMs) nach Art. 32 implementiert
   → Verschlüsselung (Transit + Rest)
   → Zugriffskontrollen
   → Pseudonymisierung
☐ Informationspflichten nach Art. 13/14 DSGVO erfüllt

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3. EU AI ACT — Verordnung (EU) 2024/1689

☐ Risikoklasse des KI-Systems bestimmt (Anhang III)
☐ Transparenzpflichten nach Art. 50 eingehalten:
   → Mandanten über KI-Einsatz informiert
   → Gerichte/Behörden über KI-generierte Schriftsätze informiert
   → KI-generierte Inhalte als solche gekennzeichnet
☐ Menschliche Aufsicht (Human-in-the-Loop) sichergestellt
   → Alle KI-Ergebnisse vor Verwendung überprüft
   → Quellen und Zitationen verifiziert
☐ Bei Hochrisiko-KI (falls zutreffend):
   → Risikomanagementsystem implementiert
   → Datenqualität sichergestellt
   → Technische Dokumentation vorhanden

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4. PROVIDER-PRÜFUNG

☐ Vertrauenswürdiger Anbieter gewählt
☐ Datenverarbeitung idealerweise in der EU
☐ Anbieter speichert keine Nutzerdaten
☐ Anbieter verwendet Daten nicht zum Training
☐ API-Gateway ohne Datenpersistenz

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5. INTERNE DOKUMENTATION

☐ Verzeichnis der Verarbeitungstätigkeiten aktualisiert (Art. 30 DSGVO)
☐ Interne Richtlinie zum KI-Einsatz erstellt
☐ Mitarbeiter geschult und informiert
☐ Regelmäßige Überprüfung der Compliance-Maßnahmen eingeplant

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

QUELLEN:
• § 9 RAO (Verschwiegenheitspflicht)
• OGH 4 Ob 54/07f | RS-Justiz RS0122247
• Art. 4, 6, 7, 13, 14, 25, 28, 32, 35 DSGVO
• EuGH C-311/18 (Schrems II)
• Verordnung (EU) 2024/1689 (AI Act), insb. Art. 50, Anhang III
• COM(2021) 206 final (Kommissionsvorschlag)

HINWEIS: Diese Checkliste dient als Orientierungshilfe und stellt
keine Rechtsberatung dar. Die konkrete Anwendung ist im Einzelfall
mit einem spezialisierten Rechtsanwalt abzustimmen.`;
                const blob = new Blob([checklist], { type: "text/plain;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "KI-Compliance-Checkliste-Anwalt.txt";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Shield className="h-4 w-4 mr-2" />
              KI-Compliance-Checkliste herunterladen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full h-11">
        {saving ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            Speichern…
          </span>
        ) : saved ? (
          <span className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Gespeichert
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            Einstellungen speichern
          </span>
        )}
      </Button>

      {/* Danger Zone */}
      <Card className="border-destructive/30 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <CardTitle className="text-base text-destructive">Gefahrenzone</CardTitle>
          </div>
          <CardDescription>Diese Aktionen können nicht rückgängig gemacht werden.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full h-10 text-sm" disabled={deleting}>
                <Trash2 className="h-4 w-4 mr-2" />
                {deleting ? "Lösche Konto…" : "Mein Konto und alle Daten löschen"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Konto endgültig löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Alle Ihre Daten werden unwiderruflich gelöscht: Profil, Chats, Nachrichten, 
                  Dokumente, Workspace-Daten und Ihr Benutzerkonto. Diese Aktion kann <strong>nicht 
                  rückgängig</strong> gemacht werden.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Endgültig löschen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
