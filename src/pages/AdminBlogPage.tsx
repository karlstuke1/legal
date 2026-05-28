import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/hooks/use-admin";
import { useAllBlogPosts, type DbBlogPost } from "@/hooks/use-blog-posts";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Eye, EyeOff, Calendar, Clock, Tag } from "lucide-react";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const emptyPost = {
  title: "",
  slug: "",
  description: "",
  date: new Date().toISOString().split("T")[0],
  read_time: "5 Min",
  category: "Legal AI",
  keywords: [] as string[],
  content: "",
  published: false,
};

export default function AdminBlogPage() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { data: posts, isLoading } = useAllBlogPosts();
  const queryClient = useQueryClient();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DbBlogPost | null>(null);
  const [form, setForm] = useState(emptyPost);
  const [keywordInput, setKeywordInput] = useState("");
  const [saving, setSaving] = useState(false);

  if (adminLoading) return <PageContainer><div className="animate-pulse h-40" /></PageContainer>;
  if (!isAdmin) return <Navigate to="/app/chat" replace />;

  const openNew = () => {
    setEditing(null);
    setForm(emptyPost);
    setKeywordInput("");
    setEditorOpen(true);
  };

  const openEdit = (p: DbBlogPost) => {
    setEditing(p);
    setForm({
      title: p.title,
      slug: p.slug,
      description: p.description,
      date: p.date,
      read_time: p.read_time,
      category: p.category,
      keywords: p.keywords ?? [],
      content: p.content,
      published: p.published,
    });
    setKeywordInput((p.keywords ?? []).join(", "));
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Titel und Inhalt sind Pflichtfelder.");
      return;
    }
    setSaving(true);
    const slug = form.slug.trim() || slugify(form.title);
    const keywords = keywordInput.split(",").map(k => k.trim()).filter(Boolean);
    const payload = { ...form, slug, keywords, created_by: user!.id };

    try {
      if (editing) {
        const { error } = await supabase
          .from("blog_posts")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Artikel aktualisiert.");
      } else {
        const { error } = await supabase
          .from("blog_posts")
          .insert(payload);
        if (error) throw error;
        toast.success("Artikel erstellt.");
      }
      queryClient.invalidateQueries({ queryKey: ["blog-posts-all"] });
      queryClient.invalidateQueries({ queryKey: ["blog-posts-published"] });
      setEditorOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("blog_posts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Artikel gelöscht.");
    queryClient.invalidateQueries({ queryKey: ["blog-posts-all"] });
    queryClient.invalidateQueries({ queryKey: ["blog-posts-published"] });
  };

  const togglePublish = async (p: DbBlogPost) => {
    const { error } = await supabase
      .from("blog_posts")
      .update({ published: !p.published })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["blog-posts-all"] });
    queryClient.invalidateQueries({ queryKey: ["blog-posts-published"] });
  };

  return (
    <PageContainer maxWidth="md">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="h-7 w-7 shrink-0" />
        <PageHeader title="Blog CMS" description="Artikel erstellen, bearbeiten und veröffentlichen." />
      </div>

      <div className="flex justify-end mb-4">
        <Button onClick={openNew} size="sm" className="rounded-xl gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Neuer Artikel
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />)}</div>
      ) : !posts?.length ? (
        <div className="text-center py-16 text-muted-foreground/50 text-sm">
          Noch keine Artikel. Erstellen Sie den ersten!
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(p => (
            <Card key={p.id} className="p-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={p.published ? "default" : "secondary"} className="text-[10px] h-5">
                    {p.published ? "Veröffentlicht" : "Entwurf"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] h-5">{p.category}</Badge>
                </div>
                <h3 className="text-[14px] font-semibold truncate">{p.title}</h3>
                <p className="text-[12px] text-muted-foreground/50 truncate">{p.description}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground/40">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{p.date}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{p.read_time}</span>
                  <span className="flex items-center gap-1"><Tag className="h-3 w-3" />{(p.keywords ?? []).length} Keywords</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => togglePublish(p)} title={p.published ? "Zurückziehen" : "Veröffentlichen"}>
                  {p.published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Artikel löschen?</AlertDialogTitle>
                      <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(p.id)}>Löschen</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Artikel bearbeiten" : "Neuer Artikel"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-[12px]">Titel *</Label>
              <Input
                value={form.title}
                onChange={e => {
                  setForm(f => ({ ...f, title: e.target.value, slug: f.slug || slugify(e.target.value) }));
                }}
                placeholder="KI für Anwälte: Der ultimative Leitfaden"
              />
            </div>
            <div>
              <Label className="text-[12px]">Slug (URL)</Label>
              <Input
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="ki-fuer-anwaelte-leitfaden"
              />
            </div>
            <div>
              <Label className="text-[12px]">Beschreibung (Meta)</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Kurze Zusammenfassung für SEO..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Datum</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-[12px]">Lesezeit</Label>
                <Input value={form.read_time} onChange={e => setForm(f => ({ ...f, read_time: e.target.value }))} placeholder="8 Min" />
              </div>
            </div>
            <div>
              <Label className="text-[12px]">Kategorie</Label>
              <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Legal AI" />
            </div>
            <div>
              <Label className="text-[12px]">Keywords (kommasepariert)</Label>
              <Input
                value={keywordInput}
                onChange={e => setKeywordInput(e.target.value)}
                placeholder="KI für Anwälte, Legal AI, Rechtsrecherche"
              />
            </div>
            <div>
              <Label className="text-[12px] mb-2 block">Inhalt (Markdown) *</Label>
              <Tabs defaultValue="edit" className="w-full">
                <TabsList className="mb-2">
                  <TabsTrigger value="edit" className="text-[12px]">Bearbeiten</TabsTrigger>
                  <TabsTrigger value="preview" className="text-[12px]">Vorschau</TabsTrigger>
                </TabsList>
                <TabsContent value="edit">
                  <Textarea
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    rows={14}
                    className="font-mono text-[13px]"
                    placeholder="## Überschrift&#10;&#10;Ihr Artikelinhalt hier..."
                  />
                </TabsContent>
                <TabsContent value="preview">
                  <div className="min-h-[280px] max-h-[400px] overflow-y-auto rounded-xl border border-border/40 bg-background p-5 prose prose-neutral dark:prose-invert max-w-none prose-headings:font-semibold prose-h2:text-[20px] prose-h3:text-[16px] prose-p:text-[14px] prose-p:leading-[1.7] prose-li:text-[13px]">
                    {form.content.trim() ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{form.content}</ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground/40 text-[13px] italic">Noch kein Inhalt — wechseln Sie zum Tab „Bearbeiten".</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.published}
                onCheckedChange={v => setForm(f => ({ ...f, published: v }))}
              />
              <Label className="text-[12px]">Sofort veröffentlichen</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>Abbrechen</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Speichern..." : editing ? "Aktualisieren" : "Erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
