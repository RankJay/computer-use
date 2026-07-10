import type { PendingPermission } from "@/lib/session/projection";

export type PermissionActionHandlers = {
  readonly pendingPermission: PendingPermission | null;
  readonly onResolvePermission?: (decision: "approved" | "denied", persist?: boolean) => void;
};

export function canResolveToolPermission(
  partToolCallId: string | undefined,
  handlers: PermissionActionHandlers,
): boolean {
  if (!partToolCallId || !handlers.pendingPermission || !handlers.onResolvePermission) {
    return false;
  }

  return handlers.pendingPermission.callId === partToolCallId;
}
