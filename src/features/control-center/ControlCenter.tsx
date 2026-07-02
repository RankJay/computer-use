import { useCallback, useState } from "react";

import { hostRuntime } from "@/agent/host/hostRuntime";
import type { PermissionChoice } from "@/agent/types";
import { Container, Item } from "@/components/motion/stagger";
import { AgentChatTranscript } from "@/features/agent-chat/AgentChatTranscript";
import {
  DisplayNoticeToast,
  PointerAutomationEscBar,
  TaskBudgetBanner,
  TaskFailureBanner,
} from "@/features/agent-chat/AgentSessionPanels";
import { PermissionPrompt } from "@/features/agent-chat/PermissionPrompt";
import { useAgentSessionContext } from "@/features/control-center/AgentSessionContext";
import { TaskPromptComposer } from "@/features/control-center/TaskPromptComposer";
import { dismissDisplayNotice, useDisplayNotice } from "@/features/control-center/useDisplayNotice";
import { WindowChrome } from "@/features/control-center/WindowChrome";

export function ControlCenter() {
  const agent = useAgentSessionContext();
  const { cancelRun, pendingPermission, resolvePermission, startRun } = agent;
  const [draft, setDraft] = useState(() => hostRuntime.defaultComposerDraft);
  const displayNotice = useDisplayNotice();
  const [displayNoticeVisible, setDisplayNoticeVisible] = useState(true);

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
              usage={agent.usage}
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
        {displayNotice !== null && displayNoticeVisible && (
          <DisplayNoticeToast
            displayCount={displayNotice.displayCount}
            onDismiss={() => {
              dismissDisplayNotice();
              setDisplayNoticeVisible(false);
            }}
          />
        )}
        {agent.budget.exceededLimit !== null && agent.budget.progress !== null && (
          <TaskBudgetBanner limit={agent.budget.exceededLimit} progress={agent.budget.progress} />
        )}
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
          onCancel={cancelRun}
          inputDisabled={agent.capabilities.taskInputDisabled}
          submitDisabled={!canStart}
          cancelVisible={agent.capabilities.runActive}
        />
      </div>
    </div>
  );
}
