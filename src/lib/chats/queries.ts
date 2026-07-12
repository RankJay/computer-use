import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { createChatsPersistence } from "@/lib/chats/persistence";
import type { ChatSummary } from "@/lib/chats/types";

const persistence = createChatsPersistence();

export const chatsKeys = {
  all: ["chats"] as const,
  list: () => [...chatsKeys.all, "list"] as const,
};

export function chatsListQueryOptions() {
  return queryOptions({
    queryKey: chatsKeys.list(),
    queryFn: (): Promise<ChatSummary[]> => persistence.list(),
    staleTime: 30_000,
  });
}

export function useChatsList() {
  return useSuspenseQuery(chatsListQueryOptions());
}

export function useDeleteChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => persistence.remove(id),
    onSuccess: (_void, id) => {
      queryClient.setQueryData<ChatSummary[]>(chatsKeys.list(), (current) =>
        current?.filter((chat) => chat.id !== id),
      );
      void queryClient.invalidateQueries({ queryKey: chatsKeys.list() });
    },
    onError: () => {
      toast.error("Could not delete chat. Try again.");
    },
  });
}
