import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement, RefObject } from "react";
import { Button } from "@/components/ui/button";
import type { AgentActivityRow, AgentTimelineItem } from "@/agent/types";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  clipboardAdapter,
  COPIED_FEEDBACK_DURATION_MS,
} from "@/features/agent-chat/clipboardAdapter";
import type { LucideIcon } from "lucide-react";
import {
  Camera,
  Check,
  Copy,
  Dot,
  ListChecks,
  Loader2,
  RotateCw,
  ShieldQuestion,
  Wrench,
} from "lucide-react";
import {
  buildTranscriptRenderItems,
  type TranscriptRenderItem,
} from "@/features/agent-chat/transcriptRender";
import { StreamingAssistantText } from "@/features/agent-chat/StreamingAssistantText";

const AgentStreamMarkdown = lazy(async () => {
  const module = await import("@/features/agent-chat/AgentStreamMarkdown");
  return { default: module.AgentStreamMarkdown };
});

export type AgentChatTranscriptProps = {
  readonly timeline: readonly AgentTimelineItem[];
  readonly canRegenerateAssistant: boolean;
  readonly onRegenerateAssistant: () => void;
  readonly isRunActive: boolean;
};

const STICK_TO_BOTTOM_THRESHOLD_PX = 48;

function findLastUserRenderIndex(items: readonly TranscriptRenderItem[]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.kind === "user") {
      return index;
    }
  }
  return -1;
}

function scrollChildToTop(container: HTMLElement, child: HTMLElement): void {
  const containerTop = container.getBoundingClientRect().top;
  const childTop = child.getBoundingClientRect().top;
  container.scrollTop += childTop - containerTop;
}

function scrollContainerToBottom(container: HTMLElement): void {
  container.scrollTop = container.scrollHeight;
}

function scheduleActiveTurnScroll(
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

type CopyControl = {
  readonly isCopied: boolean;
  readonly isCopyDisabled: boolean;
  readonly onCopy: () => void;
};

export function AgentChatTranscript(props: AgentChatTranscriptProps): ReactElement {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const turnStartRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);
  const suppressBottomScrollRef = useRef(false);
  const pendingTurnScrollUserIdRef = useRef<string | null>(null);
  const resetCopiedStatusRef = useRef<(() => void) | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
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

  useEffect(() => {
    return () => {
      resetCopiedStatusRef.current?.();
    };
  }, []);

  const resetCopiedStatusLater = useCallback((copyId: string) => {
    resetCopiedStatusRef.current?.();
    resetCopiedStatusRef.current = clipboardAdapter.schedule(() => {
      resetCopiedStatusRef.current = null;
      setCopiedMessageId((currentCopyId) => (currentCopyId === copyId ? null : currentCopyId));
    }, COPIED_FEEDBACK_DURATION_MS);
  }, []);

  const copyResponse = useCallback(
    async (copyId: string, text: string) => {
      if (text.trim().length === 0) return;

      const copied = await clipboardAdapter.writeClipboardText(text);
      if (!copied) return;

      setCopiedMessageId(copyId);
      resetCopiedStatusLater(copyId);
    },
    [resetCopiedStatusLater],
  );

  const createCopyControl = useCallback(
    (copyId: string, text: string): CopyControl => ({
      isCopied: copiedMessageId === copyId,
      isCopyDisabled: text.trim().length === 0,
      onCopy: () => {
        void copyResponse(copyId, text);
      },
    }),
    [copiedMessageId, copyResponse],
  );

  const renderItems = buildTranscriptRenderItems(props.timeline);
  const lastRenderItem =
    renderItems.length > 0 ? renderItems[renderItems.length - 1] : undefined;
  const lastUserIndex = findLastUserRenderIndex(renderItems);
  const lastUserItem = lastUserIndex >= 0 ? renderItems[lastUserIndex] : undefined;
  const lastUserId = lastUserItem?.kind === "user" ? lastUserItem.id : null;
  const useTurnViewport =
    props.isRunActive && lastUserIndex >= 0 && renderItems.length > 0;
  const historyItems = useTurnViewport ? renderItems.slice(0, lastUserIndex) : [];
  const currentTurnItems = useTurnViewport ? renderItems.slice(lastUserIndex) : renderItems;

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const isNewTurn = lastUserId !== null && lastUserId !== lastUserIdRef.current;
    const shouldPinTurn =
      pendingTurnScrollUserIdRef.current === lastUserId ||
      (isNewTurn && props.isRunActive);

    if (isNewTurn) {
      lastUserIdRef.current = lastUserId;
      pendingTurnScrollUserIdRef.current = lastUserId;
      suppressBottomScrollRef.current = true;
      stickToBottomRef.current = true;
    }

    if (shouldPinTurn && useTurnViewport) {
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
      props.isRunActive
    ) {
      scrollContainerToBottom(container);
    }
  }, [props.timeline, lastUserId, useTurnViewport, props.isRunActive, scrollViewportHeight]);

  const activeTurnMinHeight =
    useTurnViewport && scrollViewportHeight > 0 ? scrollViewportHeight : undefined;

  const renderTranscriptRow = (item: TranscriptRenderItem): ReactElement => (
    <TranscriptRenderRow
      key={renderRowKey(item)}
      item={item}
      canRegenerateAssistant={props.canRegenerateAssistant}
      isLastRenderItem={item === lastRenderItem}
      createCopyControl={createCopyControl}
      onRegenerateAssistant={props.onRegenerateAssistant}
    />
  );

  return (
    <div
      ref={scrollContainerRef}
      className="min-h-0 flex-1 px-1.5 py-2 overflow-y-auto overscroll-contain scrollbar-none"
    >
      {historyItems.map(renderTranscriptRow)}
      {useTurnViewport ? (
        <div
          ref={turnStartRef}
          className="flex flex-col"
          style={{ minHeight: activeTurnMinHeight }}
        >
          {currentTurnItems.map(renderTranscriptRow)}
          <div className="flex-1 shrink-0" aria-hidden />
        </div>
      ) : (
        currentTurnItems.map(renderTranscriptRow)
      )}

      <div ref={anchorRef} aria-hidden />
    </div>
  );
}

