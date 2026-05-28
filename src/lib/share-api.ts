import { supabase } from "@/lib/supabase-safe";

export interface SharedChat {
  id: string;
  chat_id: string;
  token: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export async function createShareLink(chatId: string, userId: string): Promise<SharedChat | null> {
  // Check if active link already exists
  const { data: existing } = await supabase
    .from("shared_chats")
    .select("*")
    .eq("chat_id", chatId)
    .eq("is_active", true)
    .single();

  if (existing) return existing as unknown as SharedChat;

  const { data, error } = await supabase
    .from("shared_chats")
    .insert({ chat_id: chatId, created_by: userId })
    .select()
    .single();

  if (error) { console.error("createShareLink error:", error); return null; }
  return data as unknown as SharedChat;
}

export async function deactivateShareLink(shareId: string): Promise<void> {
  await supabase
    .from("shared_chats")
    .update({ is_active: false })
    .eq("id", shareId);
}

export async function getShareLink(chatId: string): Promise<SharedChat | null> {
  const { data } = await supabase
    .from("shared_chats")
    .select("*")
    .eq("chat_id", chatId)
    .eq("is_active", true)
    .single();

  return (data as unknown as SharedChat) || null;
}
