import type { ReactElement } from "react";

import type { AgentTimelineItem } from "@/agent/types";
import { buildTranscriptRenderItems } from "@/features/agent-chat/transcriptRender";
import {
  TranscriptRenderRow,
  transcriptRenderRowKey,
} from "@/features/agent-chat/TranscriptRenderRow";
import { computeTranscriptViewport } from "@/features/agent-chat/transcriptViewport";
import { useAgentChatTranscriptScroll } from "@/features/agent-chat/useAgentChatTranscriptScroll";
import { useTranscriptCopyControl } from "@/features/agent-chat/useTranscriptCopyControl";

export type AgentChatTranscriptProps = {
  readonly timeline: readonly AgentTimelineItem[];
  readonly canRegenerateAssistant: boolean;
  readonly onRegenerateAssistant: () => void;
  readonly isRunActive: boolean;
};

export function AgentChatTranscript(props: AgentChatTranscriptProps): ReactElement {
  const renderItems = buildTranscriptRenderItems(props.timeline);
  const viewport = computeTranscriptViewport(renderItems, props.isRunActive);
  const createCopyControl = useTranscriptCopyControl();
  const { scrollContainerRef, turnStartRef, anchorRef, activeTurnMinHeight } =
    useAgentChatTranscriptScroll({
      timeline: props.timeline,
      lastUserId: viewport.lastUserId,
      useTurnViewport: viewport.useTurnViewport,
      isRunActive: props.isRunActive,
    });

  const renderTranscriptRow = (item: (typeof renderItems)[number]): ReactElement => (
    <TranscriptRenderRow
      key={transcriptRenderRowKey(item)}
      item={item}
      canRegenerateAssistant={props.canRegenerateAssistant}
      isLastRenderItem={item === viewport.lastRenderItem}
      createCopyControl={createCopyControl}
      onRegenerateAssistant={props.onRegenerateAssistant}
    />
  );

  return (
    <div
      ref={scrollContainerRef}
      className="min-h-0 flex-1 px-1.5 py-2 overflow-y-auto overscroll-contain scrollbar-none"
    >
      {viewport.historyItems.map(renderTranscriptRow)}
      {viewport.useTurnViewport ? (
        <div
          ref={turnStartRef}
          className="flex flex-col"
          style={{ minHeight: activeTurnMinHeight }}
        >
          {viewport.currentTurnItems.map(renderTranscriptRow)}
          <div className="flex-1 shrink-0" aria-hidden />
        </div>
      ) : (
        viewport.currentTurnItems.map(renderTranscriptRow)
      )}

      <div ref={anchorRef} aria-hidden />
    </div>
  );
}
