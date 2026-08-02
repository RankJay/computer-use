import type { EntitlementPolicy } from "@/lib/entitlements";

import type { RuntimeEventPayload, PermissionDecision, RuntimeEvent } from "../events";
import { foldModelContext } from "../model-context";
import type { MandateProjection } from "../projection";
import type { LiveRunContext, RunConfig } from "../run-execution-context";
import {
  createEscalationPort,
  permissionDecisionToEscalation,
  type EscalationPort,
  type EscalationPortModeInput,
} from "./escalation-port";
import type { OsLease } from "./os-lease";

export type { PermissionDecision, RunConfig };

/** Producer seam: opaque LiveRunContext from RunController. */
export type ProduceRun = (ctx: LiveRunContext) => Promise<void>;

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
  beginAttempt: (attemptId: string) => void;
  clearAttempt: () => void;
  getProjection: () => MandateProjection;
  produceRun: ProduceRun;
  /** Fires once the Attempt is in-flight (after beginAttempt), before produceRun settles. */
  onAttemptStarted?: (attemptId: string) => void;
  /** Released when the Attempt settles or is cancelled. */
  osLease?: OsLease;
  /** Injected EscalationPort (tests). Default: interactive wait. */
  escalationPort?: EscalationPort;
  /** Used when escalationPort omitted — fixed or per-request resolver. */
  escalationMode?: EscalationPortModeInput;
  escalationTimeoutMs?: number;
  /** Commercial gate — injected from Host (not via produceRun wrapper). */
  entitlements?: EntitlementPolicy;
  /** Live event log for resume-from-cursor / geometry — from Host/engine. */
  getEventLog?: () => readonly RuntimeEvent[];
};

export function createRunController(deps: RunControllerDeps): RunController {
  let activeAbort: AbortController | null = null;
  let activeAttemptId: string | null = null;
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
    if (activeAttemptId) {
      deps.osLease?.release(activeAttemptId);
    }
    activeAbort = null;
    activeAttemptId = null;
    deps.clearAttempt();
  }

  async function runWithConfig(config: RunConfig): Promise<void> {
    // Slot yield only — concurrency *decision* lives on AttemptRegistry policy
    // (AttemptControl). This path runs after a start was already allowed.
    if (activeAbort) {
      await cancel();
    }

    const attemptId = crypto.randomUUID();
    activeAttemptId = attemptId;
    lastConfig = config;
    activeAbort = new AbortController();
    deps.beginAttempt(attemptId);
    deps.onAttemptStarted?.(attemptId);

    const live: LiveRunContext = {
      config,
      attemptId,
      signal: activeAbort.signal,
      append: deps.append,
      escalationPort,
      osLease: deps.osLease,
      entitlements: deps.entitlements,
      getEventLog: deps.getEventLog,
    };

    try {
      await deps.produceRun(live);
    } finally {
      clearActiveRun();
    }
  }

  async function cancel(): Promise<void> {
    if (!activeAbort || !activeAttemptId) return;

    escalationPort.denyAll();
    deps.osLease?.release(activeAttemptId);
    activeAbort.abort();
    deps.append({ type: "attempt.status_changed", status: "cancelled" });
    deps.append({ type: "attempt.completed", finishReason: "cancelled" });
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
