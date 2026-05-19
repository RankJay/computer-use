import type { RefObject } from "react";

import type { TranscriptRenderItem } from "@/features/agent-chat/transcriptRender";

export const STICK_TO_BOTTOM_THRESHOLD_PX = 48;

export function findLastUserRenderIndex(items: readonly TranscriptRenderItem[]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.kind === "user") {
      return index;
    }
  }
  return -1;
}

export function scrollChildToTop(container: HTMLElement, child: HTMLElement): void {
  const containerTop = container.getBoundingClientRect().top;
  const childTop = child.getBoundingClientRect().top;
  container.scrollTop += childTop - containerTop;
}

export function scrollContainerToBottom(container: HTMLElement): void {
  container.scrollTop = container.scrollHeight;
}

export function scheduleActiveTurnScroll(
  containerRef: RefObject<HTMLDivElement | null>,
  turnRef: RefObject<HTMLDivElement | null>,
): void {
  const attempt = (): boolean => {
    const container = containerRef.current;
    const turn = turnRef.current;
    if (container === null || turn === null) {
      return false;
    }
    scrollChildToTop(container, turn);
    return true;
  };

  if (attempt()) {
    requestAnimationFrame(() => {
      attempt();
      requestAnimationFrame(attempt);
    });
    return;
  }

  requestAnimationFrame(() => {
    if (attempt()) {
      requestAnimationFrame(attempt);
      return;
    }
    requestAnimationFrame(attempt);
  });
}
