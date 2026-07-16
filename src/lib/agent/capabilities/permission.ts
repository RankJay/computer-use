import type { AppSettings } from "@/lib/settings/types";

import type { CapabilityDefinition, CapabilityRisk } from "./types";

export function needsPermission(
  definition: Pick<CapabilityDefinition, "name" | "risk" | "destructive">,
  settings: AppSettings,
): boolean {
  if (settings.persistedApprovals.includes(definition.name)) {
    return false;
  }

  if (definition.risk === "low") {
    return false;
  }

  switch (settings.permissionMode) {
    case "risky":
      return definition.risk === "high";
    case "every-meaningful":
      return definition.risk === "medium" || definition.risk === "high";
    case "destructive-only":
      return definition.destructive === true;
    case "once-per-class":
      return true;
    default: {
      const _exhaustive: never = settings.permissionMode;
      return _exhaustive;
    }
  }
}

export function permissionRiskForCapability(risk: CapabilityRisk): CapabilityRisk {
  return risk;
}
