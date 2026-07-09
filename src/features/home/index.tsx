import { Suspense, memo, useEffect, type ReactElement } from "react";

import { signalAppReady } from "@/lib/app-ready";

import { AgentTranscript } from "./chat/AgentTranscript";
import { TaskPromptComposer } from "./Composer";
import { HomePageHeader } from "./header";
import {
  useAgentSessionControls,
  useAgentSessionStore,
  useAgentTranscript,
  type AgentSessionControls,
} from "./hooks/use-agent-session";

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
      <HomeComposer controls={controls} />
    </div>
  );
});

function HomePageInner(): ReactElement {
  const store = useAgentSessionStore();
  const { rows, streamingMessageId, pendingPermissions } = useAgentTranscript(store);
  const controls = useAgentSessionControls(store);

  // Settings (incl. model id) are loaded before this mounts; reveal window after paint.
  useEffect(() => {
    signalAppReady();
  }, []);

  return (
    <div className="flex flex-col h-full w-full gap-0 overflow-hidden box-border overscroll-contain">
      <div>
        <HomePageHeader />
      </div>
      <AgentTranscript
        rows={rows}
        streamingMessageId={streamingMessageId}
        pendingPermissions={pendingPermissions}
        permissionMode={controls.permissionMode}
        onResolvePermission={(callId, decision, persist) => {
          void controls.resolvePermission(callId, decision, persist);
        }}
      />
      <HomeChatComposer controls={controls} />
    </div>
  );
}

export function HomePageContent(): ReactElement {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}
