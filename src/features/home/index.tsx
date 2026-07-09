import { memo, useState, type ReactElement } from "react";

import { getDefaultAgentModelId } from "@/lib/agent-models";

import { AgentTranscript } from "./chat/AgentTranscript";
import {
  useMockAgentControls,
  useMockAgentStreamStore,
  useMockAgentTranscript,
  type MockAgentStreamControls,
} from "./chat/use-mock-agent-stream";
import { TaskPromptComposer } from "./Composer";
import { HomePageHeader } from "./header";

const HomeComposer = memo(function HomeComposer({
  inputDisabled,
  cancelVisible,
  onSubmit,
  onCancel,
}: {
  readonly inputDisabled: boolean;
  readonly cancelVisible: boolean;
  readonly onSubmit: (prompt: string) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const [modelId, setModelId] = useState(getDefaultAgentModelId);

  return (
    <TaskPromptComposer
      onSubmit={onSubmit}
      onCancel={onCancel}
      inputDisabled={inputDisabled}
      cancelVisible={cancelVisible}
      modelId={modelId}
      onModelChange={setModelId}
      models={[]}
    />
  );
});

const HomeChatComposer = memo(function HomeChatComposer({
  controls,
}: {
  readonly controls: MockAgentStreamControls;
}): ReactElement {
  return (
    <div className="flex min-h-12 flex-col gap-2 p-2">
      <HomeComposer
        inputDisabled={controls.inputDisabled}
        cancelVisible={controls.cancelVisible}
        onSubmit={controls.start}
        onCancel={controls.cancel}
      />
    </div>
  );
});

const HomeChatTranscript = memo(function HomeChatTranscript({
  store,
}: {
  readonly store: ReturnType<typeof useMockAgentStreamStore>;
}): ReactElement {
  const { rows, streamingMessageId } = useMockAgentTranscript(store);
  return <AgentTranscript rows={rows} streamingMessageId={streamingMessageId} />;
});

function HomeChatControls({
  store,
}: {
  readonly store: ReturnType<typeof useMockAgentStreamStore>;
}): ReactElement {
  const controls = useMockAgentControls(store);
  return <HomeChatComposer controls={controls} />;
}

export function HomePageContent(): ReactElement {
  const store = useMockAgentStreamStore();

  return (
    <div className="flex flex-col h-full w-full gap-0 overflow-hidden box-border overscroll-contain">
      <div>
        <HomePageHeader />
      </div>
      <HomeChatTranscript store={store} />
      <HomeChatControls store={store} />
    </div>
  );
}
