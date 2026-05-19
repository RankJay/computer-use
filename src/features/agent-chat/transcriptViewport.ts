import type { TranscriptRenderItem } from "@/features/agent-chat/transcriptRender";
import { findLastUserRenderIndex } from "@/features/agent-chat/transcriptScroll";

export type TranscriptViewport = {
  readonly lastRenderItem: TranscriptRenderItem | undefined;
  readonly lastUserId: string | null;
  readonly useTurnViewport: boolean;
  readonly historyItems: readonly TranscriptRenderItem[];
  readonly currentTurnItems: readonly TranscriptRenderItem[];
};

export function computeTranscriptViewport(
  renderItems: readonly TranscriptRenderItem[],
  isRunActive: boolean,
): TranscriptViewport {
  const lastRenderItem = renderItems.length > 0 ? renderItems[renderItems.length - 1] : undefined;
  const lastUserIndex = findLastUserRenderIndex(renderItems);
  const lastUserItem = lastUserIndex >= 0 ? renderItems[lastUserIndex] : undefined;
  const lastUserId = lastUserItem?.kind === "user" ? lastUserItem.id : null;
  const useTurnViewport = isRunActive && lastUserIndex >= 0 && renderItems.length > 0;
  const historyItems = useTurnViewport ? renderItems.slice(0, lastUserIndex) : [];
  const currentTurnItems = useTurnViewport ? renderItems.slice(lastUserIndex) : renderItems;

  return {
    lastRenderItem,
    lastUserId,
    useTurnViewport,
    historyItems,
    currentTurnItems,
  };
}
