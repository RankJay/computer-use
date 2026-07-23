import {
  createAttemptEventStore,
  projectionToFoldSnapshot,
  type AttemptEventStore,
} from "@/lib/attempts";
import type { StoredChat } from "@/lib/chats/types";
import type { EntitlementPolicy } from "@/lib/entitlements";
import {
  createMandatesPersistence,
  DEFAULT_SUCCESS_CRITERIA,
  nextMandateStatusAfterAttemptSettle,
  type MandatesPersistence,
} from "@/lib/mandates";

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
import type { MandateProjection } from "./projection";
import { createEmptyMandateProjection } from "./projection";

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
  /** MandateProjection (audit/UI). */
  getMandateProjection: () => MandateProjection;
  subscribe: (listener: AttemptHostListener) => () => void;
  /**
   * Route chat change. Never cancels a live Attempt.
   * - live + same chat / same draft mandate → reattach (no reset)
   * - live + different chat → focus pointer only
   * - idle → reset + hydrate from Attempt ledger (empty when no rows)
   */
  bindChatRoute: (input: {
    chatId: string | undefined;
    loadChat: (id: string) => Promise<StoredChat | null>;
  }) => Promise<void>;
  resetForMaintenance: () => Promise<void>;
  /** Flush buffered ledger writes (tests / shutdown). */
  flushLedger: () => Promise<void>;
  /** Last durable-ledger write failure (null when healthy). */
  getLedgerError: () => unknown | null;
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
      getEventLog: () => engine.getEventLog(),
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

  let snapshot: MandateProjection = engine.getProjection();
  let pending: MandateProjection | null = null;
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
  let lastLedgerError: unknown | null = null;
  let bindChain: Promise<void> = Promise.resolve();
  let bindGeneration = 0;

  function noteLedgerError(error: unknown): void {
    lastLedgerError = error;
    emit();
  }

  function clearLedgerError(): void {
    if (lastLedgerError !== null) {
      lastLedgerError = null;
      emit();
    }
  }

  async function syncMandateLifecycle(status: RunStatus): Promise<void> {
    const mandateId = resolveMandateId();
    if (!mandateId) {
      return;
    }
    switch (status) {
      case "waiting_permission":
        await mandates.update(mandateId, { status: "waiting_permission" });
        return;
      case "running":
      case "streaming":
        await mandates.update(mandateId, { status: "running" });
        return;
      case "completed":
      case "failed":
      case "cancelled": {
        const mandate = await mandates.get(mandateId);
        const criteria = mandate?.successCriteria ?? DEFAULT_SUCCESS_CRITERIA;
        const next = nextMandateStatusAfterAttemptSettle(criteria, status);
        await mandates.update(mandateId, { status: next });
        return;
      }
      case "idle":
        return;
      default: {
        const _exhaustive: never = status;
        return _exhaustive;
      }
    }
  }

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
              clearLedgerError();
              return undefined;
            }
          }
          await writePendingEvents();
          clearLedgerError();
          return undefined;
        })
        .catch((error: unknown) => {
          // Do not tear down the Attempt; surface error for Clients / diagnostics.
          noteLedgerError(error);
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
      flushChain = flushChain
        .then(async () => {
          await settleLedger(status);
          clearLedgerError();
          return undefined;
        })
        .catch((error: unknown) => {
          noteLedgerError(error);
        });
    } else {
      flushChain = flushChain
        .then(async () => {
          await writePendingEvents();
          clearLedgerError();
          return undefined;
        })
        .catch((error: unknown) => {
          noteLedgerError(error);
        });
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

    if (status !== prev) {
      if (
        status === "waiting_permission" ||
        status === "running" ||
        status === "streaming" ||
        isSettleStatus(status)
      ) {
        void syncMandateLifecycle(status);
      }
    }

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

  async function forceSettleUnrecovered(mandateId: string): Promise<void> {
    const projection = engine.getProjection();
    if (!isActiveStatus(projection.status)) {
      return;
    }
    const log = engine.getEventLog();
    const lastEvent = log.length > 0 ? log[log.length - 1] : undefined;
    const attemptId =
      projection.taskId ?? lastEvent?.taskId ?? `unrecovered-${crypto.randomUUID()}`;
    registry.setFocusedMandateId(mandateId);
    // Keep seq past hydrated events so recovery appends are not deduped.
    engine.beginTask(attemptId, { continueSeq: true });
    ledgerAttemptId = attemptId;
    engine.append({ type: "task.status_changed", status: "cancelled" });
    engine.append({ type: "task.completed", finishReason: "cancelled" });
    engine.clearTask();
    await settleLedger("cancelled");
    await mandates.update(mandateId, { status: "armed" });
  }

  async function hydrateIdleChat(chat: StoredChat): Promise<void> {
    const ledger = await eventStore.loadForMandateOpen(chat.mandateId);
    if (!ledger) {
      // New / never-run Mandate — projection stays empty after reset.
      resetLedgerCursors();
      lastStatus = engine.getProjection().status;
      return;
    }
    engine.hydrateFromLedger(ledger);
    resetLedgerCursors();
    durableLogCursor = engine.getEventLog().length;
    lastStatus = engine.getProjection().status;
    if (isActiveStatus(lastStatus)) {
      // Crash reopen: no live runner — force-cancel so UI/cancel/permission are coherent.
      await forceSettleUnrecovered(chat.mandateId);
      lastStatus = engine.getProjection().status;
    }
  }

  return {
    engine,
    control,
    registry,
    eventStore,
    entitlements: deps.entitlements,
    osLease,
    getMandateProjection: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flushLedger,
    getLedgerError: () => lastLedgerError,

    async bindChatRoute(input) {
      const generation = ++bindGeneration;
      const run = async (): Promise<void> => {
        if (generation !== bindGeneration) {
          return;
        }

        const attachLiveFocus = async (): Promise<boolean> => {
          const status = engine.getProjection().status;
          const live = registry.getLive();
          if (!(isActiveStatus(status) && live)) {
            return false;
          }
          const liveChatId = registry.getLiveChatId();
          if (input.chatId && input.chatId === liveChatId) {
            registry.setFocusedMandateId(live.mandateId);
            return true;
          }
          if (!input.chatId && liveChatId === null) {
            registry.setFocusedMandateId(live.mandateId);
            return true;
          }
          if (input.chatId) {
            const chat = await input.loadChat(input.chatId);
            if (generation !== bindGeneration) {
              return true;
            }
            if (chat) {
              registry.setFocusedMandateId(chat.mandateId);
            }
          }
          return true;
        };

        if (await attachLiveFocus()) {
          return;
        }

        await flushLedger();
        if (generation !== bindGeneration) {
          return;
        }
        // Start may have landed while we flushed — never reset over a live Attempt.
        if (await attachLiveFocus()) {
          return;
        }

        await engine.reset();
        if (generation !== bindGeneration) {
          return;
        }
        if (await attachLiveFocus()) {
          return;
        }

        registry.clearLive();
        resetLedgerCursors();

        if (!input.chatId) {
          registry.setLiveChatId(null);
          registry.setFocusedMandateId(null);
          snapshot = createEmptyMandateProjection();
          lastStatus = snapshot.status;
          emit();
          return;
        }

        const chat = await input.loadChat(input.chatId);
        if (generation !== bindGeneration) {
          return;
        }
        if (!chat) {
          registry.setLiveChatId(null);
          registry.setFocusedMandateId(null);
          return;
        }

        if (await attachLiveFocus()) {
          return;
        }

        registry.setLiveChatId(chat.id);
        registry.setFocusedMandateId(chat.mandateId);
        await hydrateIdleChat(chat);
        if (generation !== bindGeneration) {
          return;
        }
        snapshot = engine.getProjection();
        lastStatus = snapshot.status;
        emit();
      };

      const queued = bindChain.then(run, run);
      bindChain = queued.then(
        () => undefined,
        () => undefined,
      );
      await queued;
    },

    async resetForMaintenance() {
      await flushLedger();
      await engine.reset();
      registry.resetPointers();
      osLease.clear();
      resetLedgerCursors();
      snapshot = createEmptyMandateProjection();
      lastStatus = snapshot.status;
      emit();
    },
  };
}
