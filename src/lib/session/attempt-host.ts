import type { UIMessage } from "ai";

import {
  createAttemptEventStore,
  projectionToFoldSnapshot,
  type AttemptEventStore,
} from "@/lib/attempts";
import type { StoredChat } from "@/lib/chats/types";
import type { EntitlementPolicy } from "@/lib/entitlements";
import { createMandatesPersistence, type MandatesPersistence } from "@/lib/mandates";

import {
  createAttemptControl,
  type AttemptControl,
  type LoadedRunContext,
} from "./control/attempt-control";
import { createAttemptRegistry, type AttemptRegistry } from "./control/attempt-registry";
import type { EscalationPort, EscalationPortMode } from "./control/escalation-port";
import { createOsLease, type OsLease } from "./control/os-lease";
import type { ProduceRun } from "./control/run-controller";
import { createSessionEngine, type SessionEngine } from "./engine";
import type { RunStatus, RuntimeEvent } from "./events";
import type { SessionProjection } from "./projection";
import { createEmptySessionProjection } from "./projection";

export type AttemptHostListener = () => void;

export type BatchedAttemptStore = {
  engine: SessionEngine;
  control: AttemptControl;
  registry: AttemptRegistry;
  eventStore: AttemptEventStore;
  /** Commercial policy (undefined in tests that omit it). */
  entitlements: EntitlementPolicy | undefined;
  /** Desktop OS lease (UI-automation exclusivity). */
  osLease: OsLease;
  /** MandateProjection (audit/UI). Alias of getSnapshot. */
  getMandateProjection: () => SessionProjection;
  getSnapshot: () => SessionProjection;
  subscribe: (listener: AttemptHostListener) => () => void;
  /**
   * Route chat change. Never cancels a live Attempt.
   * - live + same chat / same draft mandate → reattach (no reset)
   * - live + different chat → focus pointer only
   * - idle → reset + hydrate from ledger (else messages)
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
  /** Flush buffered ledger writes (tests / shutdown). */
  flushLedger: () => Promise<void>;
};

export type AttemptHostDeps = {
  produceRun: ProduceRun;
  loadRunContext: () => Promise<LoadedRunContext | null>;
  mandates?: MandatesPersistence;
  eventStore?: AttemptEventStore;
  /** Commercial gate — Attempt start/model + Capability invoke. */
  entitlements?: EntitlementPolicy;
  /** Desktop lock — defaults to in-process global lease. */
  osLease?: OsLease;
  /** Inject EscalationPort (tests). Default: interactive via RunController. */
  escalationPort?: EscalationPort;
  /** Dark-launch park adapter (unattended-ready). Default interactive. */
  escalationMode?: EscalationPortMode;
  escalationTimeoutMs?: number;
};

function isActiveStatus(status: RunStatus): boolean {
  return status === "running" || status === "streaming" || status === "waiting_permission";
}

