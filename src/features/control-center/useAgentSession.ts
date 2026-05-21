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
import type { AgentEvent, PermissionChoice, RunBudget } from "@/agent/types";
import { useSettings } from "@/app/providers/SettingsProvider";

export function useAgentSession() {
  const { settings, permissionMode, persistToolApproval, ready } = useSettings();

  const [projection, setProjection] = useState(createInitialAgentProjection);
  const permissionLifecycleRef = useRef(new PermissionResolverLifecycle());
  const activeTaskRef = useRef<string | null>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeNativeRef = useRef<AgentNativeBridge | null>(null);
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
      opts?: Readonly<{ echoUserPrompt?: boolean; runBudgetOverride?: RunBudget }>,
    ) => {
      if (!ready || runBusyRef.current) return;
      runBusyRef.current = true;

      const taskId = createEventId();
      const abortController = new AbortController();
      activeTaskRef.current = taskId;
      activeAbortControllerRef.current = abortController;
      const host = createAgentSessionRunnerHost();
      activeNativeRef.current = host.native;

      const echoUser = opts?.echoUserPrompt !== false;
      setProjection((prev) =>
        beginAgentRun(prev, {
          userTimelineItem: echoUser
            ? { id: createEventId(), at: Date.now(), kind: "user", text: prompt }
            : null,
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
            settings,
            workspaceRoot,
            abortSignal: abortController.signal,
            permissionMode,
            native: host.native,
            runBudgetOverride: opts?.runBudgetOverride,
            emit: (event) => {
              if (activeTaskRef.current !== taskId) return;
              ingestEvent(event);
            },
            waitForPermissionChoice,
            persistAlwaysAllow: persistToolApproval,
          },
          createAgentSessionRunners(host),
        );
      } finally {
        runBusyRef.current = false;
        if (activeTaskRef.current === taskId) {
          activeTaskRef.current = null;
        }
        if (activeAbortControllerRef.current === abortController) {
          activeAbortControllerRef.current = null;
          activeNativeRef.current = null;
        }
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

    void startRun(lastPrompt, null, { echoUserPrompt: false });
  }, [projection, ready, startRun]);

  const cancelRun = useCallback(() => {
    const controller = activeAbortControllerRef.current;
    if (controller === null || controller.signal.aborted) return;

    controller.abort();
    permissionLifecycleRef.current.cancelAll();
    void activeNativeRef.current?.cancelPointerAutomation().catch(() => {
      /** ignore stale IPC errors */
    });
  }, []);

  const resetSession = useCallback(() => {
    activeAbortControllerRef.current?.abort();
    void activeNativeRef.current?.cancelPointerAutomation().catch(() => {
      /** ignore stale IPC errors */
    });
    activeTaskRef.current = null;
    activeAbortControllerRef.current = null;
    activeNativeRef.current = null;
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
