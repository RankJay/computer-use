import type { UIMessage } from "ai";

import type { AttemptFoldSnapshot } from "@/lib/attempts";
import { foldStateFromSnapshot } from "@/lib/attempts";

import { planRegenerateFromAssistant } from "./control/regenerate-from-message";
import {
  createRunController,
  type PermissionDecision,
  type ProduceRun,
  type RunConfig,
  type RunController,
} from "./control/run-controller";
import {
  RUNTIME_EVENT_SCHEMA_VERSION,
  type RuntimeEvent,
  type RuntimeEventPayload,
  type RunStatus,
} from "./events";
import { foldExecutionContext } from "./execution-context";
import {
  createFoldState,
  foldStateFromMessages,
  reduceSession,
  toProjection,
  type FoldState,
} from "./project-session";
import { createEmptySessionProjection, type SessionProjection } from "./projection";

export type SessionEngineListener = () => void;

export type RetryFromMessageConfig = Omit<RunConfig, "prompt" | "chatMessages" | "isRetry">;

export type LedgerHydrateInput = {
  snapshot: AttemptFoldSnapshot | null;
  events: readonly RuntimeEvent[];
};

export type SessionEngine = {
  append: (payload: RuntimeEventPayload) => RuntimeEvent | null;
  getProjection: () => SessionProjection;
  getEventLog: () => readonly RuntimeEvent[];
  subscribe: (listener: SessionEngineListener) => () => void;
  /** Cancel any in-flight run, then clear projection and event log. */
  reset: () => Promise<void>;
  /** Replace fold/projection from stored messages; clears in-memory eventLog. */
  hydrate: (messages: readonly UIMessage[]) => void;
  /** Open from durable ledger: settle snapshot + event tail (ADR 0007). */
  hydrateFromLedger: (input: LedgerHydrateInput) => void;
  start: (config: RunConfig) => Promise<void>;
  cancel: () => Promise<void>;
  resolvePermission: (
    callId: string,
    decision: PermissionDecision,
    persist?: boolean,
  ) => Promise<void>;
  retry: () => Promise<void>;
  /**
   * Regenerate the answer at `assistantMessageId`: keep prior turns + its user
   * prompt, drop that answer and everything after, re-run with isRetry.
   */
  retryFromMessage: (assistantMessageId: string, config: RetryFromMessageConfig) => Promise<void>;
  beginTask: (taskId: string) => void;
  clearTask: () => void;
};

function isActiveStatus(status: RunStatus): boolean {
  return status === "running" || status === "streaming" || status === "waiting_permission";
}

export type SessionEngineDeps = {
  produceRun: ProduceRun;
  onAttemptStarted?: (attemptId: string) => void;
};

export function createSessionEngine(deps: SessionEngineDeps): SessionEngine {
  let fold: FoldState = createFoldState();
  let projection: SessionProjection = createEmptySessionProjection();
  let eventLog: RuntimeEvent[] = [];
  let eventSeq = 0;
  let activeTaskId: string | null = null;
  const listeners = new Set<SessionEngineListener>();

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

    fold = reduceSession(fold, event);
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
      projection = createEmptySessionProjection();
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
        next = reduceSession(next, event);
      }
      fold = next;
      projection = toProjection(fold, null);
      eventLog = [...input.events];
      eventSeq = input.events.length;
      activeTaskId = null;
      notify();
    },
    beginTask(taskId) {
      activeTaskId = taskId;
      eventSeq = 0;
    },
    clearTask() {
      activeTaskId = null;
      eventSeq = 0;
    },
    start: (config) => controller.start(config),
    cancel: () => controller.cancel(),
    resolvePermission: (callId, decision, persist) =>
      controller.resolvePermission(callId, decision, persist),
    retry: () => controller.retry(),
    async retryFromMessage(assistantMessageId, config) {
      if (isActiveStatus(projection.status)) {
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

      const execution = foldExecutionContext({ chatMessages: plan.messages });
      await controller.start({
        ...config,
        prompt: plan.prompt,
        chatMessages: execution.messages,
        isRetry: true,
      });
    },
  };
}
