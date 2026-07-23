import { useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { createChatsPersistence } from "@/lib/chats/persistence";
import { chatsKeys } from "@/lib/chats/queries";
import { deriveChatTitle } from "@/lib/chats/title";
import type { StoredChat } from "@/lib/chats/types";
import type { BatchedAttemptStore, RunStatus, SessionProjection } from "@/lib/session";
import { useSettingsSelector } from "@/lib/settings/queries";
import { selectSelectedModelId } from "@/lib/settings/selectors";

const persistence = createChatsPersistence();

type ChatMeta = {
  title: string;
  modelId: string;
  createdAt: number;
  mandateId: string;
};

/** True for statuses that should checkpoint. Cancelled is excluded so cancel-then-retry
 *  does not persist a partial transcript (phase 3 verification). */
export function isCheckpointStatus(status: RunStatus): boolean {
  return status === "completed" || status === "failed";
}

export function firstUserPrompt(messages: readonly UIMessage[]): string {
  const user = messages.find((message) => message.role === "user");
  if (!user) {
    return "";
  }
  const texts: string[] = [];
  for (const part of user.parts) {
    if (part.type === "text") {
      texts.push(part.text);
    }
  }
  return texts.join("");
}

export function buildCheckpointChat(input: {
  id: string;
  mandateId: string;
  messages: readonly UIMessage[];
  meta: ChatMeta | null;
  projection: Pick<SessionProjection, "usage">;
  fallbackModelId: string;
  now?: number;
}): StoredChat {
  const now = input.now ?? Date.now();
  const { meta, messages, projection } = input;
  if (input.mandateId.length === 0) {
    throw new Error("buildCheckpointChat requires mandateId");
  }
  if (input.mandateId === input.id) {
    throw new Error("mandateId must not equal chat id");
  }
  return {
    id: input.id,
    mandateId: input.mandateId,
    title: meta?.title ?? deriveChatTitle(firstUserPrompt(messages)),
    modelId: meta?.modelId ?? projection.usage.modelId ?? input.fallbackModelId,
    messages: [...messages],
    createdAt: meta?.createdAt ?? now,
    updatedAt: now,
  };
}

export function checkpointErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Chat could not be written to this device.";
}

/**
 * Route `chatId` → bind (reattach or hydrate); settled Attempt → checkpoint.
 * Never cancels a live Attempt on navigation.
 */
