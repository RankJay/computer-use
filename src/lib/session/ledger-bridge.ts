import { projectionToFoldSnapshot, type AttemptEventStore } from "@/lib/attempts";
import type { StoredChat } from "@/lib/chats";
import {
  DEFAULT_SUCCESS_CRITERIA,
  nextMandateStatusAfterAttemptSettle,
  type MandatesPersistence,
} from "@/lib/mandates";

import type { AttemptRegistry } from "./control/attempt-registry";
import type { AttemptEngine } from "./engine";
import type { RunStatus, RuntimeEvent } from "./events";
import { isLiveRun, shouldSettleLedger } from "./run-status";

export type LedgerBridgeDeps = {
  engine: AttemptEngine;
  registry: AttemptRegistry;
  eventStore: AttemptEventStore;
  mandates: MandatesPersistence;
  /** Surface ledger errors to UI subscribers (host emit). */
  onLedgerErrorChange: () => void;
};

export type LedgerBridge = {
  /** Wire from AttemptEngine.onAttemptStarted after waiter resolve. */
  noteAttemptStarted: (attemptId: string) => void;
  /** Subscribe to engine for durable append / settle / mandate lifecycle. */
  attach: () => () => void;
  flushLedger: () => Promise<void>;
  getLedgerError: () => unknown | null;
  getLastStatus: () => RunStatus;
  setLastStatus: (status: RunStatus) => void;
  resetLedgerCursors: () => void;
  hydrateIdleChat: (chat: StoredChat) => Promise<void>;
};

/**
 * Durable Attempt ledger: batched append, settle snapshots, mandate lifecycle, crash reopen.
 */
export function createLedgerBridge(deps: LedgerBridgeDeps): LedgerBridge {
  const { engine, registry, eventStore, mandates, onLedgerErrorChange } = deps;

  let durableLogCursor = 0;
  let attemptDurableSeq = 0;
  let pendingDurable: RuntimeEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushChain: Promise<void> = Promise.resolve();
  let lastStatus: RunStatus = engine.getProjection().status;
  let ledgerAttemptId: string | null = null;
  let lastLedgerError: unknown | null = null;

  function noteLedgerError(error: unknown): void {
    lastLedgerError = error;
    onLedgerErrorChange();
  }

  function clearLedgerError(): void {
    if (lastLedgerError !== null) {
      lastLedgerError = null;
      onLedgerErrorChange();
    }
  }

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

  async function syncMandateLifecycle(status: RunStatus): Promise<void> {
    const mandateId = resolveMandateId();
    if (!mandateId) {
      return;
    }
    switch (status) {
      case "waiting_interaction":
        await mandates.update(mandateId, { status: "waiting_interaction" });
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
            if (shouldSettleLedger(status)) {
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
    if (shouldSettleLedger(status)) {
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

  function onEngineTick(): void {
    const log = engine.getEventLog();
    if (log.length < durableLogCursor) {
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
        status === "waiting_interaction" ||
        status === "running" ||
        status === "streaming" ||
        shouldSettleLedger(status)
      ) {
        void syncMandateLifecycle(status);
      }
    }

    if (status === "waiting_interaction" && prev !== status) {
      scheduleLedgerFlush(true);
      return;
    }
    if (shouldSettleLedger(status) && prev !== status) {
      scheduleLedgerFlush(true);
      return;
    }
    if (pendingDurable.length > 0) {
      scheduleLedgerFlush(false);
    }
  }

  async function forceSettleUnrecovered(mandateId: string): Promise<void> {
    const projection = engine.getProjection();
    if (!isLiveRun(projection.status)) {
      return;
    }
    const log = engine.getEventLog();
    const lastEvent = log.length > 0 ? log[log.length - 1] : undefined;
    const attemptId =
      projection.taskId ?? lastEvent?.taskId ?? `unrecovered-${crypto.randomUUID()}`;
    registry.setFocusedMandateId(mandateId);
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
      resetLedgerCursors();
      lastStatus = engine.getProjection().status;
      return;
    }
    engine.hydrateFromLedger(ledger);
    resetLedgerCursors();
    durableLogCursor = engine.getEventLog().length;
    lastStatus = engine.getProjection().status;
    if (isLiveRun(lastStatus)) {
      await forceSettleUnrecovered(chat.mandateId);
      lastStatus = engine.getProjection().status;
    }
  }

  return {
    noteAttemptStarted: (attemptId) => {
      ledgerAttemptId = attemptId;
      attemptDurableSeq = 0;
      const mandateId = registry.getLive()?.mandateId ?? registry.getFocusedMandateId();
      if (mandateId) {
        void eventStore.beginAttempt({ attemptId, mandateId });
      }
    },
    attach: () => engine.subscribe(onEngineTick),
    flushLedger,
    getLedgerError: () => lastLedgerError,
    getLastStatus: () => lastStatus,
    setLastStatus: (status) => {
      lastStatus = status;
    },
    resetLedgerCursors,
    hydrateIdleChat,
  };
}
