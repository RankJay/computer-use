import type { MandateLifecycleStatus, MandateSuccessCriteria } from "./types";

export const DEFAULT_SUCCESS_CRITERIA: MandateSuccessCriteria = {
  version: 1,
  kind: "attempt_completed",
};

export function parseSuccessCriteria(raw: unknown): MandateSuccessCriteria {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULT_SUCCESS_CRITERIA;
  }
  if (Reflect.get(raw, "version") !== 1) {
    return DEFAULT_SUCCESS_CRITERIA;
  }
  const kind = Reflect.get(raw, "kind");
  if (kind === "manual" || kind === "attempt_completed") {
    return { version: 1, kind };
  }
  return DEFAULT_SUCCESS_CRITERIA;
}

/**
 * Map Attempt settle → Mandate lifecycle under the Mandate's success criteria.
 * - attempt_completed: completed → done (default interactive)
 * - manual: completed → armed (Mandate stays open; Attempt history is the audit)
 */
export function nextMandateStatusAfterAttemptSettle(
  criteria: MandateSuccessCriteria,
  attemptStatus: "completed" | "failed" | "cancelled",
): MandateLifecycleStatus {
  switch (attemptStatus) {
    case "completed":
      return criteria.kind === "manual" ? "armed" : "done";
    case "failed":
      return "failed";
    case "cancelled":
      return "armed";
    default: {
      const _exhaustive: never = attemptStatus;
      return _exhaustive;
    }
  }
}
