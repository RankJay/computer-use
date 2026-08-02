import { applyStandingPolicyOverlay } from "@/lib/mandates/standing-policy";
import type { PermissionPolicyDecision, StandingPolicyDocument } from "@/lib/mandates/types";
import type { AppSettings } from "@/lib/settings/types";

import { needsPermission } from "./permission";
import type { CapabilityRisk } from "./types";

export type { PermissionPolicyDecision };

export type PermissionPolicyInput = {
  readonly name: string;
  readonly risk: CapabilityRisk;
  readonly destructive?: boolean;
  readonly settings: AppSettings;
  /** Mandate standing policy overlay (empty ≡ settings-only). */
  readonly standingPolicy?: StandingPolicyDocument | null;
};

export type PermissionPolicy = {
  resolve: (input: PermissionPolicyInput) => PermissionPolicyDecision;
};

/**
 * Phase 1 settings grants/mode → allow | escalate, then standing overlay.
 * Overlay deny is the first real use of `deny` at this seam.
 */
export function createSettingsPermissionPolicy(): PermissionPolicy {
  return {
    resolve(input) {
      const base: PermissionPolicyDecision = needsPermission(
        {
          name: input.name,
          risk: input.risk,
          destructive: input.destructive,
        },
        input.settings,
      )
        ? "escalate"
        : "allow";

      return applyStandingPolicyOverlay(base, input.name, input.standingPolicy);
    },
  };
}

export const defaultPermissionPolicy: PermissionPolicy = createSettingsPermissionPolicy();
