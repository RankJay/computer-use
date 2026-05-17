import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEventId } from "@/agent/types";
import type {
  AgentEvent,
  AgentRunStatus,
  AgentTimelineItem,
  PermissionChoice,
  PermissionMode,
} from "@/agent/types";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/browserWorkspace";
import { createNativeBridge, isTauriRuntime } from "@/agent/nativeBridge";
import { runDemoAgentSession } from "@/agent/mockRuntime";
import { runLiveAgentSession } from "@/agent/liveAgentSession";
import { loadSecretKey } from "@/agent/settingsApi";
import { SECRET_ANTHROPIC_API_KEY } from "@/agent/secrets";
import { useSettings } from "@/providers/settings-provider";

type TaskView = {
  currentPlan: readonly string[];
  currentStep: string | null;
};

function reduceAgentEvent(event: AgentEvent, prev: TaskView): TaskView {
  switch (event.type) {
    case "task.created":
      return prev;
    case "plan.updated":
      return { ...prev, currentPlan: event.steps };
    case "step.started":
      return { ...prev, currentStep: event.title };
    case "step.completed":
      return prev;
    case "permission.requested":
      return prev;
    case "permission.resolved":
      return prev;
    case "tool.started":
      return prev;
    case "tool.completed":
      return prev;
    case "screenshot.keyframe":
      return prev;
    case "assistant.text.delta":
      return prev;
    case "assistant.text.done":
      return prev;
    case "task.completed":
      return { ...prev, currentStep: null };
    case "task.failed":
      return { ...prev, currentStep: null };
    default: {
      const _never: never = event;
      return _never;
    }
  }
}

function nextStatusAfterEvent(event: AgentEvent, prev: AgentRunStatus): AgentRunStatus {
  switch (event.type) {
    case "task.created":
      return "running";
    case "plan.updated":
      return prev;
    case "step.started":
      return "running";
    case "step.completed":
      return "running";
    case "permission.requested":
      return "awaiting_permission";
    case "permission.resolved":
      return "running";
    case "tool.started":
      return "running";
    case "tool.completed":
      return "running";
    case "screenshot.keyframe":
      return "running";
    case "assistant.text.delta":
      return "running";
    case "assistant.text.done":
      return "running";
    case "task.completed":
      return "completed";
    case "task.failed":
      return "failed";
    default: {
      const _never: never = event;
      return _never;
    }
  }
}

export type AgentPendingPermission = {
  readonly permissionId: string;
  readonly toolName?: string;
  readonly title: string;
  readonly summary: string;
  readonly rationale: string;
  readonly risk: string;
  readonly details: string;
};

export function useAgentSession() {
  const { settings, permissionMode, persistToolApproval } = useSettings();

  const [status, setStatus] = useState<AgentRunStatus>("idle");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [timeline, setTimeline] = useState<AgentTimelineItem[]>([]);
  const [assistantStream, setAssistantStream] = useState("");
  const [taskView, setTaskView] = useState<TaskView>({
    currentPlan: [],
    currentStep: null,
  });
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [pendingPermission, setPendingPermission] = useState<AgentPendingPermission | null>(null);

  const assistantBufferRef = useRef("");
  const permissionResolversRef = useRef(new Map<string, (choice: PermissionChoice) => void>());
  const permissionModeRef = useRef<PermissionMode>("ask_risky");
  const activeTaskRef = useRef<string | null>(null);
  const runBusyRef = useRef(false);

  useEffect(() => {
    permissionModeRef.current = permissionMode;
  }, [permissionMode]);

  const waitForPermissionChoice = useCallback((permissionId: string) => {
    if (permissionModeRef.current === "session_low_risk") {
      return Promise.resolve<PermissionChoice>("allow_once");
    }

    return new Promise<PermissionChoice>((resolve) => {
      permissionResolversRef.current.set(permissionId, resolve);
    });
  }, []);

  const resolvePermission = useCallback((permissionId: string, choice: PermissionChoice) => {
    const resolve = permissionResolversRef.current.get(permissionId);
    if (!resolve) return;
    resolve(choice);
    permissionResolversRef.current.delete(permissionId);
  }, []);

  const ingestEvent = useCallback((event: AgentEvent) => {
    setEvents((prev) => [...prev, event]);

    if (event.type === "assistant.text.delta") {
      assistantBufferRef.current += event.text;
      setAssistantStream(assistantBufferRef.current);
      setStatus((prev) => nextStatusAfterEvent(event, prev));
      return;
    }

    if (event.type === "assistant.text.done") {
      const text = assistantBufferRef.current.trim();
      assistantBufferRef.current = "";
      setAssistantStream("");
      if (text) {
        setTimeline((prev) => [
          ...prev,
          { id: createEventId(), at: Date.now(), kind: "assistant", text },
        ]);
      }
      setStatus((prev) => nextStatusAfterEvent(event, prev));
      return;
    }

    if (event.type === "permission.requested") {
      setPendingPermission({
        permissionId: event.permissionId,
        toolName: event.toolName,
        title: event.title,
        summary: event.summary,
        rationale: event.rationale,
        risk: event.risk,
        details: event.details,
      });
    }

    if (event.type === "permission.resolved") {
      setPendingPermission(null);
    }

    if (event.type === "task.completed") {
      setLastSummary(event.summary);
    }

    setTaskView((prev) => reduceAgentEvent(event, prev));
    setStatus((prev) => nextStatusAfterEvent(event, prev));
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

      assistantBufferRef.current = "";
      setAssistantStream("");
      setEvents([]);
      setTaskView({ currentPlan: [], currentStep: null });
      setLastSummary(null);
      setPendingPermission(null);
      setStatus("running");

      const echoUser = opts?.echoUserPrompt !== false;
      if (echoUser) {
        setTimeline((prev) => [
          ...prev,
          { id: createEventId(), at: Date.now(), kind: "user", text: prompt },
        ]);
      }

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

    const trimmed = [...timeline];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1]?.kind === "assistant") {
      trimmed.pop();
    }

    let lastPrompt: string | null = null;
    for (let i = trimmed.length - 1; i >= 0; i--) {
      const row = trimmed[i];
      if (row && row.kind === "user") {
        lastPrompt = row.text.trim();
        break;
      }
    }

    if (!lastPrompt) return;

    assistantBufferRef.current = "";
    setAssistantStream("");
    setTimeline(trimmed);

    void startRun(lastPrompt, null, { echoUserPrompt: false });
  }, [timeline, startRun]);

  const resetSession = useCallback(() => {
    activeTaskRef.current = null;
    runBusyRef.current = false;
    permissionResolversRef.current.clear();
    assistantBufferRef.current = "";
    setAssistantStream("");
    setEvents([]);
    setTimeline([]);
    setTaskView({ currentPlan: [], currentStep: null });
    setLastSummary(null);
    setPendingPermission(null);
    setStatus("idle");
  }, []);

  const derived = useMemo(
    () => ({
      currentPlan: taskView.currentPlan,
      currentStep: taskView.currentStep,
    }),
    [taskView],
  );

  return {
    status,
    events,
    timeline,
    assistantStream,
    currentPlan: derived.currentPlan,
    currentStep: derived.currentStep,
    lastSummary,
    permissionMode,
    pendingPermission,
    startRun,
    resolvePermission,
    resetSession,
    regenerateLastAssistant,
  };
}
