import type { RuntimeEvent } from "@/lib/session/events";

import type { InvokeCapabilityResult } from "./types";

/**
 * Resume-from-cursor: if this callId already settled in the Attempt event log,
 * return the prior outcome and skip re-invoke (no re-click).
 */
export function lookupSettledCapability(
  events: readonly RuntimeEvent[],
  callId: string,
): InvokeCapabilityResult | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (!event) continue;

    if (event.type === "capability.completed" && event.callId === callId) {
      return { ok: true, output: event.output };
    }
    if (event.type === "capability.failed" && event.callId === callId) {
      return {
        ok: false,
        error: {
          code: event.error.code,
          message: event.error.message,
          details: event.error.details,
          cause: event.error.cause,
        },
      };
    }
    if (
      event.type === "interaction.resolved" &&
      event.callId === callId &&
      event.kind === "permission" &&
      event.permission.decision === "denied"
    ) {
      return { ok: false, denied: true };
    }
  }
  return null;
}
