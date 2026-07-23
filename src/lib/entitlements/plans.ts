import type { PlanDocument } from "./types";

/**
 * Hobby (free) plan — anonymous and signed-in both resolve here (v0).
 * Generous ceilings for dogfood; tests inject tighter PlanDocuments.
 */
export const HOBBY_PLAN: PlanDocument = {
  id: "hobby",
  allowedModelTiers: ["standard", "premium"],
  computerUseAllowed: true,
  attemptsPerDay: null,
  computerUseActionsPerDay: null,
};

export const METER_KEY_ATTEMPTS = "attempts";
export const METER_KEY_COMPUTER_USE = "computer_use_actions";
