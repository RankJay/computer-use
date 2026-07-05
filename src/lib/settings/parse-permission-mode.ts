import type { PermissionMode } from "@/lib/settings/types";

export function parsePermissionMode(value: string): PermissionMode {
  switch (value) {
    case "risky":
    case "every-meaningful":
    case "once-per-class":
      return value;
    default:
      return "risky";
  }
}
