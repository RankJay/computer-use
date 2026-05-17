import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyAgentEvent,
  beginAgentRun,
  createInitialAgentProjection,
  findLastUserPrompt,
  resetAgentProjection,
  trimLastAssistantTurn,
} from "@/agent/sessionProjection";
import { createEventId } from "@/agent/types";
import type { AgentEvent, PermissionChoice, PermissionMode } from "@/agent/types";
import { PermissionResolverLifecycle } from "@/agent/permissionOrchestrator";
import {
  createAgentSessionRunnerHost,
  createAgentSessionRunners,
  resolveAgentWorkspaceRoot,
  runSelectedAgentSession,
} from "@/agent/sessionRunner";
import { useSettings } from "@/providers/settings-provider";

export function useAgentSession() {
  const { settings, permissionMode, persistToolApproval } = useSettings();

  const [projection, setProjection] = useState(createInitialAgentProjection);
  const permissionLifecycleRef = useRef(new PermissionResolverLifecycle());
  const permissionModeRef = useRef<PermissionMode>("ask_risky");
  const activeTaskRef = useRef<string | null>(null);
  const runBusyRef = useRef(false);

  useEffect(() => {
    permissionModeRef.current = permissionMode;
  }, [permissionMode]);

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
      if (runBusyRef.current) return;
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
        await runSelectedAgentSession(
          {
            taskId,
            prompt,
            settings,
            workspaceRoot,
            permissionMode: permissionModeRef.current,
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
    [ingestEvent, persistToolApproval, settings, waitForPermissionChoice],
  );

  const regenerateLastAssistant = useCallback(() => {
    if (runBusyRef.current) return;

    const trimmed = trimLastAssistantTurn(projection);
    const lastPrompt = findLastUserPrompt(trimmed);
    if (!lastPrompt) return;

    setProjection(trimmed);

    void startRun(lastPrompt, null, { echoUserPrompt: false });
  }, [projection, startRun]);

  const resetSession = useCallback(() => {
    activeTaskRef.current = null;
    runBusyRef.current = false;
    permissionLifecycleRef.current.cancelAll();
    setProjection(resetAgentProjection());
  }, []);

  return {
    status: projection.status,
    events: projection.events,
    timeline: projection.timeline,
    assistantStream: projection.assistantStream,
    currentPlan: projection.currentPlan,
    currentStep: projection.currentStep,
    lastSummary: projection.lastSummary,
    failureMessage: projection.failureMessage,
    pendingPermission: projection.pendingPermission,
    eventLogRows: projection.eventLogRows,
    capabilities: projection.capabilities,
    permissionMode,
    startRun,
    resolvePermission,
    resetSession,
    regenerateLastAssistant,
  };
}
