import { useCallback, useState } from "react";

import { hostRuntime } from "@/agent/host/hostRuntime";
import type { PermissionChoice } from "@/agent/types";
import { Container, Item } from "@/components/motion/stagger";
import { AgentChatTranscript } from "@/features/agent-chat/AgentChatTranscript";
import {
  PointerAutomationEscBar,
  TaskFailureBanner,
} from "@/features/agent-chat/AgentSessionPanels";
import { PermissionPrompt } from "@/features/agent-chat/PermissionPrompt";
import { useAgentSessionContext } from "@/features/control-center/AgentSessionProvider";
import { TaskPromptComposer } from "@/features/control-center/TaskPromptComposer";
import { WindowChrome } from "@/features/control-center/WindowChrome";

export function ControlCenter() {
  const agent = useAgentSessionContext();
  const { pendingPermission, resolvePermission, startRun } = agent;
  const [draft, setDraft] = useState(() => hostRuntime.defaultComposerDraft);

  const canStart = agent.capabilities.canStartRun && draft.trim().length > 0;

  const submitTask = useCallback((): void => {
    if (!canStart) return;
    void startRun(draft.trim(), null);
    setDraft("");
  }, [canStart, draft, startRun]);

  const handlePermissionResolve = useCallback(
    (choice: PermissionChoice): void => {
      if (pendingPermission === null) return;
      resolvePermission(pendingPermission.permissionId, choice);
    },
    [pendingPermission, resolvePermission],
  );

  return (
    <div className="box-border overscroll-contain flex h-full min-h-dvh w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#0E0E0E] p-2 shadow-none ring-0">
      <WindowChrome />

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <Container className="flex min-h-0 flex-1 flex-col gap-2 scrollbar-none">
          {!agent.capabilities.hasConversation && (
            <div className="flex flex-col flex-1 pt-48 px-4">
              <Item className="max-w-sm text-2xl mb-2 text-[#414141] tracking-tight">
                Welcome to actuate.
              </Item>
              <Item className="max-w-xs text-2xl tracking-tight text-[#CDCDCD]">
                Ready to break some big tasks today?
              </Item>
            </div>
          )}
          {agent.capabilities.hasConversation && (
            <AgentChatTranscript
              canRegenerateAssistant={agent.capabilities.canRegenerateAssistant}
              onRegenerateAssistant={agent.regenerateLastAssistant}
              timeline={agent.timeline}
              isRunActive={agent.capabilities.runActive}
            />
          )}
        </Container>
        <PointerAutomationEscBar
          escArmActive={hostRuntime.isDesktop && agent.capabilities.uiAutomationBusy}
          pointerBusy={agent.capabilities.pointerAutomationBusy}
        />
      </div>

      <div className="shrink-0 space-y-2 py-2">
        {agent.failureMessage !== null && agent.failureMessage !== "" && (
          <TaskFailureBanner message={agent.failureMessage} />
        )}
        {agent.pendingPermission !== null && (
          <PermissionPrompt pending={agent.pendingPermission} onResolve={handlePermissionResolve} />
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
