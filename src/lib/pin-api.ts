import { supabase } from "@/lib/supabase-safe";

export interface PinnedMessage {
  id: string;
  message_id: string;
  chat_id: string;
  user_id: string;
  workspace_id: string;
  note: string;
  created_at: string;
}

export async function pinMessage(
  messageId: string,
  chatId: string,
  userId: string,
  workspaceId: string,
  note = ""
): Promise<PinnedMessage | null> {
  const { data, error } = await supabase
    .from("pinned_messages")
    .insert({ message_id: messageId, chat_id: chatId, user_id: userId, workspace_id: workspaceId, note })
    .select()
    .single();

  if (error) { console.error("pinMessage error:", error); return null; }
  return data as unknown as PinnedMessage;
}

export async function unpinMessage(messageId: string, userId: string): Promise<void> {
  await supabase
    .from("pinned_messages")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", userId);
}

export async function fetchPinnedMessages(workspaceId: string): Promise<PinnedMessage[]> {
  const { data } = await supabase
    .from("pinned_messages")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  return (data || []) as unknown as PinnedMessage[];
}

export async function isPinned(messageId: string, userId: string): Promise<boolean> {
  const { count } = await supabase
    .from("pinned_messages")
    .select("id", { count: "exact", head: true })
    .eq("message_id", messageId)
    .eq("user_id", userId);

  return (count || 0) > 0;
}

export async function fetchPinnedMessageIds(workspaceId: string, userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("pinned_messages")
    .select("message_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  return new Set((data || []).map((d: any) => d.message_id));
}
