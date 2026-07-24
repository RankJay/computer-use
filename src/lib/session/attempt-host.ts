import { createAttemptEventStore, type AttemptEventStore } from "@/lib/attempts";
import type { StoredChat } from "@/lib/chats";
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
import { createAttemptEngine, type AttemptEngine } from "./engine";
import { createLedgerBridge, type LedgerBridge } from "./ledger-bridge";
import type { MandateProjection } from "./projection";
import { createEmptyMandateProjection } from "./projection";
import { createRouteBinder } from "./route-binder";

export type AttemptHostListener = () => void;

export type BatchedAttemptStore = {
  engine: AttemptEngine;
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

/**
 * App-runtime host: AttemptControl + engine + durable ledger outlive any Chat route.
 * Composes ledger bridge + route binder; owns RAF-batched UI projection (ADR 0006).
 */
export function createAttemptHost(deps: AttemptHostDeps): BatchedAttemptStore {
  const mandates = deps.mandates ?? createMandatesPersistence();
  const eventStore = deps.eventStore ?? createAttemptEventStore();
  const registry = createAttemptRegistry();
  const osLease = deps.osLease ?? createOsLease();

  let attemptStartedWaiter: ((attemptId: string) => void) | null = null;
  const ledgerSlot: { bridge?: LedgerBridge } = {};

  const produceRun: ProduceRun = async (ctx) =>
    deps.produceRun({
      ...ctx,
      entitlements: deps.entitlements,
      osLease,
      getEventLog: () => engine.getEventLog(),
    });

  const engine = createAttemptEngine({
    produceRun,
    osLease,
    escalationPort: deps.escalationPort,
    escalationMode: deps.escalationMode,
    escalationTimeoutMs: deps.escalationTimeoutMs,
    onAttemptStarted: (attemptId) => {
      const waiter = attemptStartedWaiter;
      attemptStartedWaiter = null;
      waiter?.(attemptId);
      ledgerSlot.bridge?.noteAttemptStarted(attemptId);
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

  function publishProjection(projection: MandateProjection): void {
    pending = null;
    if (rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    snapshot = projection;
    emit();
  }

  const ledger = createLedgerBridge({
    engine,
    registry,
    eventStore,
    mandates,
    onLedgerErrorChange: emit,
  });
  ledgerSlot.bridge = ledger;

  ledger.attach();

  engine.subscribe(() => {
    pending = engine.getProjection();
    if (typeof requestAnimationFrame !== "function") {
      flushUi();
    } else if (rafId === null) {
      rafId = requestAnimationFrame(flushUi);
    }
  });

  const routeBinder = createRouteBinder({
    engine,
    registry,
    flushLedger: () => ledger.flushLedger(),
    resetLedgerCursors: () => ledger.resetLedgerCursors(),
    hydrateIdleChat: (chat) => ledger.hydrateIdleChat(chat),
    setLastStatus: (status) => ledger.setLastStatus(status),
    publishProjection,
  });

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
    flushLedger: () => ledger.flushLedger(),
    getLedgerError: () => ledger.getLedgerError(),
    bindChatRoute: (input) => routeBinder.bindChatRoute(input),

    async resetForMaintenance() {
      await ledger.flushLedger();
      await engine.reset();
      registry.resetPointers();
      osLease.clear();
      ledger.resetLedgerCursors();
      const empty = createEmptyMandateProjection();
      ledger.setLastStatus(empty.status);
      publishProjection(empty);
    },
  };
}
