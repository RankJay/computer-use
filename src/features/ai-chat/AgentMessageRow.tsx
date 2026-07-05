import type { ReactElement } from "react";

import { Message, MessageContent } from "@/components/ui/message";

import { renderAgentMessageParts } from "./AgentMessagePartRenderer";
import type { AgentMessageRowData } from "./types";

export type AgentMessageRowProps = {
  readonly row: AgentMessageRowData;
};

export function AgentMessageRow({ row }: AgentMessageRowProps): ReactElement {
  const align = row.message.role === "user" ? "end" : "start";

  return (
    <Message align={align}>
      <MessageContent className="gap-3">
        {renderAgentMessageParts({ message: row.message })}
      </MessageContent>
    </Message>
  );
}
