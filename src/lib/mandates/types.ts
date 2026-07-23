export type MandateKind = "interactive";

/**
 * Mandate lifecycle (store). Distinct from Attempt RunStatus.
 * v0 interactive starts as `armed`; AttemptControl sets `running` on start.
 */
export type MandateLifecycleStatus =
  | "armed"
  | "running"
  | "paused"
  | "waiting_interaction"
  | "done"
  | "failed";

/**
 * Versioned standing grants/ceilings on a Mandate (Phase 2 product fills this in).
 * Empty / absent ≡ settings-only PermissionPolicy (today).
 */
export type StandingPolicyDocument = {
  readonly version: 1;
  /** Pre-approved capability names → allow (no escalate). */
  readonly allowCapabilities?: readonly string[];
  /** Standing deny for capability names. */
  readonly denyCapabilities?: readonly string[];
};

/**
 * When an Attempt settle may close the Mandate.
 * - attempt_completed: completed Attempt → Mandate `done` (default)
 * - manual: completed Attempt → Mandate stays `armed` (operator closes later)
 */
export type MandateSuccessCriteria =
  | { readonly version: 1; readonly kind: "attempt_completed" }
  | { readonly version: 1; readonly kind: "manual" };

/** Durable intent the runtime may pursue. */
export type Mandate = {
  id: string;
  createdAt: number;
  kind: MandateKind;
  status: MandateLifecycleStatus;
  /** Reserved for sub-agent trees (ops-contract §6). */
  parentMandateId: string | null;
  standingPolicy: StandingPolicyDocument | null;
  successCriteria: MandateSuccessCriteria;
};
