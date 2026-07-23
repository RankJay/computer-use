import type { AppSettings } from "@/lib/settings/types";

import { needsPermission } from "./permission";
import type { CapabilityRisk } from "./types";

/** Rules-only result. Never talks to humans or OS notifications. */
export type PermissionPolicyDecision = "allow" | "deny" | "escalate";

export type PermissionPolicyInput = {
  readonly name: string;
  readonly risk: CapabilityRisk;
  readonly destructive?: boolean;
  readonly settings: AppSettings;
};

export type PermissionPolicy = {
  resolve: (input: PermissionPolicyInput) => PermissionPolicyDecision;
};

/**
 * Phase 1 settings grants/mode → allow | escalate.
 * `deny` reserved for standing deny / Phase 2 overlay.
 */
export function createSettingsPermissionPolicy(): PermissionPolicy {
  return {
    resolve(input) {
      if (
        needsPermission(
          {
            name: input.name,
            risk: input.risk,
            destructive: input.destructive,
          },
          input.settings,
        )
      ) {
        return "escalate";
      }
      return "allow";
    },
  };
}

export const defaultPermissionPolicy: PermissionPolicy = createSettingsPermissionPolicy();
