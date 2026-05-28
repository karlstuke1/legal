import { supabase } from "@/lib/supabase-safe";
import type { Chat, ChatMessage, ChatFilters } from "@/lib/types";

export async function createChat(workspaceId: string, userId: string, filters: ChatFilters): Promise<Chat | null> {
  const { data, error } = await supabase
    .from("chats")
    .insert({
      workspace_id: workspaceId,
      created_by: userId,
      mode: filters.mode as any,
      jurisdiction: filters.jurisdiction,
      sources: filters.sources,
    })
    .select()
    .single();
  if (error) { console.error("createChat error:", error); return null; }
  return data as unknown as Chat;
}

export async function fetchChat(chatId: string): Promise<Chat | null> {
  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("id", chatId)
    .single();
  if (error) { console.error("fetchChat error:", error); return null; }
  return data as unknown as Chat;
}

export async function fetchChats(workspaceId: string, limit = 30, cursor?: string): Promise<Chat[]> {
  let query = supabase
    .from("chats")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (cursor) {
    query = query.lt("updated_at", cursor);
  }
  const { data } = await query;
  return (data || []) as unknown as Chat[];
}

export async function fetchMessages(chatId: string, limit = 100, before?: string): Promise<ChatMessage[]> {
  let query = supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (before) {
    query = query.lt("created_at", before);
  }
  const { data } = await query;
  return (data || []) as unknown as ChatMessage[];
}

export async function insertMessage(chatId: string, role: string, text: string): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ chat_id: chatId, role, content: { text } })
    .select()
    .single();
  if (error) { console.error("insertMessage error:", error); return null; }
  // Update chat updated_at
  await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
  return data as unknown as ChatMessage;
}

export async function updateChatTitle(chatId: string, title: string) {
  await supabase.from("chats").update({ title }).eq("id", chatId);
  // Dispatch custom event so sidebar can refresh
  window.dispatchEvent(new CustomEvent("chat-title-updated", { detail: { chatId, title } }));
}

export async function deleteChat(chatId: string) {
  // Delete messages first, then chat
  await supabase.from("messages").delete().eq("chat_id", chatId);
  await supabase.from("chats").delete().eq("id", chatId);
  window.dispatchEvent(new CustomEvent("chat-deleted", { detail: { chatId } }));
}

export async function updateChatFilters(chatId: string, filters: Partial<ChatFilters>) {
  const update: any = {};
  if (filters.jurisdiction) update.jurisdiction = filters.jurisdiction;
  if (filters.sources) update.sources = filters.sources;
  if (filters.mode) update.mode = filters.mode;
  await supabase.from("chats").update(update).eq("id", chatId);
}
