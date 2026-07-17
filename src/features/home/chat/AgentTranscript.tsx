import { lazy, memo, Suspense, type ReactElement } from "react";

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { PendingPermission } from "@/lib/session";
import type { PermissionMode } from "@/lib/settings/types";

import { MarkerRow } from "./rows/MarkerRow";
import type { AgentTranscriptRow } from "./types";

/** Heavy rows (markdown / CoT / ai type-guards) — kept off empty-home cold path. */
const MessageRow = lazy(() =>
  import("./rows/MessageRow").then((mod) => ({ default: mod.MessageRow })),
);
const SpecialRow = lazy(() =>
  import("./rows/SpecialRow").then((mod) => ({ default: mod.SpecialRow })),
);

export type AgentTranscriptProps = {
  readonly rows: readonly AgentTranscriptRow[];
  readonly streamingMessageId?: string | null;
  readonly pendingPermissions?: readonly PendingPermission[];
  readonly permissionMode?: PermissionMode;
  readonly onResolvePermission?: (
    callId: string,
    decision: "approved" | "denied",
    persist?: boolean,
  ) => void;
  readonly canRetryMessage?: boolean;
  readonly onRetryMessage?: (messageId: string) => void;
};

const TranscriptRowView = memo(function TranscriptRowView({
  row,
  isStreaming,
  pendingPermissions,
  permissionMode,
  onResolvePermission,
  canRetryMessage,
  onRetryMessage,
}: {
  readonly row: AgentTranscriptRow;
  readonly isStreaming: boolean;
  readonly pendingPermissions?: readonly PendingPermission[];
  readonly permissionMode?: PermissionMode;
  readonly onResolvePermission?: (
    callId: string,
    decision: "approved" | "denied",
    persist?: boolean,
  ) => void;
  readonly canRetryMessage?: boolean;
  readonly onRetryMessage?: (messageId: string) => void;
}): ReactElement {
  switch (row.type) {
    case "marker":
      return <MarkerRow row={row} />;
    case "message":
      return (
        <Suspense fallback={null}>
          <MessageRow
            row={row}
            isStreaming={isStreaming}
            pendingPermissions={pendingPermissions}
            permissionMode={permissionMode}
            onResolvePermission={onResolvePermission}
            canRetryMessage={canRetryMessage}
            onRetryMessage={onRetryMessage}
          />
        </Suspense>
      );
    default:
      return (
        <Suspense fallback={null}>
          <SpecialRow row={row} />
        </Suspense>
      );
  }
});

/** Memo boundary outside MessageScrollerItem (which is not memoized upstream). */
const TranscriptItem = memo(function TranscriptItem({
  row,
  isStreaming,
  pendingPermissions,
  permissionMode,
  onResolvePermission,
  canRetryMessage,
  onRetryMessage,
}: {
  readonly row: AgentTranscriptRow;
  readonly isStreaming: boolean;
  readonly pendingPermissions?: readonly PendingPermission[];
  readonly permissionMode?: PermissionMode;
  readonly onResolvePermission?: (
    callId: string,
    decision: "approved" | "denied",
    persist?: boolean,
  ) => void;
  readonly canRetryMessage?: boolean;
  readonly onRetryMessage?: (messageId: string) => void;
}): ReactElement {
  return (
    <MessageScrollerItem
      messageId={row.id}
      scrollAnchor={row.type === "message" ? row.scrollAnchor : undefined}
    >
      <TranscriptRowView
        row={row}
        isStreaming={isStreaming}
        pendingPermissions={pendingPermissions}
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
  pendingPermissions,
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
                pendingPermissions={pendingPermissions}
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
