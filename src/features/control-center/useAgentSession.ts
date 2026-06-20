import { useCallback, useMemo, useRef, useState } from "react";

import type { AgentNativeBridge } from "@/agent/native/nativeBridge";
import { PermissionResolverLifecycle } from "@/agent/permissions/permissionOrchestrator";
import {
  applyAgentEvent,
  beginAgentRun,
  createInitialAgentProjection,
  findLastUserPrompt,
  resetAgentProjection,
  trimLastAssistantTurn,
} from "@/agent/session/sessionProjection";
import {
  createAgentSessionRunnerHost,
  createAgentSessionRunners,
  resolveAgentWorkspaceRoot,
  runSelectedAgentSession,
} from "@/agent/session/sessionRunner";
import { createEventId } from "@/agent/types";
import type { AgentEvent, AgentTimelineItem, PermissionChoice, RunBudget } from "@/agent/types";
import { useSettings } from "@/app/providers/SettingsProvider";

export type ActiveRun = {
  readonly taskId: string;
  readonly controller: AbortController;
  readonly native: AgentNativeBridge | null;
};

type StartRunOptions = Readonly<{
  readonly echoUserPrompt?: boolean;
  readonly runBudgetOverride?: RunBudget;
  readonly conversationTimeline?: readonly AgentTimelineItem[];
}>;

type ActiveRunRef = {
  current: ActiveRun | null;
};

export function takeActiveRun(activeRunRef: ActiveRunRef): ActiveRun | null {
  const activeRun = activeRunRef.current;
  activeRunRef.current = null;
  return activeRun;
}

function clearActiveRunIfCurrent(activeRunRef: ActiveRunRef, activeRun: ActiveRun): void {
  if (activeRunRef.current === activeRun) {
    activeRunRef.current = null;
  }
}

export function useAgentSession() {
  const { settings, permissionMode, persistToolApproval, ready } = useSettings();

  const [projection, setProjection] = useState(createInitialAgentProjection);
  const permissionLifecycleRef = useRef(new PermissionResolverLifecycle());
  const activeRunRef = useRef<ActiveRun | null>(null);
  const runBusyRef = useRef(false);

  const waitForPermissionChoice = useCallback((permissionId: string) => {
    return permissionLifecycleRef.current.waitForChoice(permissionId);
  }, []);

  const resolvePermission = useCallback((permissionId: string, choice: PermissionChoice) => {
    permissionLifecycleRef.current.resolve(permissionId, choice);
  }, []);

  const ingestEvent = useCallback((event: AgentEvent) => {
    setProjection((prev) => applyAgentEvent(prev, event));
  }, []);

  const startRun = useCallback(
    async (
      prompt: string,
      workspaceOverride: string | null,
      opts?: StartRunOptions,
    ) => {
      if (!ready || runBusyRef.current) return;
      runBusyRef.current = true;

      const taskId = createEventId();
      const abortController = new AbortController();
      const host = createAgentSessionRunnerHost();
      const activeRun: ActiveRun = { taskId, controller: abortController, native: host.native };
      activeRunRef.current = activeRun;

      const echoUser = opts?.echoUserPrompt !== false;
      const userTimelineItem: AgentTimelineItem | null = echoUser
        ? { id: createEventId(), at: Date.now(), kind: "user", text: prompt }
        : null;
      const conversationTimeline =
        opts?.conversationTimeline ??
        (userTimelineItem === null ? projection.timeline : [...projection.timeline, userTimelineItem]);
      setProjection((prev) =>
        beginAgentRun(prev, {
          userTimelineItem,
        }),
      );

      const workspaceRoot = resolveAgentWorkspaceRoot(workspaceOverride, settings, host);

      try {
        if (host.native !== null) {
          try {
            await host.native.resetPointerAutomationCancel();
          } catch {
            /** ignore stale IPC errors */
          }
        }
        await runSelectedAgentSession(
          {
            taskId,
            prompt,
            conversationTimeline,
            settings,
            workspaceRoot,
            abortSignal: abortController.signal,
            permissionMode,
            native: host.native,
            runBudgetOverride: opts?.runBudgetOverride,
            emit: (event) => {
              if (activeRunRef.current?.taskId !== taskId) return;
              ingestEvent(event);
            },
            waitForPermissionChoice,
            persistAlwaysAllow: persistToolApproval,
          },
          createAgentSessionRunners(host),
        );
      } finally {
        runBusyRef.current = false;
        clearActiveRunIfCurrent(activeRunRef, activeRun);
      }
    },
    [ingestEvent, permissionMode, persistToolApproval, ready, settings, waitForPermissionChoice],
  );

  const regenerateLastAssistant = useCallback(() => {
    if (!ready || runBusyRef.current) return;

    const trimmed = trimLastAssistantTurn(projection);
    const lastPrompt = findLastUserPrompt(trimmed);
    if (!lastPrompt) return;

    setProjection(trimmed);

    void startRun(lastPrompt, null, { echoUserPrompt: false, conversationTimeline: trimmed.timeline });
  }, [projection, ready, startRun]);

  const cancelRun = useCallback(() => {
    const activeRun = activeRunRef.current;
    if (activeRun === null || activeRun.controller.signal.aborted) return;

    activeRun.controller.abort();
    permissionLifecycleRef.current.cancelAll();
    void activeRun.native?.cancelPointerAutomation().catch(() => {
      /** ignore stale IPC errors */
    });
  }, []);

  const resetSession = useCallback(() => {
    const activeRun = takeActiveRun(activeRunRef);
    activeRun?.controller.abort();
    void activeRun?.native?.cancelPointerAutomation().catch(() => {
      /** ignore stale IPC errors */
    });
    runBusyRef.current = false;
    permissionLifecycleRef.current.cancelAll();
    setProjection(resetAgentProjection());
  }, []);

  const capabilities = useMemo(
    () => ({
      ...projection.capabilities,
      canStartRun: projection.capabilities.canStartRun && ready,
      taskInputDisabled: projection.capabilities.taskInputDisabled || !ready,
      canRegenerateAssistant: projection.capabilities.canRegenerateAssistant && ready,
    }),
    [projection.capabilities, ready],
  );

  return {
    status: projection.status,
    currentRunEvents: projection.currentRunEvents,
    timeline: projection.timeline,
    failureMessage: projection.failureMessage,
    budget: projection.budget,
    usage: projection.usage,
    pendingPermission: projection.pendingPermission,
    capabilities,
    permissionMode,
    startRun,
    cancelRun,
    resolvePermission,
    resetSession,
    regenerateLastAssistant,
  };
}
