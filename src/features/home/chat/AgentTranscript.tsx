import { memo, type ReactElement } from "react";

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";

import { MarkerRow } from "./rows/MarkerRow";
import { MessageRow } from "./rows/MessageRow";
import { SpecialRow } from "./rows/SpecialRow";
import type { AgentTranscriptRow } from "./types";

export type AgentTranscriptProps = {
  readonly rows: readonly AgentTranscriptRow[];
  readonly streamingMessageId?: string | null;
};

const TranscriptRowView = memo(function TranscriptRowView({
  row,
  isStreaming,
}: {
  readonly row: AgentTranscriptRow;
  readonly isStreaming: boolean;
}): ReactElement {
  switch (row.type) {
    case "marker":
      return <MarkerRow row={row} />;
    case "message":
      return <MessageRow row={row} isStreaming={isStreaming} />;
    default:
      return <SpecialRow row={row} />;
  }
});

/** Memo boundary outside MessageScrollerItem (which is not memoized upstream). */
const TranscriptItem = memo(function TranscriptItem({
  row,
  isStreaming,
}: {
  readonly row: AgentTranscriptRow;
  readonly isStreaming: boolean;
}): ReactElement {
  return (
    <MessageScrollerItem
      messageId={row.id}
      scrollAnchor={row.type === "message" ? row.scrollAnchor : undefined}
    >
      <TranscriptRowView row={row} isStreaming={isStreaming} />
    </MessageScrollerItem>
  );
});

export const AgentTranscript = memo(function AgentTranscript({
  rows,
  streamingMessageId = null,
}: AgentTranscriptProps): ReactElement {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport className="scrollbar-none px-2">
          <MessageScrollerContent className="gap-4 py-4">
            {rows.map((row) => (
              <TranscriptItem
                key={row.id}
                row={row}
                isStreaming={row.type === "message" && row.id === streamingMessageId}
              />
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
});
