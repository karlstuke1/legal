import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback } from "react";
import { fetchChats } from "@/lib/chat-api";
import type { Chat } from "@/lib/types";

/**
 * React Query hook for sidebar chats with stale-while-revalidate
 * and event-based invalidation (no more re-fetch on every navigation).
 */
export function useSidebarChats(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: chats = [], isLoading } = useQuery<Chat[]>({
    queryKey: ["sidebar-chats", workspaceId],
    queryFn: () => fetchChats(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 30_000, // 30s stale-while-revalidate
    gcTime: 5 * 60_000, // 5 min garbage collection
    refetchOnWindowFocus: false,
  });

  // Optimistic updates via custom events
  useEffect(() => {
    const onTitleUpdated = (e: Event) => {
      const { chatId, title } = (e as CustomEvent).detail || {};
      if (!chatId || !title) return;
      queryClient.setQueryData<Chat[]>(
        ["sidebar-chats", workspaceId],
        (prev) => prev?.map((c) => (c.id === chatId ? { ...c, title } : c)) ?? []
      );
    };

    const onChatDeleted = (e: Event) => {
      const { chatId } = (e as CustomEvent).detail || {};
      if (!chatId) return;
      queryClient.setQueryData<Chat[]>(
        ["sidebar-chats", workspaceId],
        (prev) => prev?.filter((c) => c.id !== chatId) ?? []
      );
    };

    window.addEventListener("chat-title-updated", onTitleUpdated);
    window.addEventListener("chat-deleted", onChatDeleted);
    return () => {
      window.removeEventListener("chat-title-updated", onTitleUpdated);
      window.removeEventListener("chat-deleted", onChatDeleted);
    };
  }, [workspaceId, queryClient]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["sidebar-chats", workspaceId] });
  }, [workspaceId, queryClient]);

  return { chats, isLoading, invalidate };
}
