import {
  applyAssistantStreamEvent,
  finalizeStreamingAssistant,
  trimLastAssistantMessage,
} from "@/agent/session/streamingAssembly";
import {
  countOpenPointerTools,
  countOpenUiAutomationTools,
} from "@/agent/session/uiAutomationDepth";
import {
  type AgentActivityRow,
  type AgentEvent,
  type AgentPendingPermission,
  type AgentRunStatus,
  type AgentTimelineItem,
} from "@/agent/types";

export type AgentSessionCapabilities = {
  readonly runActive: boolean;
  readonly canStartRun: boolean;
  readonly taskInputDisabled: boolean;
  readonly canRegenerateAssistant: boolean;
  readonly hasConversation: boolean;
  readonly uiAutomationBusy: boolean;
  readonly pointerAutomationBusy: boolean;
};

export type AgentSessionProjection = {
  readonly status: AgentRunStatus;
  /** Events for the active run only; cleared when a new run starts. */
  readonly currentRunEvents: readonly AgentEvent[];
  readonly timeline: readonly AgentTimelineItem[];
  readonly failureMessage: string | null;
  readonly pendingPermission: AgentPendingPermission | null;
  readonly capabilities: AgentSessionCapabilities;
};

type MutableProjection = {
  readonly status: AgentRunStatus;
  readonly currentRunEvents: readonly AgentEvent[];
  readonly timeline: readonly AgentTimelineItem[];
  readonly failureMessage: string | null;
  readonly pendingPermission: AgentPendingPermission | null;
};

type ActivityEvent = Extract<
  AgentEvent,
  {
    type:
      | "plan.updated"
      | "step.started"
      | "step.completed"
      | "permission.requested"
      | "permission.resolved"
      | "tool.started"
      | "tool.completed"
      | "screenshot.keyframe";
  }
>;

export function createInitialAgentProjection(): AgentSessionProjection {
  return completeProjection({
    status: "idle",
    currentRunEvents: [],
    timeline: [],
    failureMessage: null,
    pendingPermission: null,
  });
}

export function beginAgentRun(
  prev: AgentSessionProjection,
  options: Readonly<{
    userTimelineItem: AgentTimelineItem | null;
  }>,
): AgentSessionProjection {
  return completeProjection({
    status: "running",
    currentRunEvents: [],
    timeline:
      options.userTimelineItem === null
        ? prev.timeline
        : [...prev.timeline, options.userTimelineItem],
    failureMessage: null,
    pendingPermission: null,
  });
}

export function applyAgentEvent(
  prev: AgentSessionProjection,
  event: AgentEvent,
): AgentSessionProjection {
  const currentRunEvents = [...prev.currentRunEvents, event];

  switch (event.type) {
    case "task.created":
      return completeProjection({
        ...prev,
        currentRunEvents,
        status: "running",
      });
    case "plan.updated": {
      const timeline = finalizeStreamingAssistant(prev.timeline);
      return completeProjection({
        ...prev,
        currentRunEvents,
        timeline: appendActivityRow(timeline, event.taskId, event.at, activityRowFromEvent(event)),
      });
    }
    case "step.started": {
      const timeline = finalizeStreamingAssistant(prev.timeline);
      return completeProjection({
        ...prev,
        currentRunEvents,
        status: "running",
        timeline: appendActivityRow(timeline, event.taskId, event.at, activityRowFromEvent(event)),
      });
    }
    case "step.completed":
    case "tool.started":
    case "tool.completed":
    case "screenshot.keyframe": {
      const timeline = finalizeStreamingAssistant(prev.timeline);
      return completeProjection({
        ...prev,
        currentRunEvents,
        status: "running",
        timeline: appendActivityRow(timeline, event.taskId, event.at, activityRowFromEvent(event)),
      });
    }
    case "permission.requested": {
      const timeline = finalizeStreamingAssistant(prev.timeline);
      return completeProjection({
        ...prev,
        currentRunEvents,
        status: "awaiting_permission",
        timeline: appendActivityRow(timeline, event.taskId, event.at, activityRowFromEvent(event)),
        pendingPermission: {
          permissionId: event.permissionId,
          toolName: event.toolName,
          title: event.title,
          summary: event.summary,
          rationale: event.rationale,
          risk: event.risk,
          details: event.details,
        },
      });
    }
    case "permission.resolved": {
      const timeline = finalizeStreamingAssistant(prev.timeline);
      return completeProjection({
        ...prev,
        currentRunEvents,
        status: "running",
        timeline: appendActivityRow(timeline, event.taskId, event.at, activityRowFromEvent(event)),
        pendingPermission: null,
      });
    }
    case "assistant.text.delta":
    case "assistant.text.done": {
      return completeProjection({
        ...prev,
        currentRunEvents,
        status: "running",
        timeline: applyAssistantStreamEvent(prev.timeline, event),
      });
    }
    case "task.completed": {
      const timeline = finalizeStreamingAssistant(prev.timeline);
      return completeProjection({
        ...prev,
        currentRunEvents,
        status: "completed",
        timeline: setActivityStatus(timeline, event.taskId, "completed"),
      });
    }
    case "task.failed": {
      const timeline = finalizeStreamingAssistant(prev.timeline);
      return completeProjection({
        ...prev,
        currentRunEvents,
        status: "failed",
        timeline: setActivityStatus(timeline, event.taskId, "failed"),
        failureMessage: event.message,
      });
    }
    default: {
      const _never: never = event;
      return _never;
    }
  }
}

