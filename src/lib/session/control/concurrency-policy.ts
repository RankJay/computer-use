import type { LiveAttempt } from "./attempt-registry";

/**
 * Swappable conflict policy consulted by Trigger wake evaluation (ADR 0005).
 * Interactive cancel-previous for Chat starts is still enforced in RunController
 * until AttemptControl wires this policy into the start path.
 */
export type ConcurrencyConflictDecision = "cancel_previous" | "reject" | "queue";

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

/**
 * Queue buffer is not implemented. Alias of reject so Callers cannot mistake
 * `action: "queue"` for a durable wake queue. Reintroduce `"queue"` when buffered.
 */
export const queueIfBusyConcurrencyPolicy: ConcurrencyPolicy = rejectIfBusyConcurrencyPolicy;
