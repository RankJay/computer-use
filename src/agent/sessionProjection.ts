import type {
  AgentEvent,
  AgentPendingPermission,
  AgentRunStatus,
  AgentTimelineItem,
} from "@/agent/types";

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
        currentPlan: event.steps,
      });
    case "step.started":
      return completeProjection({
        ...prev,
        events,
        status: "running",
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
      });
    case "permission.requested":
      return completeProjection({
        ...prev,
        events,
        status: "awaiting_permission",
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
        pendingPermission: null,
      });
    case "assistant.text.delta":
      return completeProjection({
        ...prev,
        events,
        status: "running",
        assistantStream: prev.assistantStream + event.text,
      });
    case "assistant.text.done": {
      const text = prev.assistantStream.trim();
      return completeProjection({
        ...prev,
        events,
        status: "running",
        assistantStream: "",
        timeline:
          text.length === 0
            ? prev.timeline
            : [...prev.timeline, { id: event.id, at: event.at, kind: "assistant", text }],
      });
    }
    case "task.completed":
      return completeProjection({
        ...prev,
        events,
        status: "completed",
        currentStep: null,
        lastSummary: event.summary,
      });
    case "task.failed":
      return completeProjection({
        ...prev,
        events,
        status: "failed",
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
  const timeline = [...prev.timeline];

  while (timeline.length > 0 && timeline[timeline.length - 1]?.kind === "assistant") {
    timeline.pop();
  }

  return completeProjection({
    ...prev,
    timeline,
    assistantStream: "",
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