function isSettleStatus(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

/**
 * App-runtime host: AttemptControl + engine + durable ledger outlive any Chat route.
 * Create once at app bootstrap (tray-kept webview).
 */
export function createAttemptHost(deps: AttemptHostDeps): BatchedAttemptStore {
  const mandates = deps.mandates ?? createMandatesPersistence();
  const eventStore = deps.eventStore ?? createAttemptEventStore();
  const registry = createAttemptRegistry();
  const osLease = deps.osLease ?? createOsLease();

  let attemptStartedWaiter: ((attemptId: string) => void) | null = null;

  const produceRun: ProduceRun = async (ctx) =>
    deps.produceRun({
      ...ctx,
      entitlements: deps.entitlements,
      osLease,
    });

  const engine = createSessionEngine({
    produceRun,
    osLease,
    escalationPort: deps.escalationPort,
    escalationMode: deps.escalationMode,
    escalationTimeoutMs: deps.escalationTimeoutMs,
    onAttemptStarted: (attemptId) => {
      const waiter = attemptStartedWaiter;
      attemptStartedWaiter = null;
      waiter?.(attemptId);

      ledgerAttemptId = attemptId;
      attemptDurableSeq = 0;
      // Keep durableLogCursor — eventLog retains prior Attempts until reset/hydrate.
      const mandateId = registry.getLive()?.mandateId ?? registry.getFocusedMandateId();
      if (mandateId) {
        void eventStore.beginAttempt({ attemptId, mandateId });
      }
    },
  });

  const control = createAttemptControl({
    engine,
    registry,
    mandates,
    loadRunContext: deps.loadRunContext,
    entitlements: deps.entitlements,
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

  // --- Durable ledger bridge (batch append + settle snapshot) ---
  /** Index into engine eventLog already copied into pendingDurable / written. */
  let durableLogCursor = 0;
  /** Last seq written for the current Attempt partition (settle snapshot). */
  let attemptDurableSeq = 0;
  let pendingDurable: RuntimeEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushChain: Promise<void> = Promise.resolve();
  let lastStatus: RunStatus = snapshot.status;
  let ledgerAttemptId: string | null = null;

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const flushUi = () => {
    rafId = null;
    if (!pending) return;
    snapshot = pending;
    pending = null;
    emit();
  };

  function resolveMandateId(): string | null {
    return registry.getLive()?.mandateId ?? registry.getFocusedMandateId();
  }

  function resolveAttemptId(): string | null {
    return ledgerAttemptId ?? registry.getLive()?.attemptId ?? engine.getProjection().taskId;
  }

  function resetLedgerCursors(): void {
    durableLogCursor = 0;
    attemptDurableSeq = 0;
    pendingDurable = [];
    ledgerAttemptId = null;
  }

  async function writePendingEvents(): Promise<void> {
    if (pendingDurable.length === 0) {
      return;
    }
    const attemptId = resolveAttemptId();
    const mandateId = resolveMandateId();
    if (!attemptId || !mandateId) {
      return;
    }
    const batch = pendingDurable;
    pendingDurable = [];
    attemptDurableSeq = await eventStore.appendEvents({
      attemptId,
      mandateId,
      events: batch,
    });
  }

  async function settleLedger(status: RunStatus): Promise<void> {
    await writePendingEvents();
    const attemptId = resolveAttemptId();
    const mandateId = resolveMandateId();
    if (!attemptId || !mandateId) {
      return;
    }
    const projection = engine.getProjection();
    await eventStore.settleAttempt({
      attemptId,
      mandateId,
      status,
      lastSeq: attemptDurableSeq,
      snapshot: projectionToFoldSnapshot(projection),
    });
  }

  function scheduleLedgerFlush(hard: boolean): void {
    const run = () => {
      flushChain = flushChain
        .then(async () => {
          if (hard) {
            const status = engine.getProjection().status;
            if (isSettleStatus(status)) {
              await settleLedger(status);
              return;
            }
          }
          await writePendingEvents();
        })
        .catch(() => {
          // Ledger write failures must not tear down the Attempt; Chat checkpoint remains.
        });
    };

    if (hard) {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      run();
      return;
    }

    if (flushTimer !== null) {
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      run();
    }, 50);
  }

  async function flushLedger(): Promise<void> {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const status = engine.getProjection().status;
    if (isSettleStatus(status)) {
      flushChain = flushChain.then(() => settleLedger(status)).catch(() => {});
    } else {
      flushChain = flushChain.then(() => writePendingEvents()).catch(() => {});
    }
    await flushChain;
  }

  engine.subscribe(() => {
    pending = engine.getProjection();
    if (typeof requestAnimationFrame !== "function") {
      flushUi();
    } else if (rafId === null) {
      rafId = requestAnimationFrame(flushUi);
    }

    const log = engine.getEventLog();
    if (log.length < durableLogCursor) {
      // reset / retryFromMessage cleared the in-memory log
      durableLogCursor = log.length;
      pendingDurable = [];
      attemptDurableSeq = 0;
    } else if (log.length > durableLogCursor) {
      for (let i = durableLogCursor; i < log.length; i += 1) {
        const event = log[i];
        if (event) {
          pendingDurable.push(event);
        }
      }
      durableLogCursor = log.length;
    }

    const status = engine.getProjection().status;
    const prev = lastStatus;
    lastStatus = status;

    if (status === "waiting_permission" && prev !== status) {
      scheduleLedgerFlush(true);
      return;
    }
    if (isSettleStatus(status) && prev !== status) {
      scheduleLedgerFlush(true);
      return;
    }
    if (pendingDurable.length > 0) {
      scheduleLedgerFlush(false);
    }
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

  async function hydrateIdleChat(chat: StoredChat): Promise<void> {
    const ledger = await eventStore.loadForMandateOpen(chat.mandateId);
    if (ledger) {
      engine.hydrateFromLedger(ledger);
      resetLedgerCursors();
      durableLogCursor = engine.getEventLog().length;
      lastStatus = engine.getProjection().status;
      return;
    }
    engine.hydrate(chat.messages as UIMessage[]);
    resetLedgerCursors();
    lastStatus = engine.getProjection().status;
  }

  return {
    engine,
    control,
    registry,
    eventStore,
    entitlements: deps.entitlements,
    osLease,
    getMandateProjection: () => snapshot,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flushLedger,

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
        if (chatId) {
          const chat = await loadChat(chatId);
          if (chat) {
            const ensured = await ensureMandateForChat(chat);
            registry.setFocusedMandateId(ensured.mandateId);
          }
        }
        return;
      }

      await flushLedger();
      await engine.reset();
      registry.clearLive();
      resetLedgerCursors();

      if (!chatId) {
        registry.setLiveChatId(null);
        registry.setFocusedMandateId(null);
        snapshot = createEmptySessionProjection();
        lastStatus = snapshot.status;
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
      await hydrateIdleChat(ensured);
      snapshot = engine.getProjection();
      lastStatus = snapshot.status;
      emit();
    },

    async resetForMaintenance() {
      await flushLedger();
      await engine.reset();
      registry.resetPointers();
      osLease.clear();
      resetLedgerCursors();
      snapshot = createEmptySessionProjection();
      lastStatus = snapshot.status;
      emit();
    },
  };
}
