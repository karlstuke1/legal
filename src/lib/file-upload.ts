import { supabase } from "@/lib/supabase-safe";

export interface UploadedFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  storage_path: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

export class QuotaExceededError extends Error {
  constructor(public used: number, public limit: number) {
    super(`Upload-Limit erreicht: ${used}/${limit}`);
    this.name = "QuotaExceededError";
  }
}

export async function uploadFile(
  file: File,
  workspaceId: string,
  userId: string,
  chatId?: string,
  onProgress?: (progress: number) => void
): Promise<UploadedFile | null> {
  // Check upload quota
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [planRes, usageRes] = await Promise.all([
    supabase.from("plans").select("monthly_uploads_limit").eq("workspace_id", workspaceId).single(),
    supabase.from("files").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("created_at", startOfMonth.toISOString()),
  ]);

  const limit = (planRes.data as any)?.monthly_uploads_limit || 5;
  const used = usageRes.count || 0;

  if (used >= limit) {
    throw new QuotaExceededError(used, limit);
  }
  const ext = file.name.split(".").pop() || "";
  const storagePath = `${workspaceId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("workspace-files")
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    return null;
  }

  onProgress?.(100);

  const { data, error: dbError } = await supabase
    .from("files")
    .insert({
      workspace_id: workspaceId,
      uploaded_by: userId,
      chat_id: chatId || null,
      name: file.name,
      mime: file.type,
      storage_path: storagePath,
      size: file.size,
    })
    .select()
    .single();

  if (dbError) {
    console.error("File DB insert error:", dbError);
    return null;
  }

  // Fire-and-forget: auto-embed with AI-powered parsing (OCR, tables, scans)
  const embeddableTypes = [
    "application/pdf",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
    "image/webp",
  ];
  if (embeddableTypes.includes(file.type)) {
    supabase.functions.invoke("embed-documents", {
      body: {
        workspace_id: workspaceId,
        files: [{
          file_id: (data as any).id,
          storage_path: storagePath,
          name: file.name,
          mime: file.type,
        }],
      },
    }).catch(e => console.warn("Auto-embed failed (non-critical):", e));
  }

  return {
    id: (data as any).id,
    name: file.name,
    mime: file.type,
    size: file.size,
    storage_path: storagePath,
    progress: 100,
    status: "done",
  };
}
const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
];

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `Dateityp "${file.type}" nicht unterstützt. Erlaubt: PDF, DOCX, TXT, PNG, JPG, WebP.`;
  }
  if (file.size > MAX_SIZE) {
    return `Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 20 MB.`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
