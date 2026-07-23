import { modelTierOf } from "./classify";
import type { MeterStore } from "./meters/persistence";
import { utcDayKey } from "./period";
import { HOBBY_PLAN, METER_KEY_ATTEMPTS, METER_KEY_COMPUTER_USE } from "./plans";
import type { EntitlementCheck, EntitlementDecision, PlanDocument } from "./types";

export type EntitlementPolicy = {
  /**
   * Commercial gate. Evaluates plan + meters; commits meter increments on
   * `allow_and_meter`. Never talks to humans / OS permission UX.
   */
  authorize(check: EntitlementCheck): Promise<EntitlementDecision>;
};

export type EntitlementPolicyDeps = {
  getSubjectId: () => Promise<string>;
  /** Defaults to hobby for anonymous and signed-in. */
  getPlan?: () => Promise<PlanDocument>;
  meters: MeterStore;
  now?: () => Date;
};

async function meterDecision(
  meters: MeterStore,
  subjectId: string,
  meterKey: string,
  periodKey: string,
  amount: number,
  dailyLimit: number | null,
  feature: string,
  limitReason: string,
): Promise<EntitlementDecision> {
  if (dailyLimit !== null) {
    const current = await meters.get(subjectId, meterKey, periodKey);
    if (current + amount > dailyLimit) {
      return {
        outcome: "require_upgrade",
        reason: limitReason,
        feature,
      };
    }
  }
  const newValue = await meters.increment(subjectId, meterKey, periodKey, amount);
  return {
    outcome: "allow_and_meter",
    meterKey,
    amount,
    newValue,
  };
}

export function createEntitlementPolicy(deps: EntitlementPolicyDeps): EntitlementPolicy {
  const getPlan = deps.getPlan ?? (async () => HOBBY_PLAN);
  const now = deps.now ?? (() => new Date());

  return {
    async authorize(check) {
      const subjectId = await deps.getSubjectId();
      const plan = await getPlan();
      const periodKey = utcDayKey(now());

      switch (check.kind) {
        case "attempt_start":
          return meterDecision(
            deps.meters,
            subjectId,
            METER_KEY_ATTEMPTS,
            periodKey,
            1,
            plan.attemptsPerDay,
            "attempts",
            "Daily attempt limit reached on the hobby plan.",
          );

        case "model": {
          const tier = modelTierOf(check.modelId);
          if (!plan.allowedModelTiers.includes(tier)) {
            return {
              outcome: "require_upgrade",
              reason: `Model tier "${tier}" is not included on the ${plan.id} plan.`,
              feature: `model_tier:${tier}`,
            };
          }
          return { outcome: "allow" };
        }

        case "capability": {
          if (check.capabilityClass !== "computer_use") {
            return { outcome: "allow" };
          }
          if (!plan.computerUseAllowed) {
            return {
              outcome: "require_upgrade",
              reason: "Computer use is not included on this plan.",
              feature: "computer_use",
            };
          }
          return meterDecision(
            deps.meters,
            subjectId,
            METER_KEY_COMPUTER_USE,
            periodKey,
            1,
            plan.computerUseActionsPerDay,
            "computer_use",
            "Daily computer-use limit reached on the hobby plan.",
          );
        }

        default: {
          const _exhaustive: never = check;
          return _exhaustive;
        }
      }
    },
  };
}