export function useChatPersistence(store: BatchedAttemptStore, chatId: string | undefined): void {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const selectedModelId = useSettingsSelector(selectSelectedModelId);

  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;

  const metaRef = useRef<ChatMeta | null>(null);
  const modelIdRef = useRef(selectedModelId);
  modelIdRef.current = selectedModelId;

  const createInFlightRef = useRef(false);
  const createIdRef = useRef<string | null>(null);
  const pendingAfterCreateRef = useRef<StoredChat | null>(null);
  const hydrateGenerationRef = useRef(0);

  // Bind route → host (reattach when live; hydrate when idle).
  useEffect(() => {
    const generation = ++hydrateGenerationRef.current;

    async function syncFromRoute(): Promise<void> {
      await store.bindChatRoute({
        chatId,
        loadChat: (id) => persistence.load(id),
        ensureMandateForChat: async (chat) => {
          const ensured = await store.backfillChatMandate(chat, (next) => persistence.save(next));
          metaRef.current = {
            title: ensured.title,
            modelId: ensured.modelId,
            createdAt: ensured.createdAt,
            mandateId: ensured.mandateId,
          };
          return ensured;
        },
      });

      if (generation !== hydrateGenerationRef.current) {
        return;
      }

      if (!chatId) {
        if (!store.control.getLiveIds()) {
          metaRef.current = null;
        }
        return;
      }

      if (!metaRef.current) {
        const chat = await persistence.load(chatId);
        if (generation !== hydrateGenerationRef.current || !chat) {
          return;
        }
        const ensured = await store.backfillChatMandate(chat, (next) => persistence.save(next));
        metaRef.current = {
          title: ensured.title,
          modelId: ensured.modelId,
          createdAt: ensured.createdAt,
          mandateId: ensured.mandateId,
        };
      }
    }

    void syncFromRoute();
  }, [chatId, store]);

  // Checkpoint on settle (audit MandateProjection — not ExecutionContext).
  useEffect(() => {
    let prevStatus = store.getMandateProjection().status;

    async function persistChat(
      chat: StoredChat,
      options: { navigateToChat: boolean },
    ): Promise<void> {
      try {
        await persistence.save(chat);
        store.control.setLiveChatId(chat.id);
        store.control.setFocusedMandateId(chat.mandateId);
        void queryClient.invalidateQueries({ queryKey: chatsKeys.list() });
        if (options.navigateToChat) {
          navigate(`/chat/${chat.id}`, { replace: true });
        }
      } catch (error) {
        toast.error("Could not save chat", {
          description: checkpointErrorMessage(error),
        });
        throw error;
      }
    }

    return store.subscribe(() => {
      const projection = store.getMandateProjection();
      const status = projection.status;
      const previous = prevStatus;
      prevStatus = status;

      if (previous === status || !isCheckpointStatus(status)) {
        return;
      }

      // Capture synchronously — registry may clearLive after settle microtasks.
      const settledLiveIds = store.control.getLiveIds();
      const settledLiveChatId = store.control.getLiveChatId();
      const settledFocusedMandateId = store.control.getFocusedMandateId();
      const settledMeta = metaRef.current;
      const settledRouteChatId = chatIdRef.current;
      const settledFallbackModelId = modelIdRef.current;
      const settledMessages = projection.chatMessages;

      void (async () => {
        // Bind checkpoint to the Attempt that settled — not the focused/route chat
        // (focus≠cancel: user may have navigated elsewhere while the Attempt ran).
        const mandateId =
          settledLiveIds?.mandateId ??
          settledMeta?.mandateId ??
          settledFocusedMandateId;
        if (!mandateId) {
          toast.error("Could not save chat", {
            description: "Missing mandate id for checkpoint.",
          });
          return;
        }
        // Prefer live chat; if Attempt was on /new, create — never write into a
        // different route chat the user focused mid-run.
        const existingId =
          settledLiveChatId ?? (settledLiveIds ? null : settledRouteChatId);

        const checkpointMeta =
          settledMeta?.mandateId === mandateId
            ? settledMeta
            : settledMeta
              ? { ...settledMeta, mandateId }
              : null;

        if (existingId) {
          const chat = buildCheckpointChat({
            id: existingId,
            mandateId,
            messages: settledMessages,
            meta: checkpointMeta,
            projection,
            fallbackModelId: settledFallbackModelId,
          });
          try {
            await persistChat(chat, { navigateToChat: false });
          } catch {
            // Toast already shown.
          }
          return;
        }

        if (createInFlightRef.current) {
          const createId = createIdRef.current;
          if (createId === null) {
            return;
          }
          pendingAfterCreateRef.current = buildCheckpointChat({
            id: createId,
            mandateId,
            messages: settledMessages,
            meta: checkpointMeta,
            projection,
            fallbackModelId: settledFallbackModelId,
          });
          return;
        }

        createInFlightRef.current = true;
        const id = crypto.randomUUID();
        createIdRef.current = id;
        const chat = buildCheckpointChat({
          id,
          mandateId,
          messages: settledMessages,
          meta: null,
          projection,
          fallbackModelId: settledFallbackModelId,
        });
        metaRef.current = {
          title: chat.title,
          modelId: chat.modelId,
          createdAt: chat.createdAt,
          mandateId: chat.mandateId,
        };

        try {
          await persistChat(chat, { navigateToChat: true });

          const pending = pendingAfterCreateRef.current;
          pendingAfterCreateRef.current = null;
          if (pending !== null) {
            await persistChat(
              {
                ...pending,
                id: chat.id,
                mandateId: chat.mandateId,
                createdAt: chat.createdAt,
                updatedAt: Date.now(),
              },
              { navigateToChat: false },
            );
          }
        } catch {
          metaRef.current = null;
          pendingAfterCreateRef.current = null;
        } finally {
          createInFlightRef.current = false;
          createIdRef.current = null;
        }
      })();
    });
  }, [store, navigate, queryClient]);
}
