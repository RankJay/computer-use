/** Coarse commercial class for Capability invoke (v0). */
export type EntitlementCapabilityClass = "computer_use" | "other";

/** Model packaging bucket (v0). Not the same as provider id. */
export type ModelTier = "standard" | "premium";

export type EntitlementCheck =
  | { readonly kind: "attempt_start" }
  | { readonly kind: "model"; readonly modelId: string }
  | {
      readonly kind: "capability";
      readonly capability: string;
      readonly capabilityClass: EntitlementCapabilityClass;
    };

export type EntitlementDecision =
  | { readonly outcome: "allow" }
  | { readonly outcome: "deny"; readonly reason: string }
  | {
      readonly outcome: "require_upgrade";
      readonly reason: string;
      readonly feature: string;
    }
  | {
      readonly outcome: "allow_and_meter";
      readonly meterKey: string;
      readonly amount: number;
      readonly newValue: number;
    };

/**
 * Plan document — data, not SKU hardcoding in the runner.
 * `dailyLimit: null` = meter for audit/product later, no ceiling.
 */
export type PlanDocument = {
  readonly id: string;
  /** Tiers the plan may use. */
  readonly allowedModelTiers: readonly ModelTier[];
  readonly computerUseAllowed: boolean;
  /** Daily Attempt starts. null = unlimited. */
  readonly attemptsPerDay: number | null;
  /** Daily computer-use Capability invokes. null = unlimited. */
  readonly computerUseActionsPerDay: number | null;
};

export type EntitlementSubject = {
  readonly subjectId: string;
};
