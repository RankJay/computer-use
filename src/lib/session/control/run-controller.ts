import type { UIMessage } from "ai";

import { createTauriCapabilityInvoker, type PermissionWaiter } from "@/lib/agent/capabilities";
import { runAgentLoop } from "@/lib/agent/run-agent";
import type { AppSecrets, AppSettings } from "@/lib/settings/types";

import type { RuntimeEvent, RuntimeEventPayload } from "../events";
import type { EventBus } from "../transport/event-bus";

export type RunConfig = {
  prompt: string;
  modelId: string;
  chatMessages?: UIMessage[];
  settings: AppSettings;
  secrets: AppSecrets;
};

export type PermissionDecision = "approved" | "denied";

export type RunController = {
  start: (config: RunConfig) => Promise<void>;
  cancel: () => Promise<void>;
  resolvePermission: (
    callId: string,
    decision: PermissionDecision,
    persist?: boolean,
  ) => Promise<void>;
};

export type RunControllerDeps = {
  bus: EventBus;
  replayDemoEvents: (config: RunConfig, taskId: string, signal: AbortSignal) => Promise<void>;
};

function createRuntimeEvent(
  taskId: string,
  seq: number,
  payload: RuntimeEventPayload,
): RuntimeEvent {
  return {
    ...payload,
    eventId: `${taskId}-${seq}`,
    taskId,
    timestamp: Date.now() + seq,
  } as RuntimeEvent;
}

export function createRunController(deps: RunControllerDeps): RunController {
  let activeAbort: AbortController | null = null;
  let activeTaskId: string | null = null;
  let eventSeq = 0;
  const permissionResolvers = new Map<string, (decision: PermissionDecision) => void>();

  function emit(payload: RuntimeEventPayload): void {
    if (!activeTaskId) return;
    eventSeq += 1;
    deps.bus.emit(createRuntimeEvent(activeTaskId, eventSeq, payload));
  }

  function clearActiveRun(): void {
    activeAbort = null;
    activeTaskId = null;
    eventSeq = 0;
    permissionResolvers.clear();
  }

  function createPermissionWaiter(callId: string): PermissionWaiter {
    return {
      waitForDecision: () =>
        new Promise((resolve) => {
          permissionResolvers.set(callId, resolve);
        }),
    };
  }

  async function runLive(config: RunConfig, taskId: string, signal: AbortSignal): Promise<void> {
    emit({
      type: "task.started",
      prompt: config.prompt,
      modelId: config.modelId,
      agentMode: "live",
      userMessageId: `user-${taskId}`,
    });

    const executeNative = config.settings.workspaceRoot
      ? createTauriCapabilityInvoker(config.settings.workspaceRoot)
      : undefined;

    const messages: UIMessage[] = [
      ...(config.chatMessages ?? []),
      {
        id: `user-${taskId}`,
        role: "user",
        parts: [{ type: "text", text: config.prompt }],
      },
    ];

    const result = await runAgentLoop({
      taskId,
      messages,
      modelId: config.modelId,
      settings: config.settings,
      secrets: config.secrets,
      signal,
      emit: (payload) => emit(payload as RuntimeEventPayload),
      createPermissionWaiter: ({ callId }) => createPermissionWaiter(callId),
      executeNative,
    });

    if (signal.aborted) {
      return;
    }

    if (result.finishReason === "error") {
      return;
    }

    emit({
      type: "task.completed",
      finishReason: result.finishReason,
    });
  }

  return {
    async start(config) {
      if (activeAbort) {
        await this.cancel();
      }

      const taskId = crypto.randomUUID();
      activeTaskId = taskId;
      eventSeq = 0;
      activeAbort = new AbortController();

      try {
        if (config.settings.agentMode === "demo") {
          await deps.replayDemoEvents(config, taskId, activeAbort.signal);
          return;
        }

        await runLive(config, taskId, activeAbort.signal);
      } finally {
        clearActiveRun();
      }
    },

    async cancel() {
      if (!activeAbort || !activeTaskId) return;

      for (const resolve of permissionResolvers.values()) {
        resolve("denied");
      }
      permissionResolvers.clear();

      activeAbort.abort();
      emit({ type: "task.status_changed", status: "cancelled" });
      emit({ type: "task.completed", finishReason: "cancelled" });
    },

    async resolvePermission(callId, decision) {
      const resolve = permissionResolvers.get(callId);
      if (!resolve) return;

      permissionResolvers.delete(callId);
      resolve(decision);
    },
  };
}

export async function replayDemoEventsInstant(
  bus: EventBus,
  events: readonly RuntimeEvent[],
  config: RunConfig,
  taskId: string,
  signal: AbortSignal,
): Promise<void> {
  let seq = 0;

  for (const source of events) {
    if (signal.aborted) break;

    await Promise.resolve();

    if (signal.aborted) break;

    seq += 1;
    const event: RuntimeEvent = {
      ...source,
      eventId: `${taskId}-demo-${seq}`,
      taskId,
      timestamp: Date.now() + seq,
      ...(source.type === "task.started"
        ? {
            prompt: config.prompt,
            modelId: config.modelId,
            agentMode: "demo" as const,
            userMessageId: `user-${taskId}`,
          }
        : {}),
      ...(source.type === "usage.updated" ? { modelId: config.modelId } : {}),
    };

    bus.emit(event);
  }

  const lastEvent = events[events.length - 1];
  if (!signal.aborted && lastEvent?.type !== "task.completed") {
    seq += 1;
    bus.emit({
      eventId: `${taskId}-demo-${seq}`,
      taskId,
      timestamp: Date.now() + seq,
      type: "task.completed",
      finishReason: "stop",
    });
  }
}

export function createDefaultRunController(
  bus: EventBus,
  demoEvents: readonly RuntimeEvent[],
): RunController {
  return createRunController({
    bus,
    replayDemoEvents: (config, taskId, signal) =>
      replayDemoEventsInstant(bus, demoEvents, config, taskId, signal),
  });
}
