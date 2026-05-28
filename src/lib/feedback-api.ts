import { supabase } from "@/lib/supabase-safe";

export type FeedbackRating = "up" | "down";

export interface FeedbackMetadata {
  query_text?: string;
  source_count?: number;
  confidence_score?: number;
  model?: string;
  jurisdiction?: string[];
  mode?: string;
  has_sources?: boolean;
  fabricated_count?: number;
}

export interface MessageFeedback {
  id: string;
  message_id: string;
  user_id: string;
  rating: FeedbackRating;
  comment: string | null;
  metadata: FeedbackMetadata | null;
  created_at: string;
}

export async function upsertFeedback(
  messageId: string,
  userId: string,
  rating: FeedbackRating,
  metadata?: FeedbackMetadata
): Promise<MessageFeedback | null> {
  const payload: any = { message_id: messageId, user_id: userId, rating };
  if (metadata) payload.metadata = metadata;

  const { data, error } = await supabase
    .from("message_feedback" as any)
    .upsert(payload, { onConflict: "message_id,user_id" })
    .select()
    .single();

  if (error) {
    console.error("upsertFeedback error:", error);
    return null;
  }
  return data as unknown as MessageFeedback;
}

export async function deleteFeedback(
  messageId: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("message_feedback" as any)
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", userId);

  if (error) {
    console.error("deleteFeedback error:", error);
    return false;
  }
  return true;
}

export async function fetchFeedbackForMessages(
  messageIds: string[]
): Promise<Record<string, FeedbackRating>> {
  if (messageIds.length === 0) return {};

  const { data, error } = await supabase
    .from("message_feedback" as any)
    .select("message_id, rating")
    .in("message_id", messageIds);

  if (error) {
    console.error("fetchFeedback error:", error);
    return {};
  }

  const map: Record<string, FeedbackRating> = {};
  for (const row of (data || []) as any[]) {
    map[row.message_id] = row.rating as FeedbackRating;
  }
  return map;
}
