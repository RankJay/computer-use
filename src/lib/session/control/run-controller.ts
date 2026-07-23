import type { UIMessage } from "ai";

import type { EntitlementPolicy } from "@/lib/entitlements";
import type { AppSecrets, AppSettings } from "@/lib/settings/types";

import type { RuntimeEventPayload } from "../events";
import { foldExecutionContext } from "../execution-context";
import type { SessionProjection } from "../projection";
import {
  createEscalationPort,
  type EscalationPort,
  type EscalationPortMode,
} from "./escalation-port";
import type { OsLease } from "./os-lease";

export type PermissionDecision = "approved" | "denied";

/** @deprecated Prefer EscalationPort — kept for older test helpers. */
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
  /** EscalationPort for Capability gate (interactive or park). */
  escalationPort: EscalationPort;
  /** Injected by AttemptHost — commercial gate for Capability invoke. */
  entitlements?: EntitlementPolicy;
  /** Injected by AttemptHost — desktop lock for UI-automation Capabilities. */
  osLease?: OsLease;
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
  /** Released when the Attempt settles or is cancelled. */
  osLease?: OsLease;
  /** Injected EscalationPort (tests). Default: interactive wait. */
  escalationPort?: EscalationPort;
  escalationMode?: EscalationPortMode;
  escalationTimeoutMs?: number;
};

export function createRunController(deps: RunControllerDeps): RunController {
  let activeAbort: AbortController | null = null;
  let activeTaskId: string | null = null;
  let lastConfig: RunConfig | null = null;

  const escalationPort =
    deps.escalationPort ??
    createEscalationPort({
      mode: deps.escalationMode ?? "interactive",
      timeoutMs: deps.escalationTimeoutMs,
      osLease: deps.osLease,
    });

  function clearActiveRun(): void {
    escalationPort.denyAll();
    if (activeTaskId) {
      deps.osLease?.release(activeTaskId);
    }
    activeAbort = null;
    activeTaskId = null;
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
        escalationPort,
        osLease: deps.osLease,
      });
    } finally {
      clearActiveRun();
    }
  }

  async function cancel(): Promise<void> {
    if (!activeAbort || !activeTaskId) return;

    escalationPort.denyAll();
    deps.osLease?.release(activeTaskId);
    activeAbort.abort();
    deps.append({ type: "task.status_changed", status: "cancelled" });
    deps.append({ type: "task.completed", finishReason: "cancelled" });
  }

  return {
    start: (config) => runWithConfig(config),

    cancel,

    async resolvePermission(callId, decision, persist) {
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

      escalationPort.resolve(callId, decision === "approved" ? "allow" : "deny");
    },

    async retry() {
      const projection = deps.getProjection();
      if (!lastConfig) return;
      if (projection.status !== "failed" || !projection.failure?.recoverable) return;

      const execution = foldExecutionContext(projection);
      await runWithConfig({
        ...lastConfig,
        prompt: lastConfig.prompt,
        chatMessages: execution.messages,
        isRetry: true,
      });
    },
  };
}
