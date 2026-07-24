import type { UIMessage } from "ai";

import type { AttemptFoldSnapshot } from "@/lib/attempts";
import { foldStateFromSnapshot } from "@/lib/attempts";

import type { EscalationPort, EscalationPortMode } from "./control/escalation-port";
import type { OsLease } from "./control/os-lease";
import { planRegenerateFromAssistant } from "./control/regenerate-from-message";
import {
  createRunController,
  type ProduceRun,
  type ResolveInteraction,
  type RunConfig,
  type RunController,
} from "./control/run-controller";
import {
  RUNTIME_EVENT_SCHEMA_VERSION,
  type RuntimeEvent,
  type RuntimeEventPayload,
} from "./events";
import {
  createFoldState,
  foldStateFromMessages,
  reduceFold,
  toProjection,
  type FoldState,
} from "./fold";
import { foldModelContext } from "./model-context";
import { createEmptyMandateProjection, type MandateProjection } from "./projection";
import { isLiveRun } from "./run-status";

export type AttemptEngineListener = () => void;

export type RetryFromMessageConfig = Omit<RunConfig, "prompt" | "chatMessages" | "isRetry">;

export type LedgerHydrateInput = {
  snapshot: AttemptFoldSnapshot | null;
  events: readonly RuntimeEvent[];
};

export type AttemptEngine = {
  append: (payload: RuntimeEventPayload) => RuntimeEvent | null;
  getProjection: () => MandateProjection;
  getEventLog: () => readonly RuntimeEvent[];
  subscribe: (listener: AttemptEngineListener) => () => void;
  /** Cancel any in-flight run, then clear projection and event log. */
  reset: () => Promise<void>;
  /** Replace fold/projection from stored messages; clears in-memory eventLog. */
  hydrate: (messages: readonly UIMessage[]) => void;
  /** Open from durable ledger: settle snapshot + event tail (ADR 0007). */
  hydrateFromLedger: (input: LedgerHydrateInput) => void;
  start: (config: RunConfig) => Promise<void>;
  cancel: () => Promise<void>;
  resolve: (interaction: ResolveInteraction) => Promise<void>;
  retry: () => Promise<void>;
  /**
   * Regenerate the answer at `assistantMessageId`: keep prior turns + its user
   * prompt, drop that answer and everything after, re-run with isRetry.
   */
  retryFromMessage: (assistantMessageId: string, config: RetryFromMessageConfig) => Promise<void>;
  /**
   * @param continueSeq — when true, keep eventSeq (crash-open recovery after hydrateFromLedger).
   *   Default false resets seq for a fresh Attempt.
   */
  beginTask: (taskId: string, options?: { continueSeq?: boolean }) => void;
  clearTask: () => void;
};

export type AttemptEngineDeps = {
  produceRun: ProduceRun;
  onAttemptStarted?: (attemptId: string) => void;
  osLease?: OsLease;
  escalationPort?: EscalationPort;
  escalationMode?: EscalationPortMode;
  escalationTimeoutMs?: number;
};

export function createAttemptEngine(deps: AttemptEngineDeps): AttemptEngine {
  let fold: FoldState = createFoldState();
  let projection: MandateProjection = createEmptyMandateProjection();
  let eventLog: RuntimeEvent[] = [];
  let eventSeq = 0;
  let activeTaskId: string | null = null;
  const listeners = new Set<AttemptEngineListener>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function append(payload: RuntimeEventPayload): RuntimeEvent | null {
    if (!activeTaskId) {
      return null;
    }

    eventSeq += 1;
    const event: RuntimeEvent = {
      ...payload,
      eventId: `${activeTaskId}-${eventSeq}`,
      taskId: activeTaskId,
      timestamp: Date.now() + eventSeq,
      schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
    };

    if (fold.seenEventIds.has(event.eventId)) {
      return null;
    }

    fold = reduceFold(fold, event);
    projection = toProjection(fold, projection);
    eventLog = [...eventLog, event];
    notify();
    return event;
  }

  const controller: RunController = createRunController({
    append,
    beginTask: (taskId) => {
      activeTaskId = taskId;
      eventSeq = 0;
    },
    clearTask: () => {
      activeTaskId = null;
      eventSeq = 0;
    },
    getProjection: () => projection,
    produceRun: deps.produceRun,
    onAttemptStarted: deps.onAttemptStarted,
    osLease: deps.osLease,
    escalationPort: deps.escalationPort,
    escalationMode: deps.escalationMode,
    escalationTimeoutMs: deps.escalationTimeoutMs,
  });

  return {
    append,
    getProjection: () => projection,
    getEventLog: () => eventLog,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async reset() {
      await controller.cancel();
      fold = createFoldState();
      projection = createEmptyMandateProjection();
      eventLog = [];
      eventSeq = 0;
      activeTaskId = null;
      notify();
    },
    hydrate(messages) {
      fold = foldStateFromMessages(messages);
      projection = toProjection(fold, null);
      eventLog = [];
      eventSeq = 0;
      activeTaskId = null;
      notify();
    },
    hydrateFromLedger(input) {
      let next = input.snapshot ? foldStateFromSnapshot(input.snapshot) : createFoldState();
      for (const event of input.events) {
        next = reduceFold(next, event);
      }
      fold = next;
      projection = toProjection(fold, null);
      eventLog = [...input.events];
      eventSeq = input.events.length;
      activeTaskId = null;
      notify();
    },
    beginTask(taskId, options) {
      activeTaskId = taskId;
      if (!options?.continueSeq) {
        eventSeq = 0;
      }
    },
    clearTask() {
      activeTaskId = null;
      eventSeq = 0;
    },
    start: (config) => controller.start(config),
    cancel: () => controller.cancel(),
    resolve: (interaction) => controller.resolve(interaction),
    retry: () => controller.retry(),
    async retryFromMessage(assistantMessageId, config) {
      if (isLiveRun(projection.status)) {
        return;
      }

      const plan = planRegenerateFromAssistant(projection.chatMessages, assistantMessageId);
      if (!plan) {
        return;
      }

      await controller.cancel();
      fold = foldStateFromMessages(plan.messages);
      projection = toProjection(fold, null);
      eventLog = [];
      eventSeq = 0;
      activeTaskId = null;
      notify();

      const execution = foldModelContext({ chatMessages: plan.messages });
      await controller.start({
        ...config,
        prompt: plan.prompt,
        chatMessages: execution.messages,
        isRetry: true,
      });
    },
  };
}
