import type { UIMessage } from "ai";

import type { AppSecrets, AppSettings } from "@/lib/settings/types";

import type { RuntimeEventPayload } from "../events";
import type { SessionProjection } from "../projection";

export type PermissionDecision = "approved" | "denied";

export type PermissionWaiter = {
  waitForDecision: () => Promise<PermissionDecision>;
};

export type RunConfig = {
  prompt: string;
  modelId: string;
  chatMessages?: UIMessage[];
  settings: AppSettings;
  secrets: AppSecrets;
  /** When true, producers should omit appending a new user message row. */
  isRetry?: boolean;
  /** Persist capability approval into settings (once-per-class). */
  persistApproval?: (capability: string) => Promise<void>;
};

export type ProduceRunContext = {
  config: RunConfig;
  taskId: string;
  signal: AbortSignal;
  append: (payload: RuntimeEventPayload) => unknown;
  createPermissionWaiter: (callId: string) => PermissionWaiter;
};

export type ProduceRun = (ctx: ProduceRunContext) => Promise<void>;

export type RunController = {
  start: (config: RunConfig) => Promise<void>;
  cancel: () => Promise<void>;
  resolvePermission: (
    callId: string,
    decision: PermissionDecision,
    persist?: boolean,
  ) => Promise<void>;
  retry: () => Promise<void>;
};

export type RunControllerDeps = {
  append: (payload: RuntimeEventPayload) => unknown;
  beginTask: (taskId: string) => void;
  clearTask: () => void;
  getProjection: () => SessionProjection;
  produceRun: ProduceRun;
  /** Fires once the Attempt is in-flight (after beginTask), before produceRun settles. */
  onAttemptStarted?: (attemptId: string) => void;
};

export function createRunController(deps: RunControllerDeps): RunController {
  let activeAbort: AbortController | null = null;
  let activeTaskId: string | null = null;
  let lastConfig: RunConfig | null = null;
  const permissionResolvers = new Map<string, (decision: PermissionDecision) => void>();

  function createPermissionWaiter(callId: string): PermissionWaiter {
    return {
      waitForDecision: () =>
        new Promise((resolve) => {
          permissionResolvers.set(callId, resolve);
        }),
    };
  }

  function clearActiveRun(): void {
    activeAbort = null;
    activeTaskId = null;
    permissionResolvers.clear();
    deps.clearTask();
  }

  async function runWithConfig(config: RunConfig): Promise<void> {
    if (activeAbort) {
      await cancel();
    }

    const taskId = crypto.randomUUID();
    activeTaskId = taskId;
    lastConfig = config;
    activeAbort = new AbortController();
    deps.beginTask(taskId);
    deps.onAttemptStarted?.(taskId);

    try {
      await deps.produceRun({
        config,
        taskId,
        signal: activeAbort.signal,
        append: deps.append,
        createPermissionWaiter,
      });
    } finally {
      clearActiveRun();
    }
  }

  async function cancel(): Promise<void> {
    if (!activeAbort || !activeTaskId) return;

    for (const resolve of permissionResolvers.values()) {
      resolve("denied");
    }
    permissionResolvers.clear();

    activeAbort.abort();
    deps.append({ type: "task.status_changed", status: "cancelled" });
    deps.append({ type: "task.completed", finishReason: "cancelled" });
  }

  return {
    start: (config) => runWithConfig(config),

    cancel,

    async resolvePermission(callId, decision, persist) {
      const resolve = permissionResolvers.get(callId);
      if (!resolve) return;
      permissionResolvers.delete(callId);

      if (decision === "approved" && persist && lastConfig) {
        const pending = deps
          .getProjection()
          .pendingPermissions.find((entry) => entry.callId === callId);
        if (pending) {
          // Mutate the live run settings object so later tools in this run
          // see the approval (runnerDeps holds the same reference).
          if (!lastConfig.settings.persistedApprovals.includes(pending.capability)) {
            lastConfig.settings.persistedApprovals = [
              ...lastConfig.settings.persistedApprovals,
              pending.capability,
            ];
          }
          await lastConfig.persistApproval?.(pending.capability);
        }
      }

      resolve(decision);
    },

    async retry() {
      const projection = deps.getProjection();
      if (!lastConfig) return;
      if (projection.status !== "failed" || !projection.failure?.recoverable) return;

      await runWithConfig({
        ...lastConfig,
        prompt: lastConfig.prompt,
        chatMessages: projection.chatMessages,
        isRetry: true,
      });
    },
  };
}
