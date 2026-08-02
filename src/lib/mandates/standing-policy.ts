import type { PermissionPolicyDecision, StandingPolicyDocument } from "./types";

/**
 * Overlay standing Mandate policy on a base PermissionPolicy decision.
 * Empty / null document is a no-op (Phase 1 settings behavior unchanged).
 * Deny beats allow when the same capability is in both lists.
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
