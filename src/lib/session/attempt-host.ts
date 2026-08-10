import { createAttemptEventStore, type AttemptEventStore } from "@/lib/attempts";
import type { StoredChat } from "@/lib/chats";
import type { EntitlementPolicy } from "@/lib/entitlements";
import { createMandatesPersistence, type MandatesPersistence } from "@/lib/mandates";

import {
  createAttemptControl,
  type AttemptControl,
  type LoadedRunContext,
} from "./control/attempt-control";
import type { AttemptLifecyclePort } from "./control/attempt-lifecycle-port";
import { createAttemptRegistry, type AttemptRegistry } from "./control/attempt-registry";
import {
  createEscalationPort,
  resolveEscalationModeForWatch,
  type EscalationPort,
  type EscalationPortModeInput,
} from "./control/escalation-port";
import { createOsLease, type OsLease } from "./control/os-lease";
import type { ProduceRun } from "./control/run-controller";
import { createAttemptEngine, type AttemptEngine } from "./engine";
import { createLedgerBridge, type LedgerBridge } from "./ledger-bridge";
import type { MandateProjection } from "./projection";
import { createEmptyMandateProjection } from "./projection";
import { createRouteBinder } from "./route-binder";
import { createStallBridge } from "./stall-bridge";

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
  /** Hard-flush buffered ledger writes (teardown / route bind / chat checkpoint / tests). */
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
  /** Inject EscalationPort (tests). Default: focus-aware park (ADR 0009). */
  escalationPort?: EscalationPort;
  /**
   * Override mode when escalationPort omitted.
   * Default: interactive only while this Attempt's Mandate is UI-focused; else park.
   */
  escalationMode?: EscalationPortModeInput;
  escalationTimeoutMs?: number;
  /** Progress stall → cancel (ops-contract §5). Default 90s. */
  stallAfterMs?: number;
  /** Poll interval while running/streaming. Default 5s. */
  stallPollIntervalMs?: number;
  /** Injected clock for stall watchdog tests. */
  stallNow?: () => number;
  /** Product analytics Attempt funnel; defaults to no-op. */
  lifecyclePort?: AttemptLifecyclePort;
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

  const escalationPort =
    deps.escalationPort ??
    createEscalationPort({
      mode:
        deps.escalationMode ??
        ((request) =>
          resolveEscalationModeForWatch({
            requestAttemptId: request.attemptId,
            live: registry.getLive(),
            focusedMandateId: registry.getFocusedMandateId(),
          })),
      timeoutMs: deps.escalationTimeoutMs,
      osLease,
    });

  let attemptStartedWaiter: ((attemptId: string) => void) | null = null;
  const ledgerSlot: { bridge?: LedgerBridge } = {};

  const engine = createAttemptEngine({
    produceRun: deps.produceRun,
    osLease,
    escalationPort,
    escalationTimeoutMs: deps.escalationTimeoutMs,
    entitlements: deps.entitlements,
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
    lifecyclePort: deps.lifecyclePort,
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

  const stall = createStallBridge({
    getStatus: () => engine.getProjection().status,
    cancel: () => control.cancel(),
    stallAfterMs: deps.stallAfterMs,
    pollIntervalMs: deps.stallPollIntervalMs,
    now: deps.stallNow,
  });

  engine.subscribe(() => {
    pending = engine.getProjection();
    if (typeof requestAnimationFrame !== "function") {
      flushUi();
    } else if (rafId === null) {
      rafId = requestAnimationFrame(flushUi);
    }
    stall.onProjection();
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
      stall.dispose();
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
