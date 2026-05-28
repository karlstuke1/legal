import { supabase } from "@/lib/supabase-safe";

export interface Matter {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
}

export interface MatterResult {
  data: Matter | null;
  error: string | null;
}

export async function fetchMatters(workspaceId: string): Promise<Matter[]> {
  const { data, error } = await supabase
    .from("matters")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchMatters error:", error);
  }
  return (data || []) as unknown as Matter[];
}

export async function createMatter(workspaceId: string, name: string): Promise<MatterResult> {
  try {
    const { data, error } = await supabase
      .from("matters")
      .insert({ workspace_id: workspaceId, name })
      .select()
      .single();
    if (error) {
      console.error("createMatter error:", error);
      if (error.code === "42501" || error.message?.includes("row-level security")) {
        return { data: null, error: "Keine Berechtigung zum Erstellen von Akten." };
      }
      if (error.code === "23505") {
        return { data: null, error: "Eine Akte mit diesem Namen existiert bereits." };
      }
      return { data: null, error: error.message || "Unbekannter Datenbankfehler." };
    }
    return { data: data as unknown as Matter, error: null };
  } catch (err) {
    console.error("createMatter unexpected error:", err);
    return { data: null, error: "Verbindungsfehler. Bitte versuche es erneut." };
  }
}

export async function updateMatter(matterId: string, name: string): Promise<boolean> {
  const { error } = await supabase
    .from("matters")
    .update({ name })
    .eq("id", matterId);
  return !error;
}

export async function deleteMatter(matterId: string): Promise<boolean> {
  const { error } = await supabase
    .from("matters")
    .delete()
    .eq("id", matterId);
  return !error;
}

export async function assignChatToMatter(chatId: string, matterId: string | null): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from("chats")
      .update({ matter_id: matterId })
      .eq("id", chatId);
    if (error) {
      console.error("assignChatToMatter error:", error);
      return { ok: false, error: error.message || "Zuordnung fehlgeschlagen." };
    }
    return { ok: true, error: null };
  } catch (err) {
    console.error("assignChatToMatter unexpected error:", err);
    return { ok: false, error: "Verbindungsfehler." };
  }
}

export interface MatterFile {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export async function fetchMatterFiles(matterId: string, workspaceId: string): Promise<MatterFile[]> {
  const { data, error } = await supabase
    .from("files")
    .select("id, name, mime, size")
    .eq("matter_id", matterId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchMatterFiles error:", error);
    return [];
  }
  return (data || []) as MatterFile[];
}

// --- Status ---

export async function updateMatterStatus(matterId: string, status: string): Promise<boolean> {
  const { error } = await supabase
    .from("matters")
    .update({ status } as any)
    .eq("id", matterId);
  return !error;
}

// --- Tags ---

export interface MatterTag {
  id: string;
  matter_id: string;
  workspace_id: string;
  label: string;
  color: string;
  created_at: string;
}

export async function fetchMatterTags(matterId: string): Promise<MatterTag[]> {
  const { data, error } = await supabase
    .from("matter_tags" as any)
    .select("*")
    .eq("matter_id", matterId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchMatterTags error:", error);
    return [];
  }
  return (data || []) as unknown as MatterTag[];
}

export async function addMatterTag(matterId: string, workspaceId: string, label: string, color: string = "gray"): Promise<MatterTag | null> {
  const { data, error } = await supabase
    .from("matter_tags" as any)
    .insert({ matter_id: matterId, workspace_id: workspaceId, label, color } as any)
    .select()
    .single();
  if (error) {
    console.error("addMatterTag error:", error);
    return null;
  }
  return data as unknown as MatterTag;
}

export async function deleteMatterTag(tagId: string): Promise<boolean> {
  const { error } = await supabase
    .from("matter_tags" as any)
    .delete()
    .eq("id", tagId);
  return !error;
}

// --- Notes ---

export interface MatterNote {
  id: string;
  matter_id: string;
  workspace_id: string;
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export async function fetchMatterNotes(matterId: string): Promise<MatterNote[]> {
  const { data, error } = await supabase
    .from("matter_notes" as any)
    .select("*")
    .eq("matter_id", matterId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchMatterNotes error:", error);
    return [];
  }
  return (data || []) as unknown as MatterNote[];
}

export async function addMatterNote(matterId: string, workspaceId: string, content: string, userId: string): Promise<MatterNote | null> {
  const { data, error } = await supabase
    .from("matter_notes" as any)
    .insert({ matter_id: matterId, workspace_id: workspaceId, content, created_by: userId } as any)
    .select()
    .single();
  if (error) {
    console.error("addMatterNote error:", error);
    return null;
  }
  return data as unknown as MatterNote;
}

export async function updateMatterNote(noteId: string, content: string): Promise<boolean> {
  const { error } = await supabase
    .from("matter_notes" as any)
    .update({ content, updated_at: new Date().toISOString() } as any)
    .eq("id", noteId);
  return !error;
}

export async function deleteMatterNote(noteId: string): Promise<boolean> {
  const { error } = await supabase
    .from("matter_notes" as any)
    .delete()
    .eq("id", noteId);
  return !error;
}
