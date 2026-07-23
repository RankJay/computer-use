import { memo, useCallback, useEffect, useMemo, type ReactElement } from "react";

import { SuspenseQueryBoundary } from "@/components/boundaries/ErrorBoundary";
import { Container, Item } from "@/components/motion/stagger";
import { signalAppReady } from "@/lib/runtime/app-ready";
import type { BatchedAttemptStore, PermissionDecision } from "@/lib/session";
import { settingsKeys } from "@/lib/settings/queries";

import { AttemptStatusBar } from "./AttemptStatusBar";
import { AgentTranscript } from "./chat/AgentTranscript";
import { ComposerContextMeter, TaskPromptComposer } from "./Composer";
import { HomePageHeader } from "./header";
import { HomePageSkeleton } from "./HomePageSkeleton";
import {
  useAgentContextUsage,
  useAgentInputDisabled,
  useAgentSessionControls,
  useAgentSessionStore,
  useAgentTranscript,
} from "./hooks/use-agent-session";
import { useChatPersistence } from "./hooks/use-chat-persistence";

const ContextUsageIsland = memo(function ContextUsageIsland({
  store,
}: {
  readonly store: BatchedAttemptStore;
}): ReactElement {
  const contextUsage = useAgentContextUsage(store);
  return (
    <ComposerContextMeter
      maxTokens={contextUsage.maxTokens}
      modelId={contextUsage.modelId}
      usage={contextUsage.usage}
      usedTokens={contextUsage.usedTokens}
    />
  );
});

const TranscriptIsland = memo(function TranscriptIsland({
  store,
}: {
  readonly store: BatchedAttemptStore;
}): ReactElement {
  const { rows, streamingMessageId, pendingPermissions } = useAgentTranscript(store);
  const controls = useAgentSessionControls(store);

  const onResolvePermission = useCallback(
    (callId: string, decision: PermissionDecision, persist?: boolean) => {
      void controls.resolvePermission(callId, decision, persist);
    },
    [controls],
  );

  const onRetryMessage = useCallback(
    (messageId: string) => {
      void controls.retryFromMessage(messageId);
    },
    [controls],
  );

  const empty = rows.length === 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {empty ? (
        <Container className="pointer-events-none absolute inset-0 z-10 flex min-h-0 flex-1 flex-col justify-center px-5">
          <Item className="text-[22px] font-[445] text-foreground">Welcome to Actuate</Item>
          <Item className="text-muted-foreground text-xl">Ready to run your errands?</Item>
        </Container>
      ) : null}
      <AgentTranscript
        rows={rows}
        streamingMessageId={streamingMessageId}
        pendingPermissions={pendingPermissions}
        permissionMode={controls.permissionMode}
        onResolvePermission={onResolvePermission}
        canRetryMessage={controls.canSubmit}
        onRetryMessage={onRetryMessage}
      />
    </div>
  );
});

const ComposerIsland = memo(function ComposerIsland({
  store,
}: {
  readonly store: BatchedAttemptStore;
}): ReactElement {
  const controls = useAgentSessionControls(store);
  const contextSlot = useMemo(() => <ContextUsageIsland store={store} />, [store]);

  return (
    <div className="flex min-h-12 flex-col gap-2 p-2">
      <AttemptStatusBar
        pendingPermissions={controls.pendingPermissions}
        canResolvePermission={controls.canResolvePermission}
        failure={controls.failure}
      />
      <TaskPromptComposer
        onSubmit={controls.start}
        onCancel={controls.cancel}
        onRetry={controls.canRetry ? controls.retry : undefined}
        inputDisabled={controls.inputDisabled}
        cancelVisible={controls.cancelVisible}
        canRetry={controls.canRetry}
        modelId={controls.modelId}
        onModelChange={controls.onModelChange}
        contextSlot={contextSlot}
      />
    </div>
  );
});

function HomePageBody({
  store,
  chatId,
}: {
  readonly store: BatchedAttemptStore;
  readonly chatId: string | undefined;
}): ReactElement {
  useChatPersistence(store, chatId);

  useEffect(() => {
    signalAppReady();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <TranscriptIsland store={store} />
      <ComposerIsland store={store} />
    </div>
  );
}

export function HomePageContent({ chatId }: { readonly chatId?: string }): ReactElement {
  const routeKey = chatId ?? "new";
  const store = useAgentSessionStore();
  const navDisabled = useAgentInputDisabled(store);

  return (
    <div className="flex flex-col h-full w-full gap-0 overflow-hidden box-border overscroll-contain">
      <div>
        <HomePageHeader navDisabled={navDisabled} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SuspenseQueryBoundary
          queryKey={settingsKeys.loaded()}
          fallback={<HomePageSkeleton />}
          fallbackTitle="Could not load workspace"
          fallbackDescription="Settings failed to load from this device."
          resetKeys={[routeKey]}
        >
          <HomePageBody store={store} chatId={chatId} />
        </SuspenseQueryBoundary>
      </div>
    </div>
  );
}
