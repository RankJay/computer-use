import type { RunStatus } from "../events";
import type { SessionProjection } from "../projection";

export type SessionControls = {
  canSubmit: boolean;
  canCancel: boolean;
  cancelVisible: boolean;
  inputDisabled: boolean;
  canRetry: boolean;
  canResolvePermission: boolean;
};

function isActiveStatus(status: RunStatus): boolean {
  return status === "running" || status === "streaming" || status === "waiting_permission";
}

/** Derive presentation/control flags from projection — never store these on SessionProjection. */
export function deriveSessionControls(projection: SessionProjection): SessionControls {
  const active = isActiveStatus(projection.status);
  const hasPendingPermissions = projection.pendingPermissions.length > 0;

  return {
    canSubmit: !active,
    canCancel: active,
    cancelVisible: active,
    inputDisabled: active,
    canRetry: projection.status === "failed" && projection.failure?.recoverable === true,
    canResolvePermission: hasPendingPermissions,
  };
}
