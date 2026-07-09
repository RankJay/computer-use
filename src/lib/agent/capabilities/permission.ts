import type { AppSettings } from "@/lib/settings/types";

import type { CapabilityDefinition, CapabilityRisk } from "./types";

export function needsPermission(
  definition: Pick<CapabilityDefinition, "name" | "risk">,
  settings: AppSettings,
): boolean {
  if (settings.persistedApprovals.includes(definition.name)) {
    return false;
  }

  if (definition.risk === "low") {
    return false;
  }

  if (settings.permissionMode === "risky") {
    return definition.risk === "high";
  }

  if (settings.permissionMode === "every-meaningful") {
    return definition.risk === "medium" || definition.risk === "high";
  }

  return true;
}

export function permissionRiskForCapability(risk: CapabilityRisk): CapabilityRisk {
  return risk;
}
