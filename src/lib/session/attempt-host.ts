import type { UIMessage } from "ai";

import type { StoredChat } from "@/lib/chats/types";
import { createMandatesPersistence, type MandatesPersistence } from "@/lib/mandates";

import {
  createAttemptControl,
  type AttemptControl,
  type LoadedRunContext,
} from "./control/attempt-control";
import { createAttemptRegistry, type AttemptRegistry } from "./control/attempt-registry";
import type { ProduceRun } from "./control/run-controller";
import { createSessionEngine, type SessionEngine } from "./engine";
import type { RunStatus } from "./events";
import type { SessionProjection } from "./projection";
import { createEmptySessionProjection } from "./projection";

export type AttemptHostListener = () => void;

export type BatchedAttemptStore = {
  engine: SessionEngine;
  control: AttemptControl;
  registry: AttemptRegistry;
  getSnapshot: () => SessionProjection;
  subscribe: (listener: AttemptHostListener) => () => void;
  /**
   * Route chat change. Never cancels a live Attempt.
   * - live + same chat / same draft mandate → reattach (no reset)
   * - live + different chat → focus pointer only
   * - idle → reset + hydrate (or clear for /new)
   */
  bindChatRoute: (input: {
    chatId: string | undefined;
    loadChat: (id: string) => Promise<StoredChat | null>;
    ensureMandateForChat: (chat: StoredChat) => Promise<StoredChat>;
  }) => Promise<void>;
  /** Mint a Mandate for a legacy chat row missing mandateId, persist via save. */
  backfillChatMandate: (
    chat: StoredChat,
    save: (chat: StoredChat) => Promise<void>,
  ) => Promise<StoredChat>;
  resetForMaintenance: () => Promise<void>;
};

export type AttemptHostDeps = {
  produceRun: ProduceRun;
  loadRunContext: () => Promise<LoadedRunContext | null>;
  mandates?: MandatesPersistence;
};

function isActiveStatus(status: RunStatus): boolean {
  return status === "running" || status === "streaming" || status === "waiting_permission";
}

/**
 * App-runtime host: AttemptControl + engine outlive any Chat route.
 * Create once at app bootstrap (tray-kept webview).
 */
export function createAttemptHost(deps: AttemptHostDeps): BatchedAttemptStore {
  const mandates = deps.mandates ?? createMandatesPersistence();
  const registry = createAttemptRegistry();

  let attemptStartedWaiter: ((attemptId: string) => void) | null = null;

  const engine = createSessionEngine({
    produceRun: deps.produceRun,
    onAttemptStarted: (attemptId) => {
      const waiter = attemptStartedWaiter;
      attemptStartedWaiter = null;
      waiter?.(attemptId);
    },
  });

  const control = createAttemptControl({
    engine,
    registry,
    mandates,
    loadRunContext: deps.loadRunContext,
    waitForAttemptStarted: () =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          attemptStartedWaiter = null;
          reject(new Error("Attempt failed to start"));
        }, 30_000);
        attemptStartedWaiter = (attemptId) => {
          clearTimeout(timer);
          resolve(attemptId);
        };
      }),
    cancelAttemptStartedWait: () => {
      attemptStartedWaiter = null;
    },
  });

  let snapshot: SessionProjection = engine.getProjection();
  let pending: SessionProjection | null = null;
  let rafId: number | null = null;
  const listeners = new Set<AttemptHostListener>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const flush = () => {
    rafId = null;
    if (!pending) return;
    snapshot = pending;
    pending = null;
    emit();
  };

  engine.subscribe(() => {
    pending = engine.getProjection();
    if (typeof requestAnimationFrame !== "function") {
      flush();
      return;
    }
    if (rafId !== null) return;
    rafId = requestAnimationFrame(flush);
  });

  async function backfillChatMandate(
    chat: StoredChat,
    save: (next: StoredChat) => Promise<void>,
  ): Promise<StoredChat> {
    if (chat.mandateId.length > 0) {
      if (chat.mandateId === chat.id) {
        throw new Error("chat.mandateId must not equal chat id");
      }
      return chat;
    }
    const mandate = await mandates.create({ kind: "interactive" });
    const next: StoredChat = { ...chat, mandateId: mandate.id };
    await save(next);
    return next;
  }

  return {
    engine,
    control,
    registry,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async backfillChatMandate(chat, save) {
      return backfillChatMandate(chat, save);
    },

    async bindChatRoute({ chatId, loadChat, ensureMandateForChat }) {
      const status = engine.getProjection().status;
      const live = registry.getLive();
      const liveChatId = registry.getLiveChatId();

      if (isActiveStatus(status) && live) {
        if (chatId && chatId === liveChatId) {
          registry.setFocusedMandateId(live.mandateId);
          return;
        }
        if (!chatId && liveChatId === null) {
          registry.setFocusedMandateId(live.mandateId);
          return;
        }
        // Different route while live — focus only; do not reset/hydrate over the fold.
        if (chatId) {
          const chat = await loadChat(chatId);
          if (chat) {
            const ensured = await ensureMandateForChat(chat);
            registry.setFocusedMandateId(ensured.mandateId);
          }
        }
        return;
      }

      await engine.reset();
      registry.clearLive();

      if (!chatId) {
        registry.setLiveChatId(null);
        registry.setFocusedMandateId(null);
        snapshot = createEmptySessionProjection();
        emit();
        return;
      }

      const chat = await loadChat(chatId);
      if (!chat) {
        registry.setLiveChatId(null);
        registry.setFocusedMandateId(null);
        return;
      }

      const ensured = await ensureMandateForChat(chat);
      registry.setLiveChatId(ensured.id);
      registry.setFocusedMandateId(ensured.mandateId);
      engine.hydrate(ensured.messages as UIMessage[]);
      snapshot = engine.getProjection();
      emit();
    },

    async resetForMaintenance() {
      await engine.reset();
      registry.resetPointers();
      snapshot = createEmptySessionProjection();
      emit();
    },
  };
}
