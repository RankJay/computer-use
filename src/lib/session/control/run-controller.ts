import type { UIMessage } from "ai";

import type { StandingPolicyDocument } from "@/lib/mandates/types";
import type { AppSecrets, AppSettings } from "@/lib/settings/types";

import type { RuntimeEventPayload, PermissionDecision } from "../events";
import { foldExecutionContext } from "../execution-context";
import type { MandateProjection } from "../projection";
import type { RunExecutionContext } from "../run-execution-context";
import {
  createEscalationPort,
  permissionDecisionToEscalation,
  type EscalationPort,
  type EscalationPortMode,
} from "./escalation-port";
import type { OsLease } from "./os-lease";

export type { PermissionDecision };

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
  /** Mandate standing policy for Capability PermissionPolicy overlay. */
  standingPolicy?: StandingPolicyDocument | null;
};

/** Producer seam: shared gates + packed RunConfig (settings/workspace via config). */
export type ProduceRunContext = Pick<
  RunExecutionContext,
  | "taskId"
  | "append"
  | "escalationPort"
  | "entitlements"
  | "osLease"
  | "standingPolicy"
  | "getEventLog"
> & {
  config: RunConfig;
  signal: AbortSignal;
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
  getProjection: () => MandateProjection;
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
        standingPolicy: config.standingPolicy,
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

      escalationPort.resolve(callId, permissionDecisionToEscalation(decision));
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
