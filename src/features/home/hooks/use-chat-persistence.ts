import { useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { createChatsPersistence } from "@/lib/chats/persistence";
import { chatsKeys } from "@/lib/chats/queries";
import { deriveChatTitle } from "@/lib/chats/title";
import type { StoredChat } from "@/lib/chats/types";
import type { RunStatus, SessionEngine, SessionProjection } from "@/lib/session";
import { useLoadedSettings } from "@/lib/settings/queries";

const persistence = createChatsPersistence();

type ChatMeta = {
  title: string;
  modelId: string;
  createdAt: number;
};

type SessionStore = {
  engine: SessionEngine;
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
  messages: readonly UIMessage[];
  meta: ChatMeta | null;
  projection: Pick<SessionProjection, "usage">;
  fallbackModelId: string;
  now?: number;
}): StoredChat {
  const now = input.now ?? Date.now();
  const { meta, messages, projection } = input;
  return {
    id: input.id,
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
 * Route `chatId` → hydrate; settled task → checkpoint (create+navigate or update).
 */
export function useChatPersistence(store: SessionStore, chatId: string | undefined): void {
  const { engine } = store;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: settings } = useLoadedSettings();

  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;

  const metaRef = useRef<ChatMeta | null>(null);
  const modelIdRef = useRef(settings.selectedModelId);
  modelIdRef.current = settings.selectedModelId;

  const createInFlightRef = useRef(false);
  const createIdRef = useRef<string | null>(null);
  const pendingAfterCreateRef = useRef<StoredChat | null>(null);
  const hydrateGenerationRef = useRef(0);

  // Hydrate (or clear) when the route chat changes.
  useEffect(() => {
    const generation = ++hydrateGenerationRef.current;

    async function syncFromRoute(): Promise<void> {
      await engine.reset();
      if (generation !== hydrateGenerationRef.current) {
        return;
      }

      if (!chatId) {
        metaRef.current = null;
        return;
      }

      const chat = await persistence.load(chatId);
      if (generation !== hydrateGenerationRef.current) {
        return;
      }

      if (!chat) {
        metaRef.current = null;
        return;
      }

      metaRef.current = {
        title: chat.title,
        modelId: chat.modelId,
        createdAt: chat.createdAt,
      };
      engine.hydrate(chat.messages);
    }

    void syncFromRoute();
  }, [chatId, engine]);

  // Checkpoint on settle.
  useEffect(() => {
    let prevStatus = engine.getProjection().status;

    async function persistChat(chat: StoredChat, options: { navigateToChat: boolean }): Promise<void> {
      try {
        await persistence.save(chat);
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

    return engine.subscribe(() => {
      const projection = engine.getProjection();
      const status = projection.status;
      const previous = prevStatus;
      prevStatus = status;

      if (previous === status || !isCheckpointStatus(status)) {
        return;
      }

      void (async () => {
        const messages = projection.chatMessages;
        const existingId = chatIdRef.current;
        const fallbackModelId = modelIdRef.current;

        if (existingId) {
          const chat = buildCheckpointChat({
            id: existingId,
            messages,
            meta: metaRef.current,
            projection,
            fallbackModelId,
          });
          try {
            await persistChat(chat, { navigateToChat: false });
          } catch {
            // Toast already shown.
          }
          return;
        }

        // First settle for a new chat — create, or queue behind an in-flight create.
        if (createInFlightRef.current) {
          const createId = createIdRef.current;
          if (createId === null) {
            return;
          }
          pendingAfterCreateRef.current = buildCheckpointChat({
            id: createId,
            messages,
            meta: metaRef.current,
            projection,
            fallbackModelId,
          });
          return;
        }

        createInFlightRef.current = true;
        const id = crypto.randomUUID();
        createIdRef.current = id;
        const chat = buildCheckpointChat({
          id,
          messages,
          meta: null,
          projection,
          fallbackModelId,
        });
        metaRef.current = {
          title: chat.title,
          modelId: chat.modelId,
          createdAt: chat.createdAt,
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
  }, [engine, navigate, queryClient]);
}
