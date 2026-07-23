import { createContext, useContext } from "react";

import type { BatchedAttemptStore } from "./attempt-host";

export const AttemptHostContext = createContext<BatchedAttemptStore | null>(null);

export function useAttemptHost(): BatchedAttemptStore {
  const host = useContext(AttemptHostContext);
  if (!host) {
    throw new Error("useAttemptHost requires AttemptHostProvider");
  }
  return host;
}
