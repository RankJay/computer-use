import type { LiveAttempt } from "./attempt-registry";

/**
 * Swappable conflict policy on AttemptRegistry (ADR 0005).
 * AttemptControl.start/retry consult this; RunController only yields the engine slot
 * when a start is allowed (cancel-previous actuator, not the decision).
 */
export type ConcurrencyConflictDecision = "cancel_previous" | "reject";

export type ConcurrencyConflictContext = {
  readonly live: LiveAttempt | null;
  readonly incomingMandateId: string;
  /** true when wake came from a Trigger Client (not chat). */
  readonly fromTrigger?: boolean;
};

export type ConcurrencyPolicy = {
  onConflict: (ctx: ConcurrencyConflictContext) => ConcurrencyConflictDecision;
};

/** Phase 1 interactive default. */
export const cancelPreviousConcurrencyPolicy: ConcurrencyPolicy = {
  onConflict: () => "cancel_previous",
};

/** Prefer for unattended wakes: never cancel a live Attempt. */
export const rejectIfBusyConcurrencyPolicy: ConcurrencyPolicy = {
  onConflict: (ctx) => (ctx.live ? "reject" : "cancel_previous"),
};