export function resetAgentProjection(): AgentSessionProjection {
  return createInitialAgentProjection();
}

export function trimLastAssistantTurn(prev: AgentSessionProjection): AgentSessionProjection {
  return completeProjection({
    ...prev,
    timeline: trimLastAssistantMessage(prev.timeline),
  });
}

export function findLastUserPrompt(projection: AgentSessionProjection): string | null {
  for (let i = projection.timeline.length - 1; i >= 0; i--) {
    const row = projection.timeline[i];
    if (row?.kind === "user") {
      const prompt = row.text.trim();
      return prompt.length > 0 ? prompt : null;
    }
  }

  return null;
}

function completeProjection(state: MutableProjection): AgentSessionProjection {
  return {
    ...state,
    capabilities: deriveCapabilities(state),
  };
}

function findLastActivityIndex(timeline: readonly AgentTimelineItem[], taskId: string): number {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const item = timeline[index];
    if (item?.kind === "activity" && item.taskId === taskId) {
      return index;
    }
  }
  return -1;
}

function createActivityItem(taskId: string, at: number, row: AgentActivityRow): AgentTimelineItem {
  return {
    id: row.id,
    at,
    kind: "activity",
    taskId,
    status: "active",
    rows: [row],
  };
}

/** Appends tool/plan rows; starts a new activity segment after intervening assistant text. */
function appendActivityRow(
  timeline: readonly AgentTimelineItem[],
  taskId: string,
  at: number,
  row: AgentActivityRow,
): readonly AgentTimelineItem[] {
  const existingIndex = findLastActivityIndex(timeline, taskId);

  if (existingIndex === -1) {
    return [...timeline, createActivityItem(taskId, at, row)];
  }

  const hasAssistantAfter = timeline
    .slice(existingIndex + 1)
    .some((item) => item.kind === "assistant");

  if (hasAssistantAfter) {
    const sealed = timeline.map((item, index) => {
      if (index !== existingIndex || item.kind !== "activity") return item;
      return { ...item, status: "completed" as const };
    });
    return [...sealed, createActivityItem(taskId, at, row)];
  }

  return timeline.map((item, index) => {
    if (index !== existingIndex || item.kind !== "activity") return item;
    return {
      ...item,
      at,
      status: "active",
      rows: [...item.rows, row],
    };
  });
}

function setActivityStatus(
  timeline: readonly AgentTimelineItem[],
  taskId: string,
  status: "completed" | "failed",
): readonly AgentTimelineItem[] {
  return timeline.map((item) =>
    item.kind === "activity" && item.taskId === taskId ? { ...item, status } : item,
  );
}

function activityRowFromEvent(event: ActivityEvent): AgentActivityRow {
  switch (event.type) {
    case "plan.updated":
      return {
        id: event.id,
        title: `Planned ${event.steps.length} ${event.steps.length === 1 ? "step" : "steps"}`,
        detail: event.steps.join("\n"),
      };
    case "step.started":
      return {
        id: event.id,
        title: `Started: ${event.title}`,
      };
    case "step.completed":
      return {
        id: event.id,
        title: `Completed step ${event.stepIndex + 1}`,
      };
    case "permission.requested":
      return {
        id: event.id,
        title: `Asked permission: ${event.summary}`,
        detail: event.rationale,
      };
    case "permission.resolved":
      return {
        id: event.id,
        title: `Permission ${event.choice.replace(/_/g, " ")}`,
      };
    case "tool.started":
      return {
        id: event.id,
        title: `Running ${event.toolName}`,
        detail: event.inputSummary,
      };
    case "tool.completed":
      return {
        id: event.id,
        title: `Finished ${event.toolName}`,
        detail: event.outputSummary,
      };
    case "screenshot.keyframe":
      return {
        id: event.id,
        title: "Captured screenshot",
        detail: event.label,
        screenshotDataUrl:
          event.imageBase64 !== undefined && event.imageBase64.length > 0
            ? `data:image/png;base64,${event.imageBase64}`
            : undefined,
      };
    default: {
      const _never: never = event;
      return _never;
    }
  }
}

function deriveCapabilities(state: MutableProjection): AgentSessionCapabilities {
  const runActive = state.status === "running" || state.status === "awaiting_permission";
  const last = state.timeline.length > 0 ? state.timeline[state.timeline.length - 1] : undefined;

  return {
    runActive,
    canStartRun: !runActive,
    taskInputDisabled: runActive,
    canRegenerateAssistant: last?.kind === "assistant" && last.status === "complete" && !runActive,
    hasConversation: state.timeline.length > 0 || state.status !== "idle",
    uiAutomationBusy: countOpenUiAutomationTools(state.currentRunEvents) > 0,
    pointerAutomationBusy: countOpenPointerTools(state.currentRunEvents) > 0,
  };
}
