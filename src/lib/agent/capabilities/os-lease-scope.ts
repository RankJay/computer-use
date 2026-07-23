import { capabilityClassOf } from "@/lib/entitlements";
import type { OsLeaseScope } from "@/lib/session/control/os-lease";

/**
 * Which Capabilities require an OS lease before native invoke.
 * `none` = fs/shell/clipboard/read-only window list — may run without the desktop lock.
 */
export function osLeaseScopeOf(capability: string): OsLeaseScope {
  if (capabilityClassOf(capability) === "computer_use") {
    return "desktop";
  }

  // Focus-steal / geometry mutators (not in coarse computer_use entitlement class).
  switch (capability) {
    case "window_focus":
    case "window_move":
    case "window_resize":
    case "window_state":
      return "desktop";
    default:
      return "none";
  }
}
