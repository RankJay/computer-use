import { useCallback, useState } from "react";

import { useSettingsActions, useSettingsState } from "@/app/providers/SettingsProvider";
import { AgentTranscript } from "@/features/ai-chat/AgentTranscript";
import { getAvailableAgentModels, resolveAgentModelId } from "@/lib/agent-models";

import { ControlCenterHeader } from "./ControlCenterHeader";
import { useAgentRun } from "./hooks/useAgentRun";
import { PermissionPrompt } from "./PermissionPrompt";
import { TaskPromptComposer } from "./TaskPromptComposer";

export function ControlCenter() {
  const [draft, setDraft] = useState("");
  const { settings } = useSettingsState();
  const { updateSettings } = useSettingsActions();
  const models = getAvailableAgentModels();
  const modelId = resolveAgentModelId(settings.selectedModelId);
  const { projection, contextUsage, submit, cancel, resolvePermission, ready } =
    useAgentRun(modelId);

  const canStart = draft.trim().length > 0 && projection.canSubmit && ready;
  const pendingPermission = projection.pendingPermission;
  const showPersistOption = settings.permissionMode === "once-per-class";
  const isStreaming = projection.status === "streaming";

  const submitTask = useCallback(async (): Promise<void> => {
    if (!canStart) return;
    const prompt = draft.trim();
    setDraft("");
    await submit(prompt, modelId);
  }, [canStart, draft, modelId, submit]);

  const handleResolvePermission = useCallback(
    (decision: "approved" | "denied", persist?: boolean) => {
      void resolvePermission(decision, persist);
    },
    [resolvePermission],
  );

  return (
    <div className="box-border overscroll-contain flex h-full min-h-dvh w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#0E0E0E] text-white shadow-none ring-0">
      <ControlCenterHeader />
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 pt-0">
        <AgentTranscript
          rows={projection.rows}
          pendingPermission={pendingPermission}
          onResolvePermission={handleResolvePermission}
          isStreaming={isStreaming}
        />
      </div>

      <div className="flex flex-col gap-2 p-2">
        {pendingPermission ? (
          <PermissionPrompt
            pending={pendingPermission}
            showPersistOption={showPersistOption}
            onApprove={(persist) => handleResolvePermission("approved", persist)}
            onDeny={() => handleResolvePermission("denied")}
          />
        ) : null}

        <TaskPromptComposer
          cancelVisible={projection.cancelVisible}
          contextUsage={contextUsage}
          inputDisabled={projection.inputDisabled}
          modelId={modelId}
          models={models}
          onCancel={() => {
            void cancel();
          }}
          onChange={setDraft}
          onModelChange={(id) => {
            void updateSettings({ selectedModelId: id });
          }}
          onSubmit={() => {
            void submitTask();
          }}
          submitDisabled={!canStart}
          value={draft}
        />
      </div>
    </div>
  );
}
