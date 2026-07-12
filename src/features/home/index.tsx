import { Suspense, memo, useCallback, useEffect, type ReactElement } from "react";

import { Container, Item } from "@/components/motion/stagger";
import { signalAppReady } from "@/lib/app-ready";
import type { PermissionDecision } from "@/lib/session";

import { AgentTranscript } from "./chat/AgentTranscript";
import { TaskPromptComposer } from "./Composer";
import { HomePageHeader } from "./header";
import {
  useAgentSessionControls,
  useAgentSessionStore,
  useAgentTranscript,
  type AgentSessionControls,
} from "./hooks/use-agent-session";
import { useChatPersistence } from "./hooks/use-chat-persistence";
import { SessionStatusBar } from "./SessionStatusBar";

const HomeComposer = memo(function HomeComposer({
  controls,
}: {
  readonly controls: AgentSessionControls;
}): ReactElement {
  return (
    <TaskPromptComposer
      onSubmit={(prompt) => {
        void controls.start(prompt);
      }}
      onCancel={() => {
        void controls.cancel();
      }}
      onRetry={
        controls.canRetry
          ? () => {
              void controls.retry();
            }
          : undefined
      }
      inputDisabled={controls.inputDisabled}
      cancelVisible={controls.cancelVisible}
      canRetry={controls.canRetry}
      modelId={controls.modelId}
      onModelChange={controls.onModelChange}
      contextUsage={controls.contextUsage}
    />
  );
});

const HomeChatComposer = memo(function HomeChatComposer({
  controls,
}: {
  readonly controls: AgentSessionControls;
}): ReactElement {
  return (
    <div className="flex min-h-12 flex-col gap-2 p-2">
      <SessionStatusBar
        pendingPermissions={controls.pendingPermissions}
        canResolvePermission={controls.canResolvePermission}
        failure={controls.failure}
      />
      <HomeComposer controls={controls} />
    </div>
  );
});

function HomePageInner({ chatId }: { readonly chatId: string | undefined }): ReactElement {
  const store = useAgentSessionStore();
  useChatPersistence(store, chatId);
  const { rows, streamingMessageId, pendingPermissions } = useAgentTranscript(store);
  const controls = useAgentSessionControls(store);

  const onResolvePermission = useCallback(
    (callId: string, decision: PermissionDecision, persist?: boolean) => {
      void controls.resolvePermission(callId, decision, persist);
    },
    [controls.resolvePermission],
  );

  // Settings (incl. model id) are loaded before this mounts; reveal window after paint.
  useEffect(() => {
    signalAppReady();
  }, []);

  return (
    <div className="flex flex-col h-full w-full gap-0 overflow-hidden box-border overscroll-contain">
      <div>
        <HomePageHeader navDisabled={controls.inputDisabled} />
      </div>
      {rows.length === 0 ? (
        <Container className="flex min-h-0 flex-1 flex-col justify-center px-4">
          <Item className="text-[22px] font-[445] text-foreground">Welcome to Actuate</Item>
          <Item className="text-muted-foreground text-xl">Ready to run your errands?</Item>
        </Container>
      ) : (
        <AgentTranscript
          rows={rows}
          streamingMessageId={streamingMessageId}
          pendingPermissions={pendingPermissions}
          permissionMode={controls.permissionMode}
          onResolvePermission={onResolvePermission}
        />
      )}
      <HomeChatComposer controls={controls} />
    </div>
  );
}

export function HomePageContent({ chatId }: { readonly chatId?: string }): ReactElement {
  return (
    <Suspense fallback={null}>
      <HomePageInner chatId={chatId} />
    </Suspense>
  );
}
