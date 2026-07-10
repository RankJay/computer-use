import type { AgentMode } from "@/lib/settings/types";

export function parseAgentMode(value: string): AgentMode {
  switch (value) {
    case "live":
    case "demo":
      return value;
    default:
      return "live";
  }
}
