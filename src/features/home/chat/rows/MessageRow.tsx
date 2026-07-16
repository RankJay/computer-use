import { memo, useCallback, type ReactElement } from "react";

import { Message, MessageContent } from "@/components/ui/message";
import type { PendingPermission } from "@/lib/session";
import { textPartsMarkdown } from "@/lib/session";
import type { PermissionMode } from "@/lib/settings/types";
import { cn } from "@/lib/utils";

import { PartRenderer } from "../parts/PartRenderer";
import type { AgentMessageRowData } from "../types";
import { AssistantMessageActions } from "./AssistantMessageActions";

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
  readonly canRetryMessage?: boolean;
  readonly onRetryMessage?: (messageId: string) => void;
};

export const MessageRow = memo(function MessageRow({
  row,
  isStreaming = false,
  pendingPermissions,
  permissionMode,
  onResolvePermission,
  canRetryMessage = false,
  onRetryMessage,
}: MessageRowProps): ReactElement {
  const align = row.message.role === "user" ? "end" : "start";
  // canRetryMessage is session-idle; keeps copy from flashing between tool steps.
  const showActions = row.message.role === "assistant" && !isStreaming && canRetryMessage;

  const handleRetry = useCallback(() => {
    onRetryMessage?.(row.id);
  }, [onRetryMessage, row.id]);

  return (
    <Message align={align} className={cn(row.message.role === "user" ? "" : "px-2")}>
      <MessageContent className="gap-1.5">
        <PartRenderer
          message={row.message}
          isStreaming={isStreaming}
          pendingPermissions={pendingPermissions}
          permissionMode={permissionMode}
          onResolvePermission={onResolvePermission}
        />
        {showActions ? (
          <AssistantMessageActions
            markdown={textPartsMarkdown(row.message)}
            canRetry={canRetryMessage}
            onRetry={onRetryMessage ? handleRetry : undefined}
          />
        ) : null}
      </MessageContent>
    </Message>
  );
});
