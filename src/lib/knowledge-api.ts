import { supabase } from "@/lib/supabase-safe";

export interface KnowledgeDoc {
  id: string;
  title: string;
  source_provider: string;
  content: string;
  created_at: string;
  chunk_index: number | null;
  metadata: Record<string, any> | null;
}

export async function fetchKnowledgeDocs(workspaceId: string): Promise<KnowledgeDoc[]> {
  const { data } = await supabase
    .from("legal_documents")
    .select("id, title, source_provider, content, created_at, chunk_index, metadata")
    .eq("workspace_id", workspaceId)
    .eq("source_provider", "UPLOAD")
    .eq("chunk_index", 0)
    .order("created_at", { ascending: false })
    .limit(200);

  return (data || []) as unknown as KnowledgeDoc[];
}

export async function deleteKnowledgeDoc(title: string, workspaceId: string): Promise<void> {
  // Delete all chunks with same title + workspace
  await supabase
    .from("legal_documents")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("source_provider", "UPLOAD")
    .eq("title", title);
}

export async function uploadKnowledgeFile(
  file: File,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const ext = file.name.split(".").pop() || "";
  const storagePath = `${workspaceId}/knowledge/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("workspace-files")
    .upload(storagePath, file, { cacheControl: "3600", upsert: false });

  if (uploadError) {
    console.error("Knowledge upload error:", uploadError);
    return false;
  }

  // Register file
  const { data: fileData, error: dbError } = await supabase
    .from("files")
    .insert({
      workspace_id: workspaceId,
      uploaded_by: userId,
      name: file.name,
      mime: file.type,
      storage_path: storagePath,
      size: file.size,
    })
    .select()
    .single();

  if (dbError) {
    console.error("Knowledge DB insert error:", dbError);
    return false;
  }

  // Trigger embedding
  const { error: embedError } = await supabase.functions.invoke("embed-documents", {
    body: {
      workspace_id: workspaceId,
      files: [{
        file_id: (fileData as any).id,
        storage_path: storagePath,
        name: file.name,
        mime: file.type,
      }],
    },
  });

  if (embedError) {
    console.error("Knowledge embed error:", embedError);
    return false;
  }

  return true;
}
