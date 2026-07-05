import { useCallback, useState } from "react";

import { AgentTranscript } from "@/features/ai-chat/AgentTranscript";
import { getAvailableAgentModels, getDefaultAgentModelId } from "@/lib/agent-models";
import { demoAgentTranscriptRows, demoContextUsage } from "@/lib/demo-agent-chat";

import { ControlCenterHeader } from "./ControlCenterHeader";
import { TaskPromptComposer } from "./TaskPromptComposer";

export function ControlCenter() {
  const [draft, setDraft] = useState("");
  const [modelId, setModelId] = useState(getDefaultAgentModelId);
  const models = getAvailableAgentModels();
  const canStart = draft.trim().length > 0;

  const submitTask = useCallback((): void => {
    if (!canStart) return;
    setDraft("");
  }, [canStart]);

  return (
    <div className="box-border overscroll-contain flex h-full min-h-dvh w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#0E0E0E] text-white shadow-none ring-0">
      <ControlCenterHeader />
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 pt-0">
        <AgentTranscript rows={demoAgentTranscriptRows} />
      </div>

      <TaskPromptComposer
        cancelVisible={false}
        contextUsage={demoContextUsage}
        inputDisabled={false}
        modelId={modelId}
        models={models}
        onCancel={() => {}}
        onChange={setDraft}
        onModelChange={setModelId}
        onSubmit={submitTask}
        submitDisabled={!canStart}
        value={draft}
      />
    </div>
  );
}
