import { notifyIfUnfocused as defaultNotifyIfUnfocused } from "@/lib/native/notification";

import type { OsLease } from "./os-lease";

/** Port outcome for one Capability call (maps to permission.resolved approved/denied). */
export type EscalationOutcome = "allow" | "deny";

export type EscalationRequest = {
  readonly callId: string;
  readonly attemptId: string;
  readonly capability: string;
  /** Human-facing label for notify (optional). */
  readonly label?: string;
  readonly input: unknown;
  readonly risk: "low" | "medium" | "high";
};

/**
 * interactive — wait while UI is alive (Phase 1 default); may omit timeout.
 * park — release OS lease, wait with timeout (unattended-ready); timeout → deny.
 */
export type EscalationPortMode = "interactive" | "park";

export type EscalationPort = {
  escalate: (request: EscalationRequest) => Promise<EscalationOutcome>;
  /** AttemptControl / UI resolve path. */
  resolve: (callId: string, outcome: EscalationOutcome) => void;
  /** Cancel / settle: deny every pending escalate. */
  denyAll: () => void;
};

export type CreateEscalationPortDeps = {
  mode?: EscalationPortMode;
  /** Required for park (default 15m). Optional safety net for interactive. */
  timeoutMs?: number;
  osLease?: OsLease;
  notifyIfUnfocused?: (notification: { title: string; body: string }) => void;
};

/** Default park timeout when mode is park and timeoutMs omitted. */
export const DEFAULT_PARK_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * EscalationPort: what “needs a person” means.
 * Policy never calls this; the Capability runner does after escalate.
 */
export function createEscalationPort(deps: CreateEscalationPortDeps = {}): EscalationPort {
  const mode = deps.mode ?? "interactive";
  const notify = deps.notifyIfUnfocused ?? defaultNotifyIfUnfocused;
  const timeoutMs = deps.timeoutMs ?? (mode === "park" ? DEFAULT_PARK_TIMEOUT_MS : undefined);

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
      if (mode === "park") {
        deps.osLease?.release(request.attemptId);
      }

      notify({
        title: "Approval needed",
        body: `${request.label ?? request.capability} is waiting. Hop back in to approve or reject.`,
      });

      return new Promise<EscalationOutcome>((resolve) => {
        resolvers.set(request.callId, resolve);

        if (timeoutMs != null && timeoutMs > 0) {
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
