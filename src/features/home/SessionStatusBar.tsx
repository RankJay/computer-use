import type { ReactElement } from "react";

import { uiToolLabel } from "@/lib/agent/capabilities";
import type { PendingPermission, SessionFailure } from "@/lib/session";

export type SessionStatusBarProps = {
  readonly pendingPermissions: readonly PendingPermission[];
  readonly canResolvePermission: boolean;
  readonly failure: SessionFailure | null;
};

/** Compact multi-pending permission summary + failure line above the composer. */
export function SessionStatusBar({
  pendingPermissions,
  canResolvePermission,
  failure,
}: SessionStatusBarProps): ReactElement | null {
  const showBanner = canResolvePermission && pendingPermissions.length > 1;
  const showFailure = failure !== null;

  if (!showBanner && !showFailure) {
    return null;
  }

  const capabilityNames = [
    ...new Set(pendingPermissions.map((entry) => uiToolLabel(entry.capability))),
  ];

  return (
    <div className="flex flex-col gap-1.5 pb-0 pt-1">
      {showBanner ? (
        <output
          className="block rounded-xl ring-1 ring-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          data-testid="multi-pending-banner"
        >
          <span className="font-medium text-foreground">
            {pendingPermissions.length} tools waiting for approval
          </span>
          <span className="mx-1.5 text-border">·</span>
          <span>{capabilityNames.join(", ")}</span>
        </output>
      ) : null}
      {showFailure ? (
        <div
          className="rounded-xl ring-1 ring-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="alert"
          data-testid="session-failure-line"
        >
          <span className="font-medium">{failure.code}</span>
          <span className="mx-1.5 opacity-50">·</span>
          <span>{failure.message}</span>
        </div>
      ) : null}
    </div>
  );
}