function renderRowKey(item: TranscriptRenderItem): string {
  return item.kind === "assistant-turn" ? `turn-${item.id}` : item.id;
}

function TranscriptRenderRow(props: {
  readonly item: TranscriptRenderItem;
  readonly canRegenerateAssistant: boolean;
  readonly isLastRenderItem: boolean;
  readonly createCopyControl: (copyId: string, text: string) => CopyControl;
  readonly onRegenerateAssistant: () => void;
}): ReactElement {
  switch (props.item.kind) {
    case "user":
      return (
        <div className="w-full">
          <p className="text-sm bg-[#161616] px-3 py-2.5 mb-4 rounded-xl whitespace-pre-wrap text-[#cdcdcd]">
            {props.item.text}
          </p>
        </div>
      );
    case "activity":
      return (
        <AgentActivityBlock rows={props.item.rows} status={props.item.status} />
      );
    case "assistant-turn":
      return (
        <AssistantTurnBlock
          turn={props.item}
          copyControl={props.createCopyControl(props.item.id, props.item.copyText)}
          onRegenerate={
            props.canRegenerateAssistant &&
            props.isLastRenderItem &&
            !props.item.isStreaming
              ? props.onRegenerateAssistant
              : undefined
          }
        />
      );
    default: {
      const _never: never = props.item;
      return _never;
    }
  }
}

