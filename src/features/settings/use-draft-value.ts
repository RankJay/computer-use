import { useState } from "react";

export function useDraftValue<T>(committed: T): [T, (next: T) => void] {
  const [draft, setDraft] = useState(committed);
  const [prevCommitted, setPrevCommitted] = useState(committed);

  if (committed !== prevCommitted) {
    setPrevCommitted(committed);
    setDraft(committed);
  }

  return [draft, setDraft];
}
