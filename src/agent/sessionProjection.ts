import type {
  AgentActivityRow,
  AgentEvent,
  AgentPendingPermission,
  AgentRunStatus,
  AgentTimelineItem,
} from "@/agent/types";
import { applyAssistantStreamEvent, trimLastAssistantMessage } from "@/agent/streamingAssembly";

export type AgentEventLogRow = {
  readonly id: string;
  readonly title: string;
};

export type AgentSessionCapabilities = {
  readonly canStartRun: boolean;
  readonly taskInputDisabled: boolean;
  readonly canRegenerateAssistant: boolean;
  readonly hasConversation: boolean;
};

export type AgentSessionProjection = {
  readonly status: AgentRunStatus;
  readonly events: readonly AgentEvent[];
  readonly timeline: readonly AgentTimelineItem[];
  readonly assistantStream: string;
  readonly currentPlan: readonly string[];
  readonly currentStep: string | null;
  readonly lastSummary: string | null;
  readonly failureMessage: string | null;
  readonly pendingPermission: AgentPendingPermission | null;
  readonly eventLogRows: readonly AgentEventLogRow[];
  readonly capabilities: AgentSessionCapabilities;
};

type MutableProjection = {
  readonly status: AgentRunStatus;
  readonly events: readonly AgentEvent[];
  readonly timeline: readonly AgentTimelineItem[];
  readonly assistantStream: string;
  readonly currentPlan: readonly string[];
  readonly currentStep: string | null;
  readonly lastSummary: string | null;
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
    events: [],
    timeline: [],
    assistantStream: "",
    currentPlan: [],
    currentStep: null,
    lastSummary: null,
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
    events: [],
    timeline:
      options.userTimelineItem === null
        ? prev.timeline
        : [...prev.timeline, options.userTimelineItem],
    assistantStream: "",
    currentPlan: [],
    currentStep: null,
    lastSummary: null,
    failureMessage: null,
    pendingPermission: null,
  });
}

export function applyAgentEvent(
  prev: AgentSessionProjection,
  event: AgentEvent,
): AgentSessionProjection {
  const events = [...prev.events, event];

  switch (event.type) {
    case "task.created":
      return completeProjection({
        ...prev,
        events,
        status: "running",
      });
    case "plan.updated":
      return completeProjection({
        ...prev,
        events,
        timeline: appendActivityRow(prev.timeline, event.taskId, activityRowFromEvent(event)),
        currentPlan: event.steps,
      });
    case "step.started":
      return completeProjection({
        ...prev,
        events,
        status: "running",
        timeline: appendActivityRow(prev.timeline, event.taskId, activityRowFromEvent(event)),
        currentStep: event.title,
      });
    case "step.completed":
    case "tool.started":
    case "tool.completed":
    case "screenshot.keyframe":
      return completeProjection({
        ...prev,
        events,
        status: "running",
        timeline: appendActivityRow(prev.timeline, event.taskId, activityRowFromEvent(event)),
      });
    case "permission.requested":
      return completeProjection({
        ...prev,
        events,
        status: "awaiting_permission",
        timeline: appendActivityRow(prev.timeline, event.taskId, activityRowFromEvent(event)),
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
    case "permission.resolved":
      return completeProjection({
        ...prev,
        events,
        status: "running",
        timeline: appendActivityRow(prev.timeline, event.taskId, activityRowFromEvent(event)),
        pendingPermission: null,
      });
    case "assistant.text.delta":
    case "assistant.text.done": {
      const assembly = applyAssistantStreamEvent(prev, event);
      return completeProjection({
        ...prev,
        events,
        status: "running",
        timeline: assembly.timeline,
        assistantStream: assembly.assistantStream,
      });
    }
    case "task.completed":
      return completeProjection({
        ...prev,
        events,
        status: "completed",
        timeline: setActivityStatus(prev.timeline, event.taskId, "completed"),
        currentStep: null,
        lastSummary: event.summary,
      });
    case "task.failed":
      return completeProjection({
        ...prev,
        events,
        status: "failed",
        timeline: setActivityStatus(prev.timeline, event.taskId, "failed"),
        currentStep: null,
        failureMessage: event.message,
      });
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
  const assembly = trimLastAssistantMessage(prev);
  return completeProjection({
    ...prev,
    timeline: assembly.timeline,
    assistantStream: assembly.assistantStream,
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

export function formatAgentEventTitle(event: AgentEvent): string {
  switch (event.type) {
    case "task.created":
      return "Task created";
    case "plan.updated":
      return "Plan updated";
    case "step.started":
      return `Step started: ${event.title}`;
    case "step.completed":
      return `Step completed (${event.stepIndex})`;
    case "permission.requested":
      return "Permission requested";
    case "permission.resolved":
      return `Permission resolved (${event.choice})`;
    case "tool.started":
      return `Tool started: ${event.toolName}`;
    case "tool.completed":
      return `Tool completed: ${event.toolName}`;
    case "screenshot.keyframe":
      return `Screenshot: ${event.label}`;
    case "assistant.text.delta":
      return "Assistant streaming";
    case "assistant.text.done":
      return "Assistant message complete";
    case "task.completed":
      return "Task completed";
    case "task.failed":
      return "Task failed";
    default: {
      const _never: never = event;
      return _never;
    }
  }
}

function completeProjection(state: MutableProjection): AgentSessionProjection {
  const eventLogRows = state.events
    .filter((event) => event.type !== "assistant.text.delta")
    .map((event) => ({ id: event.id, title: formatAgentEventTitle(event) }));

  return {
    ...state,
    eventLogRows,
    capabilities: deriveCapabilities(state),
  };
}

function appendActivityRow(
  timeline: readonly AgentTimelineItem[],
  taskId: string,
  row: AgentActivityRow,
): readonly AgentTimelineItem[] {
  const existingIndex = timeline.findIndex(
    (item) => item.kind === "activity" && item.taskId === taskId,
  );

  if (existingIndex === -1) {
    return [
      ...timeline,
      {
        id: row.id,
        at: Date.now(),
        kind: "activity",
        taskId,
        status: "active",
        rows: [row],
      },
    ];
  }

  return timeline.map((item, index) => {
    if (index !== existingIndex || item.kind !== "activity") return item;
    return {
      ...item,
      at: Date.now(),
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
      };
    default: {
      const _never: never = event;
      return _never;
    }
  }
}

function deriveCapabilities(state: MutableProjection): AgentSessionCapabilities {
  const busy = state.status === "running" || state.status === "awaiting_permission";
  const last = state.timeline.length > 0 ? state.timeline[state.timeline.length - 1] : undefined;

  return {
    canStartRun: !busy,
    taskInputDisabled: busy,
    canRegenerateAssistant:
      last?.kind === "assistant" && state.assistantStream.trim() === "" && !busy,
    hasConversation:
      state.timeline.length > 0 ||
      state.assistantStream.trim().length > 0 ||
      state.status !== "idle",
  };
}
