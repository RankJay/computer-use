import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAgentSession } from "@/hooks/useAgentSession";
import { useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowUp, Minus } from "lucide-react";
import { SettingsSheet } from "@/components/SettingsSheet";
import { AgentChatTranscript } from "@/components/agent/AgentChat";
import { PermissionPrompt } from "@/components/agent/PermissionPrompt";
import {
  AgentEventLog,
  AgentRunRibbon,
  lastTaskFailedMessage,
  TaskFailureBanner,
} from "@/components/agent/AgentSessionPanels";
import { isTauriRuntime } from "@/agent/nativeBridge";

async function minimizeActuateWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  await getCurrentWindow().minimize();
}

function onWindowDragMouseDown(e: React.MouseEvent): void {
  if (!isTauriRuntime()) return;
  if (e.button !== 0) return;
  void getCurrentWindow().startDragging();
}

export function ControlCenter() {
  const agent = useAgentSession();
  const [draft, setDraft] = useState(() =>
    isTauriRuntime()
      ? ""
      : "Use workspace.inspect on the workspace root, then read preset/actuate-sample.txt and summarize it in a few sentences.",
  );

  useQuery({
    queryKey: ["settings", "bootstrap"],
    queryFn: async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      return {
        app: "Actuate",
        savedAt: new Date().toISOString(),
      };
    },
  });

  const canStart = useMemo(() => {
    return (
      agent.status !== "running" &&
      agent.status !== "awaiting_permission" &&
      draft.trim().length > 0
    );
  }, [agent.status, draft]);

  const taskInputDisabled = agent.status === "running" || agent.status === "awaiting_permission";

  function submitTask(): void {
    if (!canStart) return;
    void agent.startRun(draft.trim(), null);
    setDraft("");
  }

  const hasConversation = useMemo(
    () =>
      agent.timeline.length > 0 ||
      agent.assistantStream.trim().length > 0 ||
      agent.status !== "idle",
    [agent.assistantStream, agent.status, agent.timeline],
  );

  const canRegenerateAssistant = useMemo(() => {
    const timeline = agent.timeline;
    const last = timeline.length > 0 ? timeline[timeline.length - 1] : undefined;
    return (
      last?.kind === "assistant" &&
      agent.assistantStream.trim() === "" &&
      agent.status !== "running" &&
      agent.status !== "awaiting_permission"
    );
  }, [agent.assistantStream, agent.status, agent.timeline]);

  const failureMessage = useMemo(() => {
    if (agent.status !== "failed") {
      return null;
    }
    return lastTaskFailedMessage(agent.events) ?? "The task failed.";
  }, [agent.events, agent.status]);

  return (
    <div className="box-border flex h-full min-h-dvh w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#0E0E0E] p-4 shadow-none ring-0">
      <div className="relative flex min-h-[44px] shrink-0 select-none items-center justify-between gap-3">
        <div
          data-tauri-drag-region
          role="presentation"
          onMouseDown={onWindowDragMouseDown}
          className="flex w-fit max-w-[min(100%,16rem)] cursor-grab items-center rounded-lg px-2 py-2 active:cursor-grabbing [-webkit-app-region:drag]"
        >
          <CardTitle className="text-[#414141]">Actuate</CardTitle>
        </div>
        <div className="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
          <SettingsSheet onResetSession={agent.resetSession} />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 bg-stone-900 shrink-0"
            aria-label="Minimize to taskbar"
            title="Minimize (app keeps running; use the tray menu to exit)"
            onClick={() => void minimizeActuateWindow()}
          >
            <Minus className="size-4" color="#CDCDCD" strokeWidth={2} />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <AgentRunRibbon
          currentPlan={agent.currentPlan}
          currentStep={agent.currentStep}
          lastSummary={agent.lastSummary}
          status={agent.status}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {!hasConversation && (
            <div className="flex flex-1 items-center px-2">
              <span className="max-w-sm text-3xl font-medium tracking-tight text-[#CDCDCD]">
                Ready to break some big tasks today?
              </span>
            </div>
          )}
          {hasConversation && (
            <AgentChatTranscript
              assistantStream={agent.assistantStream}
              canRegenerateAssistant={canRegenerateAssistant}
              onRegenerateAssistant={agent.regenerateLastAssistant}
              timeline={agent.timeline}
            />
          )}
        </div>
        <AgentEventLog events={agent.events} />
      </div>

      <div className="shrink-0 space-y-2 pb-4 pt-2">
        {failureMessage !== null && failureMessage !== "" && (
          <TaskFailureBanner message={failureMessage} />
        )}
        {agent.pendingPermission !== null && (
          <PermissionPrompt
            pending={agent.pendingPermission}
            onResolve={(choice) => {
              const p = agent.pendingPermission;
              if (p === null) return;
              agent.resolvePermission(p.permissionId, choice);
            }}
          />
        )}
        <form
          className="flex w-full items-center gap-1 rounded-[9999px] border-0 bg-[#121212] p-1.5 shadow-[inset_0_1px_#ffffff08,inset_0_0_0_1px_#ffffff08,0_0_0_1px_#0000001a,0_2px_2px_#0000001a,0_4px_4px_#0000001a,0_8px_8px_#0000001a]"
          onSubmit={(e) => {
            e.preventDefault();
            submitTask();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="How can I help you today?"
            disabled={taskInputDisabled}
            aria-label="Task"
            className="h-auto bg-transparent min-h-0 flex-1 shrink border-0 pl-2.5 py-1 text-sm leading-normal text-white shadow-none outline-none placeholder:text-neutral-500 focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent dark:shadow-none disabled:bg-transparent disabled:opacity-50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!canStart}
            aria-label="Run task"
            className=" shrink-0 rounded-full border-0 bg-[#2b2b2b] text-white shadow-none hover:bg-[#363636] focus-visible:ring-2 focus-visible:ring-neutral-600 disabled:pointer-events-none disabled:bg-[#252525]"
          >
            <ArrowUp className="size-4" strokeWidth={2} />
          </Button>
        </form>
      </div>
    </div>
  );
}
