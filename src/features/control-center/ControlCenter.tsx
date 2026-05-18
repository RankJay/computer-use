import { countOpenPointerTools, countOpenUiAutomationTools } from "@/agent/session/uiAutomationDepth";
import { isTauriRuntime } from "@/agent/native/nativeBridge";
import type { PermissionChoice } from "@/agent/types";
import { AgentChatTranscript } from "@/features/agent-chat/AgentChat";
import {
  AgentEventLog,
  PointerAutomationEscBar,
  TaskFailureBanner,
} from "@/features/agent-chat/AgentSessionPanels";
import { PermissionPrompt } from "@/features/agent-chat/PermissionPrompt";
import { TaskPromptComposer } from "@/features/control-center/TaskPromptComposer";
import { WindowChrome } from "@/features/control-center/WindowChrome";
import { useAgentSession } from "@/features/control-center/useAgentSession";
import { useCallback, useMemo, useState } from "react";

const BROWSER_SAMPLE_PROMPT =
  "Use workspace.inspect on the workspace root, then read preset/actuate-sample.txt and summarize it in a few sentences.";

export function ControlCenter() {
  const agent = useAgentSession();
  const { pendingPermission, resolvePermission, startRun } = agent;
  const [draft, setDraft] = useState(() => (isTauriRuntime() ? "" : BROWSER_SAMPLE_PROMPT));

  const canStart = agent.capabilities.canStartRun && draft.trim().length > 0;

  const submitTask = useCallback((): void => {
    if (!canStart) return;
    void startRun(draft.trim(), null);
    setDraft("");
  }, [canStart, draft, startRun]);

  const uiAutomationBusy = useMemo(() => countOpenUiAutomationTools(agent.events) > 0, [agent.events]);
  const pointerAutomationBusy = useMemo(() => countOpenPointerTools(agent.events) > 0, [agent.events]);

  const handlePermissionResolve = useCallback(
    (choice: PermissionChoice): void => {
      if (pendingPermission === null) return;
      resolvePermission(pendingPermission.permissionId, choice);
    },
    [pendingPermission, resolvePermission],
  );

  return (
    <div className="box-border flex h-full min-h-dvh w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#0E0E0E] p-2 shadow-none ring-0">
      <WindowChrome onResetSession={agent.resetSession} />

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex min-h-0 flex-1 flex-col gap-2 scrollbar-none">
          {!agent.capabilities.hasConversation && (
            <div className="flex flex-1 pt-48 px-2">
              <span className="max-w-sm text-2xl font-medium tracking-tight text-[#CDCDCD]">
                Ready to break some big tasks today?
              </span>
            </div>
          )}
          {agent.capabilities.hasConversation && (
            <AgentChatTranscript
              assistantStream={agent.assistantStream}
              canRegenerateAssistant={agent.capabilities.canRegenerateAssistant}
              onRegenerateAssistant={agent.regenerateLastAssistant}
              timeline={agent.timeline}
            />
          )}
        </div>
        <AgentEventLog rows={agent.eventLogRows} />
        <PointerAutomationEscBar
          escArmActive={isTauriRuntime() && uiAutomationBusy}
          pointerBusy={pointerAutomationBusy}
        />
      </div>

      <div className="shrink-0 space-y-2 py-2">
        {agent.failureMessage !== null && agent.failureMessage !== "" && (
          <TaskFailureBanner message={agent.failureMessage} />
        )}
        {agent.pendingPermission !== null && (
          <PermissionPrompt
            pending={agent.pendingPermission}
            onResolve={handlePermissionResolve}
          />
        )}
        <TaskPromptComposer
          value={draft}
          onChange={setDraft}
          onSubmit={submitTask}
          inputDisabled={agent.capabilities.taskInputDisabled}
          submitDisabled={!canStart}
        />
      </div>
    </div>
  );
}
