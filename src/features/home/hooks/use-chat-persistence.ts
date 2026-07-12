import { useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { createChatsPersistence } from "@/lib/chats/persistence";
import { chatsKeys } from "@/lib/chats/queries";
import { deriveChatTitle } from "@/lib/chats/title";
import type { StoredChat } from "@/lib/chats/types";
import type { RunStatus, SessionEngine } from "@/lib/session";
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

  // Hydrate (or clear) when the route chat changes.
  useEffect(() => {
    let cancelled = false;

    async function syncFromRoute(): Promise<void> {
      await engine.reset();
      if (cancelled) {
        return;
      }

      if (!chatId) {
        metaRef.current = null;
        return;
      }

      const chat = await persistence.load(chatId);
      if (cancelled) {
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

    return () => {
      cancelled = true;
    };
  }, [chatId, engine]);

  // Checkpoint on settle.
  useEffect(() => {
    let prevStatus = engine.getProjection().status;

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
        const now = Date.now();
        const existingId = chatIdRef.current;

        let chat: StoredChat;

        if (existingId) {
          const meta = metaRef.current;
          chat = {
            id: existingId,
            title: meta?.title ?? deriveChatTitle(firstUserPrompt(messages)),
            modelId: meta?.modelId ?? projection.usage.modelId ?? modelIdRef.current,
            messages: [...messages],
            createdAt: meta?.createdAt ?? now,
            updatedAt: now,
          };
        } else {
          if (createInFlightRef.current) {
            return;
          }
          createInFlightRef.current = true;
          const id = crypto.randomUUID();
          const title = deriveChatTitle(firstUserPrompt(messages));
          const modelId = projection.usage.modelId ?? modelIdRef.current;
          chat = {
            id,
            title,
            modelId,
            messages: [...messages],
            createdAt: now,
            updatedAt: now,
          };
          metaRef.current = { title, modelId, createdAt: now };
        }

        try {
          await persistence.save(chat);
          void queryClient.invalidateQueries({ queryKey: chatsKeys.list() });
          if (!existingId) {
            navigate(`/chat/${chat.id}`, { replace: true });
          }
        } finally {
          if (!existingId) {
            createInFlightRef.current = false;
          }
        }
      })();
    });
  }, [engine, navigate, queryClient]);
}
