import { createContext, useContext } from "react";

import type { useAgentSession } from "@/features/control-center/useAgentSession";

export type AgentSessionValue = ReturnType<typeof useAgentSession>;

export const AgentSessionContext = createContext<AgentSessionValue | null>(null);

export function useAgentSessionContext(): AgentSessionValue {
  const value = useContext(AgentSessionContext);
  if (value === null) {
    throw new Error("useAgentSessionContext must be used within AgentSessionProvider");
  }
  return value;
}
