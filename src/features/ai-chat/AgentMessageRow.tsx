import type { ReactElement } from "react";

import { Message, MessageContent } from "@/components/ui/message";
import type { PermissionActionHandlers } from "@/features/ai-chat/permission-actions";

import { renderAgentMessageParts } from "./AgentMessagePartRenderer";
import type { AgentMessageRowData } from "./types";

export type AgentMessageRowProps = {
  readonly row: AgentMessageRowData;
  readonly permissionActions?: PermissionActionHandlers;
  readonly isStreaming?: boolean;
};

export function AgentMessageRow({
  row,
  permissionActions,
  isStreaming = false,
}: AgentMessageRowProps): ReactElement {
  const align = row.message.role === "user" ? "end" : "start";

  return (
    <Message align={align}>
      <MessageContent className="gap-3">
        {renderAgentMessageParts({
          message: row.message,
          isStreaming,
          permissionActions,
        })}
      </MessageContent>
    </Message>
  );
}
