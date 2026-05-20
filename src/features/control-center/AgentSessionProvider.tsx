import type { ReactNode } from "react";

import { AgentSessionContext } from "@/features/control-center/AgentSessionContext";
import { useAgentSession } from "@/features/control-center/useAgentSession";

export function AgentSessionProvider(props: { readonly children: ReactNode }) {
  const agent = useAgentSession();
  return (
    <AgentSessionContext.Provider value={agent}>{props.children}</AgentSessionContext.Provider>
  );
}
