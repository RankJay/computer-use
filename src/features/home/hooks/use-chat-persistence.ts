import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  chatsKeys,
  createChatCheckpointController,
  createChatsPersistence,
  type ChatCheckpointController,
} from "@/lib/chats";
import type { BatchedAttemptStore } from "@/lib/session";
import { selectSelectedModelId, useSettingsSelector } from "@/lib/settings";

const persistence = createChatsPersistence();

/**
 * Route `chatId` → bind (reattach or ledger hydrate); settled Attempt → metadata checkpoint.
 * Durability policy lives in `lib/chats` — this hook only wires bind + UX adapters.
 */
export function useChatPersistence(store: BatchedAttemptStore, chatId: string | undefined): void {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const selectedModelId = useSettingsSelector(selectSelectedModelId);

  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;

  const modelIdRef = useRef(selectedModelId);
  modelIdRef.current = selectedModelId;

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  const controllerRef = useRef<ChatCheckpointController | null>(null);
  const hydrateGenerationRef = useRef(0);

  useEffect(() => {
    const controller = createChatCheckpointController({
      chats: persistence,
      flushLedger: () => store.flushLedger(),
      getLiveIds: () => store.control.getLiveIds(),
      getLiveChatId: () => store.control.getLiveChatId(),
      getFocusedMandateId: () => store.control.getFocusedMandateId(),
      setLiveChatId: (id) => store.control.setLiveChatId(id),
      setFocusedMandateId: (id) => store.control.setFocusedMandateId(id),
      getFallbackModelId: () => modelIdRef.current,
      getRouteChatId: () => chatIdRef.current,
      onSaved: async (chat, options) => {
        void queryClientRef.current.invalidateQueries({ queryKey: chatsKeys.list() });
        if (options.navigateToChat) {
          navigateRef.current(`/chat/${chat.id}`, { replace: true });
        }
      },
      onError: (message) => {
        toast.error("Could not save chat", { description: message });
      },
    });
    controllerRef.current = controller;

    const unsub = store.subscribe(() => {
      controller.onProjectionChange(store.getMandateProjection());
    });

    return () => {
      unsub();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [store]);

  useEffect(() => {
    const generation = ++hydrateGenerationRef.current;

    async function syncFromRoute(): Promise<void> {
      await store.bindChatRoute({
        chatId,
        loadChat: (id) => persistence.load(id),
      });

      if (generation !== hydrateGenerationRef.current) {
        return;
      }

      const controller = controllerRef.current;
      if (!controller) {
        return;
      }

      if (!chatId) {
        controller.clearMetaIfIdle();
        return;
      }

      if (!controller.getMeta()) {
        const chat = await persistence.load(chatId);
        if (generation !== hydrateGenerationRef.current || !chat) {
          return;
        }
        controller.setMeta({
          title: chat.title,
          modelId: chat.modelId,
          createdAt: chat.createdAt,
          mandateId: chat.mandateId,
        });
      }
    }

    void syncFromRoute();
  }, [chatId, store]);
}
