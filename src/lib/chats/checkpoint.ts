import type { UIMessage } from "ai";

import type { AttemptIds } from "@/lib/session/control/attempt-control";
import type { RunStatus } from "@/lib/session/events";
import type { AttemptUsage, MandateProjection } from "@/lib/session/projection";
import { shouldCheckpointChat } from "@/lib/session/run-status";

import type { ChatsPersistence } from "./persistence";
import { deriveChatTitle } from "./title";
import type { StoredChat } from "./types";

export type ChatCheckpointMeta = {
  title: string;
  modelId: string;
  createdAt: number;
  mandateId: string;
};

/** Projection slice needed to build / gate a chat metadata checkpoint. */
export type ChatCheckpointProjection = {
  status: RunStatus;
  chatMessages: readonly UIMessage[];
  usage: Pick<AttemptUsage, "modelId">;
};

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

/** Build Chat Client metadata — transcript lives in the Attempt ledger. */
export function buildCheckpointChat(input: {
  id: string;
  mandateId: string;
  /** In-memory projection messages — used only to derive title when meta is absent. */
  titleSourceMessages: readonly UIMessage[];
  meta: ChatCheckpointMeta | null;
  projection: Pick<ChatCheckpointProjection, "usage">;
  fallbackModelId: string;
  now?: number;
}): StoredChat {
  const now = input.now ?? Date.now();
  const { meta, projection } = input;
  if (input.mandateId.length === 0) {
    throw new Error("buildCheckpointChat requires mandateId");
  }
  if (input.mandateId === input.id) {
    throw new Error("mandateId must not equal chat id");
  }
  return {
    id: input.id,
    mandateId: input.mandateId,
    title: meta?.title ?? deriveChatTitle(firstUserPrompt(input.titleSourceMessages)),
    modelId: meta?.modelId ?? projection.usage.modelId ?? input.fallbackModelId,
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

export type ChatCheckpointPorts = {
  chats: ChatsPersistence;
  flushLedger: () => Promise<void>;
  getLiveIds: () => AttemptIds | null;
  getLiveChatId: () => string | null;
  getFocusedMandateId: () => string | null;
  setLiveChatId: (chatId: string | null) => void;
  setFocusedMandateId: (mandateId: string | null) => void;
  getFallbackModelId: () => string;
  getRouteChatId: () => string | undefined;
  /** After durable save — invalidate lists, navigate, etc. */
  onSaved: (chat: StoredChat, options: { navigateToChat: boolean }) => void | Promise<void>;
  onError: (message: string) => void;
};

export type ChatCheckpointController = {
  getMeta: () => ChatCheckpointMeta | null;
  setMeta: (meta: ChatCheckpointMeta | null) => void;
  /** Clear cached meta when leaving an idle draft route. */
  clearMetaIfIdle: () => void;
  /**
   * Call on every host projection notification.
   * Internally tracks previous status and runs create-flight / save on settle.
   */
  onProjectionChange: (projection: MandateProjection | ChatCheckpointProjection) => void;
};

/**
 * Owns settle→checkpoint policy + create-flight. Clients (Home) wire ports only.
 */
export function createChatCheckpointController(
  ports: ChatCheckpointPorts,
): ChatCheckpointController {
  let meta: ChatCheckpointMeta | null = null;
  let prevStatus: RunStatus | null = null;
  let createInFlight = false;
  let createId: string | null = null;
  let pendingAfterCreate: StoredChat | null = null;

  async function persistChat(
    chat: StoredChat,
    options: { navigateToChat: boolean },
  ): Promise<void> {
    try {
      await ports.chats.save(chat);
      ports.setLiveChatId(chat.id);
      ports.setFocusedMandateId(chat.mandateId);
      await ports.onSaved(chat, options);
    } catch (error) {
      ports.onError(checkpointErrorMessage(error));
      throw error;
    }
  }

  async function checkpointAfterSettle(projection: ChatCheckpointProjection): Promise<void> {
    const settledLiveIds = ports.getLiveIds();
    const settledLiveChatId = ports.getLiveChatId();
    const settledFocusedMandateId = ports.getFocusedMandateId();
    const settledMeta = meta;
    const settledRouteChatId = ports.getRouteChatId();
    const settledFallbackModelId = ports.getFallbackModelId();
    const titleSourceMessages = projection.chatMessages;

    const mandateId =
      settledLiveIds?.mandateId ?? settledMeta?.mandateId ?? settledFocusedMandateId;
    if (!mandateId) {
      ports.onError("Missing mandate id for checkpoint.");
      return;
    }

    await ports.flushLedger();

    const existingId = settledLiveChatId ?? (settledLiveIds ? null : settledRouteChatId);

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
        titleSourceMessages,
        meta: checkpointMeta,
        projection,
        fallbackModelId: settledFallbackModelId,
      });
      try {
        await persistChat(chat, { navigateToChat: false });
      } catch {
        // onError already shown.
      }
      return;
    }

    if (createInFlight) {
      if (createId === null) {
        return;
      }
      pendingAfterCreate = buildCheckpointChat({
        id: createId,
        mandateId,
        titleSourceMessages,
        meta: checkpointMeta,
        projection,
        fallbackModelId: settledFallbackModelId,
      });
      return;
    }

    createInFlight = true;
    const id = crypto.randomUUID();
    createId = id;
    const chat = buildCheckpointChat({
      id,
      mandateId,
      titleSourceMessages,
      meta: null,
      projection,
      fallbackModelId: settledFallbackModelId,
    });
    meta = {
      title: chat.title,
      modelId: chat.modelId,
      createdAt: chat.createdAt,
      mandateId: chat.mandateId,
    };

    try {
      await persistChat(chat, { navigateToChat: true });

      const pending = pendingAfterCreate;
      pendingAfterCreate = null;
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
      meta = null;
      pendingAfterCreate = null;
    } finally {
      createInFlight = false;
      createId = null;
    }
  }

  return {
    getMeta: () => meta,
    setMeta: (next) => {
      meta = next;
    },
    clearMetaIfIdle: () => {
      if (!ports.getLiveIds()) {
        meta = null;
      }
    },
    onProjectionChange: (projection) => {
      const status = projection.status;
      const previous = prevStatus;
      prevStatus = status;

      if (previous === null || previous === status || !shouldCheckpointChat(status)) {
        return;
      }

      void checkpointAfterSettle(projection);
    },
  };
}
