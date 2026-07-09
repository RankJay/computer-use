import { memo, type ReactElement } from "react";

import { Message, MessageContent } from "@/components/ui/message";
import { cn } from "@/lib/utils";

import { PartRenderer } from "../parts/PartRenderer";
import type { AgentMessageRowData } from "../types";

export type MessageRowProps = {
  readonly row: AgentMessageRowData;
  readonly isStreaming?: boolean;
};

export const MessageRow = memo(function MessageRow({
  row,
  isStreaming = false,
}: MessageRowProps): ReactElement {
  const align = row.message.role === "user" ? "end" : "start";

  return (
    <Message align={align} className={cn(row.message.role === "user" ? "" : "px-2")}>
      <MessageContent className="gap-3">
        <PartRenderer message={row.message} isStreaming={isStreaming} />
      </MessageContent>
    </Message>
  );
});
