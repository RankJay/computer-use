import type { Mandate, MandateLifecycleStatus } from "@/lib/mandates";
import type { LiveAttempt } from "@/lib/session/control/attempt-registry";
import type {
  ConcurrencyConflictDecision,
  ConcurrencyPolicy,
} from "@/lib/session/control/concurrency-policy";
import { rejectIfBusyConcurrencyPolicy } from "@/lib/session/control/concurrency-policy";

export type TriggerWakeAction = "start" | "suppress" | "queue";

export type TriggerWakeReason =
  | "ok"
  | "mandate_running"
  | "waiting_interaction"
  | "concurrency_reject"
  | "concurrency_queue";

export type TriggerWakeDecision = {
  readonly action: TriggerWakeAction;
  readonly reason: TriggerWakeReason;
  readonly concurrency?: ConcurrencyConflictDecision;
};

export type EvaluateTriggerWakeInput = {
  readonly mandate: Mandate;
  readonly live: LiveAttempt | null;
  /** Default: rejectIfBusy (triggers must not cancel interactive). */
  readonly concurrencyPolicy?: ConcurrencyPolicy;
};

const BLOCKING_STATUSES: ReadonlySet<MandateLifecycleStatus> = new Set([
  "running",
  "waiting_interaction",
]);

/**
 * Trigger plane gate: read Mandate lifecycle + live Attempt before AttemptControl.start.
 * Default: suppress when already running / waiting_interaction.
 */
export function evaluateTriggerWake(input: EvaluateTriggerWakeInput): TriggerWakeDecision {
  const { mandate, live } = input;
  const policy = input.concurrencyPolicy ?? rejectIfBusyConcurrencyPolicy;

  if (BLOCKING_STATUSES.has(mandate.status)) {
    return {
      action: "suppress",
      reason: mandate.status === "waiting_interaction" ? "waiting_interaction" : "mandate_running",
    };
  }

  if (live && live.mandateId === mandate.id) {
    return { action: "suppress", reason: "mandate_running" };
  }

  const concurrency = policy.onConflict({
    live,
    incomingMandateId: mandate.id,
    fromTrigger: true,
  });

  switch (concurrency) {
    case "cancel_previous":
      return { action: "start", reason: "ok", concurrency };
    case "reject":
      return { action: "suppress", reason: "concurrency_reject", concurrency };
    case "queue":
      return { action: "queue", reason: "concurrency_queue", concurrency };
    default: {
      const _exhaustive: never = concurrency;
      return _exhaustive;
    }
  }
}

/** Shape a Client may append / log when suppressing a wake. */
export function triggerSuppressedFact(input: {
  mandateId: string;
  reason: TriggerWakeReason;
  triggerId?: string;
}): {
  type: "trigger.suppressed";
  mandateId: string;
  reason: TriggerWakeReason;
  triggerId?: string;
} {
  return {
    type: "trigger.suppressed",
    mandateId: input.mandateId,
    reason: input.reason,
    ...(input.triggerId ? { triggerId: input.triggerId } : {}),
  };
}
