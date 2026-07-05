import type { ReactElement } from "react";

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";

import { AgentMessageRow } from "./AgentMessageRow";
import { AgentSpecialRow } from "./AgentSpecialRow";
import { AgentTimelineMarker } from "./AgentTimelineMarker";
import type { AgentTranscriptRow } from "./types";

export type AgentTranscriptProps = {
  readonly rows: readonly AgentTranscriptRow[];
};

function AgentTranscriptRowView({ row }: { readonly row: AgentTranscriptRow }): ReactElement {
  switch (row.type) {
    case "marker":
      return <AgentTimelineMarker row={row} />;
    case "message":
      return <AgentMessageRow row={row} />;
    default:
      return <AgentSpecialRow row={row} />;
  }
}

export function AgentTranscript({ rows }: AgentTranscriptProps): ReactElement {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport className="scrollbar-none px-2">
          <MessageScrollerContent className="gap-4 py-4">
            {rows.map((row) => (
              <MessageScrollerItem
                key={row.id}
                messageId={row.id}
                scrollAnchor={row.type === "message" ? row.scrollAnchor : undefined}
              >
                <AgentTranscriptRowView row={row} />
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