function AgentActivityBlock(props: {
  readonly rows: readonly AgentActivityRow[];
  readonly status: "active" | "completed" | "failed";
  readonly collapse?: boolean;
}): ReactElement | null {
  if (props.rows.length === 0) return null;

  const isActive = props.status === "active";
  const shouldAutoOpen = isActive && props.collapse !== true;
  const [isOpen, setIsOpen] = useState(shouldAutoOpen);

  useEffect(() => {
    setIsOpen(shouldAutoOpen);
  }, [shouldAutoOpen]);

  return (
    <ChainOfThought
      open={isOpen}
      onOpenChange={setIsOpen}
      className="w-full text-sm mb-4 text-[#B7C1CC]"
    >
      <ChainOfThoughtHeader className="text-[#7E7E7E] hover:text-[#cdcdcd]">
        {agentActivityHeading(props.status)}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent className="text-[#B7C1CC]">
        {props.rows.map((row, index) => (
          <ChainOfThoughtStep
            key={row.id}
            icon={activityStepIcon(row, isActive && index === props.rows.length - 1)}
            label={row.title}
            description={activityStepDescription(row)}
            status={activityStepStatus(props.status, index, props.rows.length)}
            className="**:[[class*='bg-border']]:bg-neutral-800"
          />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function agentActivityHeading(status: "active" | "completed" | "failed"): string {
  switch (status) {
    case "active":
      return "Here's what's happening";
    case "completed":
      return "Here's what happened";
    case "failed":
      return "Here's what ran";
    default: {
      const _never: never = status;
      return _never;
    }
  }
}

function activityStepStatus(
  status: "active" | "completed" | "failed",
  index: number,
  rowCount: number,
): "complete" | "active" | "pending" {
  if (status === "failed" && index === rowCount - 1) return "active";
  if (status === "active" && index === rowCount - 1) return "active";
  return "complete";
}

function activityStepIcon(row: AgentActivityRow, active: boolean): LucideIcon {
  if (active) return Loader2;

  const title = row.title.toLowerCase();
  if (title.startsWith("planned")) return ListChecks;
  if (title.includes("permission")) return ShieldQuestion;
  if (title.includes("screenshot")) return Camera;
  if (title.includes("running") || title.includes("finished")) return Wrench;
  return Dot;
}

function activityStepDescription(row: AgentActivityRow): ReactElement | string | undefined {
  const label = row.detail?.trim() ?? "";
  const src = row.screenshotDataUrl;

  if (src !== undefined) {
    return (
      <div className="space-y-2 pt-0.5">
        {label !== "" && (
          <span className="block whitespace-pre-wrap wrap-break-word text-[#9ca3af]">
            {row.detail}
          </span>
        )}
        <img
          src={src}
          alt={label !== "" ? label : "Screen capture"}
          className="max-w-full rounded-lg border border-neutral-700/70 bg-neutral-950/40 max-h-[min(420px,55vh)] w-auto object-contain object-left"
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  if (label === "") return undefined;
  return <span className="whitespace-pre-wrap wrap-break-word">{row.detail}</span>;
}

function AssistantTurnBlock(props: {
  readonly turn: Extract<TranscriptRenderItem, { kind: "assistant-turn" }>;
  readonly copyControl: CopyControl;
  readonly onRegenerate?: () => void;
}): ReactElement {
  return (
    <div className="w-full space-y-2 mb-8 px-3">
      {props.turn.parts.map((part, index) => {
        switch (part.kind) {
          case "text":
            return (
              <AssistantTextPart
                key={`${props.turn.id}-text-${index}`}
                markdown={part.text}
                isStreaming={part.isStreaming}
              />
            );
          case "activity":
            return (
              <AgentActivityBlock
                key={part.id}
                rows={part.rows}
                status={part.status}
                collapse={props.turn.isStreaming}
              />
            );
          default: {
            const _never: never = part;
            return _never;
          }
        }
      })}
      {!props.turn.isStreaming && (
        <AssistantToolbar copyControl={props.copyControl} onRegenerate={props.onRegenerate} />
      )}
    </div>
  );
}

function AssistantTextPart(props: {
  readonly markdown: string;
  readonly isStreaming: boolean;
}): ReactElement {
  return (
    <div
      className={`text-sm wrap-break-word text-[#fefefe]`}
    >
      {props.isStreaming ? (
        <StreamingAssistantText text={props.markdown} />
      ) : (
        <Suspense fallback={<span className="whitespace-pre-wrap">{props.markdown}</span>}>
          <AgentStreamMarkdown markdown={props.markdown} isStreaming={false} />
        </Suspense>
      )}
    </div>
  );
}

function AssistantToolbar(props: {
  readonly copyControl: CopyControl;
  readonly onRegenerate?: () => void;
}): ReactElement {
  return (
    <div className="flex items-center gap-0.5 opacity-55 transition-opacity hover:opacity-95">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-8 text-neutral-500 hover:bg-white/10 hover:text-neutral-300"
        aria-label={props.copyControl.isCopied ? "Copied" : "Copy response"}
        disabled={props.copyControl.isCopyDisabled}
        onClick={props.copyControl.onCopy}
      >
        {props.copyControl.isCopied ? (
          <Check className="size-3.5 text-emerald-400" strokeWidth={2} />
        ) : (
          <Copy className="size-3.5" strokeWidth={2} />
        )}
      </Button>
      {props.onRegenerate && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8 text-neutral-500 hover:bg-white/10 hover:text-neutral-300"
          aria-label="Regenerate response"
          onClick={props.onRegenerate}
        >
          <RotateCw className="size-3.5" strokeWidth={2} />
        </Button>
      )}
    </div>
  );
}

