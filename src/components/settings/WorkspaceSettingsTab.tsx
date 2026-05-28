import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace";
import { supabase } from "@/lib/supabase-safe";
import { toast } from "@/hooks/use-toast";
import { Building2, Save, Trash2, Upload, X, Loader2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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

export default function WorkspaceSettingsTab() {
  const { activeWorkspace, refetch } = useWorkspace();
  const [name, setName] = useState(activeWorkspace?.name || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwner = activeWorkspace?.role === "owner";
  const logoUrl = (activeWorkspace as any)?.logo_url as string | null;

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeWorkspace) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Nur Bilddateien erlaubt", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Max. 2 MB", variant: "destructive" });
      return;
    }

    setUploadingLogo(true);
    const ext = file.name.split(".").pop() || "png";
    const storagePath = `${activeWorkspace.id}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("workspace-files")
      .upload(storagePath, file, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      toast({ title: "Upload fehlgeschlagen", description: uploadError.message, variant: "destructive" });
      setUploadingLogo(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("workspace-files")
      .getPublicUrl(storagePath);

    // Use signed URL since bucket is private
    const { data: signedData } = await supabase.storage
      .from("workspace-files")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year

    const finalUrl = signedData?.signedUrl || urlData.publicUrl;

    const { error: dbError } = await supabase
      .from("workspaces")
      .update({ logo_url: finalUrl })
      .eq("id", activeWorkspace.id);

    setUploadingLogo(false);
    if (dbError) {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    } else {
      toast({ title: "Logo aktualisiert" });
      refetch();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveLogo = async () => {
    if (!activeWorkspace) return;
    setUploadingLogo(true);
    await supabase
      .from("workspaces")
      .update({ logo_url: null })
      .eq("id", activeWorkspace.id);
    setUploadingLogo(false);
    toast({ title: "Logo entfernt" });
    refetch();
  };

  const handleSave = async () => {
    if (!activeWorkspace || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("workspaces")
      .update({ name: name.trim() })
      .eq("id", activeWorkspace.id);
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Kanzleiname aktualisiert" });
      refetch();
    }
  };

  const handleDelete = async () => {
    if (!activeWorkspace) return;
    setDeleting(true);
    const { error } = await supabase
      .from("workspaces")
      .delete()
      .eq("id", activeWorkspace.id);
    setDeleting(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Workspace gelöscht" });
      refetch();
    }
  };

  if (!activeWorkspace) {
    return <p className="text-sm text-muted-foreground">Kein Workspace ausgewählt.</p>;
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Kanzlei / Workspace</CardTitle>
          </div>
          <CardDescription>Verwalten Sie Ihren Workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logo */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Logo</label>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 rounded-lg border border-border/40">
                {logoUrl ? (
                  <AvatarImage src={logoUrl} alt="Workspace Logo" className="object-cover" />
                ) : null}
                <AvatarFallback className="rounded-lg bg-muted text-muted-foreground text-lg">
                  {activeWorkspace.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                  disabled={!isOwner}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!isOwner || uploadingLogo}
                  >
                    {uploadingLogo ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-1" />
                    )}
                    {uploadingLogo ? "Hochladen…" : "Logo hochladen"}
                  </Button>
                  {logoUrl && isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveLogo}
                      disabled={uploadingLogo}
                      className="text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Entfernen
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/50">PNG, JPG, SVG · Max. 2 MB</p>
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
              disabled={!isOwner}
            />
          </div>
          {isOwner && (
            <Button onClick={handleSave} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Speichern…" : "Name speichern"}
            </Button>
          )}
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-destructive/30 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base text-destructive">Gefahrenzone</CardTitle>
            <CardDescription>Diese Aktion kann nicht rückgängig gemacht werden.</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={deleting}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Workspace löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Workspace wirklich löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Alle Chats, Akten und Mitgliedschaften werden unwiderruflich gelöscht.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Endgültig löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
