import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { AgentTimelineItem } from "@/agent/types";
import {
  scheduleActiveTurnScroll,
  scrollContainerToBottom,
  STICK_TO_BOTTOM_THRESHOLD_PX,
} from "@/features/agent-chat/transcriptScroll";

export type UseAgentChatTranscriptScrollParams = {
  readonly timeline: readonly AgentTimelineItem[];
  readonly lastUserId: string | null;
  readonly useTurnViewport: boolean;
  readonly isRunActive: boolean;
};

export type UseAgentChatTranscriptScrollResult = {
  readonly scrollContainerRef: RefObject<HTMLDivElement | null>;
  readonly turnStartRef: RefObject<HTMLDivElement | null>;
  readonly anchorRef: RefObject<HTMLDivElement | null>;
  readonly activeTurnMinHeight: number | undefined;
};

export function useAgentChatTranscriptScroll(
  params: UseAgentChatTranscriptScrollParams,
): UseAgentChatTranscriptScrollResult {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const turnStartRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);
  const suppressBottomScrollRef = useRef(false);
  const pendingTurnScrollUserIdRef = useRef<string | null>(null);
  const [scrollViewportHeight, setScrollViewportHeight] = useState(0);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container === null) return;

    const updateViewportHeight = (): void => {
      setScrollViewportHeight(container.clientHeight);
    };

    updateViewportHeight();
    const resizeObserver = new ResizeObserver(updateViewportHeight);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container === null) return;

    const onScroll = (): void => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      stickToBottomRef.current = distanceFromBottom <= STICK_TO_BOTTOM_THRESHOLD_PX;
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const isNewTurn = params.lastUserId !== null && params.lastUserId !== lastUserIdRef.current;
    const shouldPinTurn =
      pendingTurnScrollUserIdRef.current === params.lastUserId || (isNewTurn && params.isRunActive);

    if (isNewTurn) {
      lastUserIdRef.current = params.lastUserId;
      pendingTurnScrollUserIdRef.current = params.lastUserId;
      suppressBottomScrollRef.current = true;
      stickToBottomRef.current = true;
    }

    if (shouldPinTurn && params.useTurnViewport) {
      const turn = turnStartRef.current;
      if (container !== null && turn !== null) {
        scheduleActiveTurnScroll(scrollContainerRef, turnStartRef);
        pendingTurnScrollUserIdRef.current = null;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            suppressBottomScrollRef.current = false;
          });
        });
      }
      return;
    }

    if (
      container !== null &&
      !suppressBottomScrollRef.current &&
      stickToBottomRef.current &&
      params.isRunActive
    ) {
      scrollContainerToBottom(container);
    }
  }, [
    params.timeline,
    params.lastUserId,
    params.useTurnViewport,
    params.isRunActive,
    scrollViewportHeight,
  ]);

  const activeTurnMinHeight =
    params.useTurnViewport && scrollViewportHeight > 0 ? scrollViewportHeight : undefined;

  return {
    scrollContainerRef,
    turnStartRef,
    anchorRef,
    activeTurnMinHeight,
  };
}
