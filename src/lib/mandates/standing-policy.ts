import type { PermissionPolicyDecision } from "@/lib/agent/capabilities/permission-policy";

import type { StandingPolicyDocument } from "./types";

/**
 * Overlay standing Mandate policy on a base PermissionPolicy decision.
 * Empty / null document is a no-op (Phase 1 settings behavior unchanged).
 */
export function applyStandingPolicyOverlay(
  base: PermissionPolicyDecision,
  capability: string,
  standingPolicy: StandingPolicyDocument | null | undefined,
): PermissionPolicyDecision {
  if (!standingPolicy) {
    return base;
  }

  if (standingPolicy.denyCapabilities?.includes(capability)) {
    return "deny";
  }

  if (standingPolicy.allowCapabilities?.includes(capability)) {
    return "allow";
  }

  return base;
}
