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
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/browserWorkspace";
import { createNativeBridge, isTauriRuntime } from "@/agent/nativeBridge";
import { PermissionResolverLifecycle } from "@/agent/permissionOrchestrator";
import { runDemoAgentSession } from "@/agent/mockRuntime";
import { runLiveAgentSession } from "@/agent/liveAgentSession";
import { loadSecretKey } from "@/agent/settingsApi";
import { SECRET_ANTHROPIC_API_KEY } from "@/agent/secrets";
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
      const native = createNativeBridge();

      const echoUser = opts?.echoUserPrompt !== false;
      setProjection((prev) =>
        beginAgentRun(prev, {
          userTimelineItem: echoUser
            ? { id: createEventId(), at: Date.now(), kind: "user", text: prompt }
            : null,
        }),
      );

      let workspaceRoot: string | null =
        workspaceOverride && workspaceOverride.trim().length > 0
          ? workspaceOverride.trim()
          : settings.workspaceRoot?.trim() || null;

      if (!workspaceRoot && !isTauriRuntime()) {
        workspaceRoot = BROWSER_SAMPLE_WORKSPACE_ROOT;
      }

      try {
        const isDemo = settings.agentMode === "demo";
        if (isDemo) {
          await runDemoAgentSession({
            taskId,
            prompt,
            native,
            workspaceRoot,
            emit: (event) => {
              if (activeTaskRef.current !== taskId) return;
              ingestEvent(event);
            },
            waitForPermissionChoice,
            permissionMode: permissionModeRef.current,
          });
        } else {
          let apiKey: string;
          try {
            apiKey = (await loadSecretKey(SECRET_ANTHROPIC_API_KEY))?.trim() ?? "";
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            ingestEvent({
              id: createEventId(),
              at: Date.now(),
              taskId,
              type: "task.failed",
              message: isTauriRuntime()
                ? `Could not read API key from OS credential store: ${message}`
                : `Could not read API key from browser storage: ${message}`,
            });
            return;
          }
          if (!apiKey) {
            ingestEvent({
              id: createEventId(),
              at: Date.now(),
              taskId,
              type: "task.failed",
              message: isTauriRuntime()
                ? "No Anthropic API key found in the OS store. Open Settings, save your key again, then retry."
                : "No Anthropic API key in browser storage. Open Settings → Save API key, then retry.",
            });
            return;
          }
          await runLiveAgentSession({
            taskId,
            prompt,
            apiKey,
            settings,
            workspaceRoot,
            permissionMode: permissionModeRef.current,
            emit: (event) => {
              if (activeTaskRef.current !== taskId) return;
              ingestEvent(event);
            },
            waitForPermissionChoice,
            persistAlwaysAllow: persistToolApproval,
          });
        }
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
