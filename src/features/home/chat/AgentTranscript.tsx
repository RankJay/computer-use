import { lazy, memo, Suspense, type ReactElement } from "react";

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { cn } from "@/lib/utils";

import { MarkerRow } from "./rows/MarkerRow";
import type { AgentMessageRowData, AgentTranscriptRow, PermissionResolveProps } from "./types";

/** Heavy rows (markdown / CoT / ai type-guards) — kept off empty-home cold path. */
const MessageRow = lazy(() =>
  import("./rows/MessageRow").then((mod) => ({ default: mod.MessageRow })),
);
const SpecialRow = lazy(() =>
  import("./rows/SpecialRow").then((mod) => ({ default: mod.SpecialRow })),
);

export type AgentTranscriptProps = PermissionResolveProps & {
  readonly rows: readonly AgentTranscriptRow[];
  readonly streamingMessageId?: string | null;
  readonly canRetryMessage?: boolean;
  readonly onRetryMessage?: (messageId: string) => void;
};

/** Plain-text stand-in while the MessageRow chunk loads — no Streamdown / ai imports. */
function MessageRowChunkFallback({ row }: { readonly row: AgentMessageRowData }): ReactElement {
  const text = row.message.parts
    .flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [part.text] : []))
    .join("\n\n");
  const isUser = row.message.role === "user";

  return (
    <div className={cn(isUser ? "flex justify-end" : "px-2")}>
      {isUser ? (
        <div className="text-sm bg-[#161616] px-3 py-2.5 rounded-xl whitespace-pre-wrap text-foreground max-w-[85%]">
          {text}
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap text-foreground font-[350] px-1">{text}</p>
      )}
    </div>
  );
}

type TranscriptRowViewProps = PermissionResolveProps & {
  readonly row: AgentTranscriptRow;
  readonly isStreaming: boolean;
  readonly canRetryMessage?: boolean;
  readonly onRetryMessage?: (messageId: string) => void;
};

const TranscriptRowView = memo(function TranscriptRowView({
  row,
  isStreaming,
  pendingInteractions,
  permissionMode,
  onResolvePermission,
  canRetryMessage,
  onRetryMessage,
}: TranscriptRowViewProps): ReactElement {
  switch (row.type) {
    case "marker":
      return <MarkerRow row={row} />;
    case "message":
      return (
        <Suspense fallback={<MessageRowChunkFallback row={row} />}>
          <MessageRow
            row={row}
            isStreaming={isStreaming}
            pendingInteractions={pendingInteractions}
            permissionMode={permissionMode}
            onResolvePermission={onResolvePermission}
            canRetryMessage={canRetryMessage}
            onRetryMessage={onRetryMessage}
          />
        </Suspense>
      );
    default:
      return (
        <Suspense
          fallback={<div aria-hidden className="h-8 animate-pulse rounded-lg bg-[#252525]" />}
        >
          <SpecialRow row={row} />
        </Suspense>
      );
  }
});

/** Memo boundary outside MessageScrollerItem (which is not memoized upstream). */
const TranscriptItem = memo(function TranscriptItem({
  row,
  isStreaming,
  pendingInteractions,
  permissionMode,
  onResolvePermission,
  canRetryMessage,
  onRetryMessage,
}: TranscriptRowViewProps): ReactElement {
  return (
    <MessageScrollerItem
      messageId={row.id}
      scrollAnchor={row.type === "message" ? row.scrollAnchor : undefined}
    >
      <TranscriptRowView
        row={row}
        isStreaming={isStreaming}
        pendingInteractions={pendingInteractions}
        permissionMode={permissionMode}
        onResolvePermission={onResolvePermission}
        canRetryMessage={canRetryMessage}
        onRetryMessage={onRetryMessage}
      />
    </MessageScrollerItem>
  );
});

export const AgentTranscript = memo(function AgentTranscript({
  rows,
  streamingMessageId = null,
  pendingInteractions,
  permissionMode,
  onResolvePermission,
  canRetryMessage = false,
  onRetryMessage,
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
                pendingInteractions={pendingInteractions}
                permissionMode={permissionMode}
                onResolvePermission={onResolvePermission}
                canRetryMessage={canRetryMessage}
                onRetryMessage={onRetryMessage}
              />
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
});
