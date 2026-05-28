import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import {
  fetchWorkspaceMembers,
  fetchInvitations,
  sendInvitation,
  revokeInvitation,
  updateMemberRole,
  removeMember,
  type Invitation,
} from "@/lib/invitations-api";
import { supabase } from "@/lib/supabase-safe";
import { toast } from "@/hooks/use-toast";
import { Users, UserPlus, Mail, X, Crown, Shield, Eye, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Member {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  display_name?: string;
  email?: string;
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  member: <User className="h-3 w-3" />,
  viewer: <Eye className="h-3 w-3" />,
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Eigentümer",
  admin: "Admin",
  member: "Mitglied",
  viewer: "Betrachter",
};

export default function TeamSettingsTab() {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const isAdminOrOwner = activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";

  const loadData = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const [membersData, invData] = await Promise.all([
        fetchWorkspaceMembers(activeWorkspace.id),
        isAdminOrOwner ? fetchInvitations(activeWorkspace.id) : Promise.resolve([]),
      ]);

      // Fetch display names from profiles
      const userIds = membersData.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, p.display_name])
      );

      setMembers(
        membersData.map((m) => ({
          ...m,
          display_name: profileMap.get(m.user_id) || undefined,
        }))
      );
      setInvitations(invData);
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeWorkspace?.id]);

  const handleInvite = async () => {
    if (!activeWorkspace || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await sendInvitation(activeWorkspace.id, inviteEmail.trim(), inviteRole);
      toast({ title: "Einladung gesendet", description: `An ${inviteEmail}` });
      setInviteEmail("");
      setInviteRole("member");
      setDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: "admin" | "member" | "owner" | "viewer") => {
    try {
      await updateMemberRole(memberId, newRole);
      toast({ title: "Rolle aktualisiert" });
      loadData();
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await removeMember(memberId);
      toast({ title: "Mitglied entfernt" });
      loadData();
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    }
  };

  const handleRevokeInvitation = async (invId: string) => {
    try {
      await revokeInvitation(invId);
      toast({ title: "Einladung zurückgezogen" });
      loadData();
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    }
  };

  if (!activeWorkspace) {
    return <p className="text-sm text-muted-foreground">Kein Workspace ausgewählt.</p>;
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Team</CardTitle>
            </div>
            {isAdminOrOwner && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <UserPlus className="h-4 w-4 mr-1" />
                    Einladen
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Mitglied einladen</DialogTitle>
                    <DialogDescription>
                      Senden Sie eine Einladung per E-Mail.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">E-Mail-Adresse</label>
                      <Input
                        type="email"
                        placeholder="kollegin@kanzlei.de"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Rolle</label>
                      <Select value={inviteRole} onValueChange={setInviteRole}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Mitglied</SelectItem>
                          <SelectItem value="viewer">Betrachter</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                      <Mail className="h-4 w-4 mr-1" />
                      {inviting ? "Senden…" : "Einladung senden"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <CardDescription>
            {members.length} {members.length === 1 ? "Mitglied" : "Mitglieder"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {(m.display_name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{m.display_name || "Unbekannt"}</p>
                      <p className="text-xs text-muted-foreground">{m.email || m.user_id.slice(0, 8)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdminOrOwner && m.role !== "owner" && m.user_id !== user?.id ? (
                      <>
                        <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, v as "admin" | "member" | "viewer")}>
                          <SelectTrigger className="h-8 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Mitglied</SelectItem>
                            <SelectItem value="viewer">Betrachter</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveMember(m.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Badge variant="secondary" className="text-xs gap-1">
                        {ROLE_ICONS[m.role]}
                        {ROLE_LABELS[m.role] || m.role}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isAdminOrOwner && invitations.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Offene Einladungen</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[inv.role] || inv.role} · Läuft ab {new Date(inv.expires_at).toLocaleDateString("de-DE")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => handleRevokeInvitation(inv.id)}
                  >
                    Zurückziehen
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
