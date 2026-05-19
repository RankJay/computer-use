import { createContext, useContext, type ReactNode } from "react";

import { useAgentSession } from "@/features/control-center/useAgentSession";

type AgentSessionValue = ReturnType<typeof useAgentSession>;

const AgentSessionContext = createContext<AgentSessionValue | null>(null);

export function AgentSessionProvider(props: { readonly children: ReactNode }) {
  const agent = useAgentSession();
  return (
    <AgentSessionContext.Provider value={agent}>{props.children}</AgentSessionContext.Provider>
  );
}

export function useAgentSessionContext(): AgentSessionValue {
  const value = useContext(AgentSessionContext);
  if (value === null) {
    throw new Error("useAgentSessionContext must be used within AgentSessionProvider");
  }
  return value;
}
