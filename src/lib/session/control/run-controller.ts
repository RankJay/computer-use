import type { UIMessage } from "ai";

import type { StandingPolicyDocument } from "@/lib/mandates/types";
import type { AppSecrets, AppSettings } from "@/lib/settings/types";

import type { RuntimeEventPayload, PermissionDecision } from "../events";
import { foldModelContext } from "../model-context";
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

export type ResolvePermissionInteraction = {
  callId: string;
  kind: "permission";
  decision: PermissionDecision;
  persist?: boolean;
};

/** Widen this union when clarification / custom UI kinds land. */
export type ResolveInteraction = ResolvePermissionInteraction;

export type RunController = {
  start: (config: RunConfig) => Promise<void>;
  cancel: () => Promise<void>;
  resolve: (interaction: ResolveInteraction) => Promise<void>;
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
    // Slot yield only — concurrency *decision* lives on AttemptRegistry policy
    // (AttemptControl). This path runs after a start was already allowed.
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

    async resolve(interaction) {
      switch (interaction.kind) {
        case "permission": {
          if (interaction.decision === "approved" && interaction.persist && lastConfig) {
            const pending = deps
              .getProjection()
              .pendingInteractions.find((entry) => entry.callId === interaction.callId);
            if (pending?.kind === "permission") {
              const capability = pending.permission.capability;
              // Mutate the live run settings object so later tools in this run
              // see the approval (runnerDeps holds the same reference).
              if (!lastConfig.settings.persistedApprovals.includes(capability)) {
                lastConfig.settings.persistedApprovals = [
                  ...lastConfig.settings.persistedApprovals,
                  capability,
                ];
              }
              await lastConfig.persistApproval?.(capability);
            }
          }

          escalationPort.resolve(
            interaction.callId,
            permissionDecisionToEscalation(interaction.decision),
          );
          return;
        }
      }
    },

    async retry() {
      const projection = deps.getProjection();
      if (!lastConfig) return;
      if (projection.status !== "failed" || !projection.failure?.recoverable) return;

      const execution = foldModelContext(projection);
      await runWithConfig({
        ...lastConfig,
        prompt: lastConfig.prompt,
        chatMessages: execution.messages,
        isRetry: true,
      });
    },
  };
}
