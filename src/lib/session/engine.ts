import {
  createFoldState,
  reduceSession,
  toProjection,
  type FoldState,
} from "./project-session";
import { createEmptySessionProjection, type SessionProjection } from "./projection";
import {
  createRunController,
  type PermissionDecision,
  type ProduceRun,
  type RunConfig,
  type RunController,
} from "./control/run-controller";
import { RUNTIME_EVENT_SCHEMA_VERSION, type RuntimeEvent, type RuntimeEventPayload } from "./events";

export type SessionEngineListener = () => void;

export type SessionEngine = {
  append: (payload: RuntimeEventPayload) => RuntimeEvent | null;
  getProjection: () => SessionProjection;
  getEventLog: () => readonly RuntimeEvent[];
  subscribe: (listener: SessionEngineListener) => () => void;
  reset: () => void;
  start: (config: RunConfig) => Promise<void>;
  cancel: () => Promise<void>;
  resolvePermission: (
    callId: string,
    decision: PermissionDecision,
    persist?: boolean,
  ) => Promise<void>;
  retry: () => Promise<void>;
  beginTask: (taskId: string) => void;
  clearTask: () => void;
};

export type SessionEngineDeps = {
  produceRun: ProduceRun;
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
    projection = toProjection(fold);
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
    reset() {
      fold = createFoldState();
      projection = createEmptySessionProjection();
      eventLog = [];
      eventSeq = 0;
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
  };
}
