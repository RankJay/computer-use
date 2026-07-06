import type { ReactElement } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { PendingPermission } from "@/lib/session/projection";

export type PermissionPromptProps = {
  readonly pending: PendingPermission;
  readonly showPersistOption: boolean;
  readonly onApprove: (persist?: boolean) => void;
  readonly onDeny: () => void;
};

export function PermissionPrompt({
  pending,
  showPersistOption,
  onApprove,
  onDeny,
}: PermissionPromptProps): ReactElement {
  const [persist, setPersist] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[#363636] bg-[#161616] p-3 text-sm text-[#cdcdcd]">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-white">Approve tool execution?</p>
        <p className="text-xs text-[#767676]">
          <span className="font-mono text-[#cdcdcd]">{pending.capability}</span>
          {" · "}
          {pending.risk} risk
        </p>
      </div>

      {showPersistOption ? (
        <label className="flex items-center gap-2 text-xs text-[#767676]">
          <input
            type="checkbox"
            checked={persist}
            onChange={(event) => setPersist(event.target.checked)}
            className="size-3.5 rounded border-[#363636] bg-[#0e0e0e]"
          />
          Always allow this tool without asking
        </label>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDeny}>
          Deny
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onApprove(showPersistOption ? persist : undefined)}
        >
          Approve
        </Button>
      </div>
    </div>
  );
}
