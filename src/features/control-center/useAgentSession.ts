import { useCallback, useMemo, useRef, useState } from "react";

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
import type { AgentEvent, PermissionChoice } from "@/agent/types";
import { useSettings } from "@/app/providers/SettingsProvider";

export function useAgentSession() {
  const { settings, permissionMode, persistToolApproval, ready } = useSettings();

  const [projection, setProjection] = useState(createInitialAgentProjection);
  const permissionLifecycleRef = useRef(new PermissionResolverLifecycle());
  const activeTaskRef = useRef<string | null>(null);
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
      opts?: Readonly<{ echoUserPrompt?: boolean }>,
    ) => {
      if (!ready || runBusyRef.current) return;
      runBusyRef.current = true;

      const taskId = createEventId();
      activeTaskRef.current = taskId;
      const host = createAgentSessionRunnerHost();

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
            permissionMode,
            native: host.native,
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

  const resetSession = useCallback(() => {
    activeTaskRef.current = null;
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
    events: projection.events,
    timeline: projection.timeline,
    failureMessage: projection.failureMessage,
    pendingPermission: projection.pendingPermission,
    capabilities,
    permissionMode,
    startRun,
    resolvePermission,
    resetSession,
    regenerateLastAssistant,
  };
}
