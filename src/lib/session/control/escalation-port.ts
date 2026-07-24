import type { CapabilityRisk } from "@/lib/agent/capabilities/risk";
import { notifyIfUnfocused as defaultNotifyIfUnfocused } from "@/lib/native/notification";
import type { PermissionDecision } from "@/lib/session/events";

import type { LiveAttempt } from "./attempt-registry";
import type { OsLease } from "./os-lease";

/** Port outcome for one Capability call (maps to interaction.resolved permission decision). */
export type EscalationOutcome = "allow" | "deny";

export type EscalationRequest = {
  readonly callId: string;
  readonly attemptId: string;
  readonly capability: string;
  /** Human-facing label for notify (optional). */
  readonly label?: string;
  readonly input: unknown;
  readonly risk: CapabilityRisk;
};

/**
 * interactive — wait while UI is watching this Mandate; may omit timeout.
 * park — release OS lease, wait with timeout (unattended / unfocused); timeout → deny.
 */
export type EscalationPortMode = "interactive" | "park";

/** Fixed mode or resolve per escalate (ADR 0009 / focus-aware park). */
export type EscalationPortModeInput =
  | EscalationPortMode
  | ((request: EscalationRequest) => EscalationPortMode);

export type EscalationPort = {
  escalate: (request: EscalationRequest) => Promise<EscalationOutcome>;
  /** AttemptControl / UI resolve path. */
  resolve: (callId: string, outcome: EscalationOutcome) => void;
  /** Cancel / settle: deny every pending escalate. */
  denyAll: () => void;
};

export type CreateEscalationPortDeps = {
  mode?: EscalationPortModeInput;
  /** Park default 15m when mode resolves to park. Optional safety net for interactive. */
  timeoutMs?: number;
  osLease?: OsLease;
  notifyIfUnfocused?: (notification: { title: string; body: string }) => void;
};

/** Default park timeout when mode is park and timeoutMs omitted. */
export const DEFAULT_PARK_TIMEOUT_MS = 15 * 60 * 1000;

export function permissionDecisionToEscalation(decision: PermissionDecision): EscalationOutcome {
  return decision === "approved" ? "allow" : "deny";
}

export function escalationToPermissionDecision(outcome: EscalationOutcome): PermissionDecision {
  return outcome === "allow" ? "approved" : "denied";
}

/**
 * interactive when this Attempt's Mandate is UI-focused; otherwise park.
 * Used by AttemptHost default EscalationPort (OQ #5).
 */
export function resolveEscalationModeForWatch(input: {
  readonly requestAttemptId: string;
  readonly live: LiveAttempt | null;
  readonly focusedMandateId: string | null;
}): EscalationPortMode {
  const { live, focusedMandateId, requestAttemptId } = input;
  if (live && live.attemptId === requestAttemptId && focusedMandateId === live.mandateId) {
    return "interactive";
  }
  return "park";
}

function resolveMode(
  mode: EscalationPortModeInput | undefined,
  request: EscalationRequest,
): EscalationPortMode {
  if (mode === undefined) {
    return "interactive";
  }
  if (typeof mode === "function") {
    return mode(request);
  }
  return mode;
}

/**
 * EscalationPort: what “needs a person” means.
 * Policy never calls this; the Capability runner does after escalate.
 */
export function createEscalationPort(deps: CreateEscalationPortDeps = {}): EscalationPort {
  const notify = deps.notifyIfUnfocused ?? defaultNotifyIfUnfocused;

  const resolvers = new Map<string, (outcome: EscalationOutcome) => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearTimer(callId: string): void {
    const timer = timers.get(callId);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(callId);
    }
  }

  function settle(callId: string, outcome: EscalationOutcome): void {
    const resolve = resolvers.get(callId);
    if (!resolve) return;
    clearTimer(callId);
    resolvers.delete(callId);
    resolve(outcome);
  }

  return {
    escalate(request) {
      const mode = resolveMode(deps.mode, request);
      if (mode === "park") {
        deps.osLease?.release(request.attemptId);
      }

      notify({
        title: "Approval needed",
        body: `${request.label ?? request.capability} is waiting. Hop back in to approve or reject.`,
      });

      const timeoutMs = deps.timeoutMs ?? (mode === "park" ? DEFAULT_PARK_TIMEOUT_MS : undefined);

      return new Promise<EscalationOutcome>((resolve) => {
        resolvers.set(request.callId, resolve);

        if (timeoutMs !== null && timeoutMs !== undefined && timeoutMs > 0) {
          const timer = setTimeout(() => {
            timers.delete(request.callId);
            settle(request.callId, "deny");
          }, timeoutMs);
          timers.set(request.callId, timer);
        }
      });
    },

    resolve(callId, outcome) {
      settle(callId, outcome);
    },

    denyAll() {
      const pending = [...resolvers.keys()];
      for (const callId of pending) {
        settle(callId, "deny");
      }
    },
  };
}

/** Test helper: escalate resolves immediately. */
export function createAutoEscalationPort(outcome: EscalationOutcome): EscalationPort {
  return {
    escalate: async () => outcome,
    resolve: () => {},
    denyAll: () => {},
  };
}
