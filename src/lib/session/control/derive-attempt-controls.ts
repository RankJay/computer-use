import type { MandateProjection } from "../projection";
import { isLiveRun } from "../run-status";

export type AttemptControls = {
  canSubmit: boolean;
  canCancel: boolean;
  cancelVisible: boolean;
  inputDisabled: boolean;
  canRetry: boolean;
  canResolve: boolean;
};

/** Derive presentation/control flags from projection — never store these on MandateProjection. */
export function deriveAttemptControls(projection: MandateProjection): AttemptControls {
  const active = isLiveRun(projection.status);
  const hasPendingInteractions = projection.pendingInteractions.length > 0;

  return {
    canSubmit: !active,
    canCancel: active,
    cancelVisible: active,
    inputDisabled: active,
    canRetry: projection.status === "failed" && projection.failure?.recoverable === true,
    canResolve: hasPendingInteractions,
  };
}
