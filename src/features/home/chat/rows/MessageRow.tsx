import { memo, type ReactElement } from "react";

import { Message, MessageContent } from "@/components/ui/message";
import type { PendingPermission } from "@/lib/session";
import type { PermissionMode } from "@/lib/settings/types";
import { cn } from "@/lib/utils";

import { PartRenderer } from "../parts/PartRenderer";
import type { AgentMessageRowData } from "../types";

export type MessageRowProps = {
  readonly row: AgentMessageRowData;
  readonly isStreaming?: boolean;
  readonly pendingPermissions?: readonly PendingPermission[];
  readonly permissionMode?: PermissionMode;
  readonly onResolvePermission?: (
    callId: string,
    decision: "approved" | "denied",
    persist?: boolean,
  ) => void;
};

export const MessageRow = memo(function MessageRow({
  row,
  isStreaming = false,
  pendingPermissions,
  permissionMode,
  onResolvePermission,
}: MessageRowProps): ReactElement {
  const align = row.message.role === "user" ? "end" : "start";

  return (
    <Message align={align} className={cn(row.message.role === "user" ? "" : "px-2")}>
      <MessageContent className="gap-3">
        <PartRenderer
          message={row.message}
          isStreaming={isStreaming}
          pendingPermissions={pendingPermissions}
          permissionMode={permissionMode}
          onResolvePermission={onResolvePermission}
        />
      </MessageContent>
    </Message>
  );
});
