import type { LiveAttempt } from "./attempt-registry";

/**
 * Swappable conflict policy on AttemptRegistry (ADR 0005).
 * Phase 1 default = cancel_previous (still enforced in RunController).
 * Phase 2+ may reject/queue so unattended work does not kill interactive.
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

/** Named queue seam — v0 still rejects (queue buffer not built). */
export const queueIfBusyConcurrencyPolicy: ConcurrencyPolicy = {
  onConflict: (ctx) => (ctx.live ? "queue" : "cancel_previous"),
};
