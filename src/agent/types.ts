import { generateId } from "ai";

export type AgentRunStatus = "idle" | "running" | "awaiting_permission" | "completed" | "failed";

export type PermissionMode = "ask_risky" | "ask_all" | "session_low_risk";

export type PermissionChoice = "allow_once" | "allow_session" | "allow_always" | "deny";

export function parsePermissionMode(value: string): PermissionMode {
  switch (value) {
    case "ask_risky":
    case "ask_all":
    case "session_low_risk":
      return value;
    default:
      return "ask_risky";
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

export type AgentTimelineItem =
  | { id: string; at: number; kind: "user"; text: string }
  | {
      id: string;
      at: number;
      kind: "assistant";
      text: string;
      status: "streaming" | "complete";
    }
  | {
      id: string;
      at: number;
      kind: "activity";
      taskId: string;
      status: "active" | "completed" | "failed";
      rows: readonly AgentActivityRow[];
    };

export type AgentActivityRow = {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  /** Inline PNG preview for display capture rows (`data:image/png;base64,...`). */
  readonly screenshotDataUrl?: string;
};

export type AgentEventBase = {
  id: string;
  at: number;
  taskId: string;
};

export type TaskCreatedEvent = AgentEventBase & {
  type: "task.created";
  prompt: string;
};

export type PlanUpdatedEvent = AgentEventBase & {
  type: "plan.updated";
  steps: readonly string[];
};

export type StepStartedEvent = AgentEventBase & {
  type: "step.started";
  stepIndex: number;
  title: string;
};

export type StepCompletedEvent = AgentEventBase & {
  type: "step.completed";
  stepIndex: number;
};

export type PermissionRequestedEvent = AgentEventBase & {
  type: "permission.requested";
  permissionId: string;
  /** Contract id when this prompt originates from a classified tool (policy + persistence). */
  toolName?: string;
  title: string;
  summary: string;
  rationale: string;
  risk: string;
  details: string;
};

export type PermissionResolvedEvent = AgentEventBase & {
  type: "permission.resolved";
  permissionId: string;
  choice: PermissionChoice;
};

export type ToolStartedEvent = AgentEventBase & {
  type: "tool.started";
  toolName: string;
  inputSummary: string;
};

export type ToolCompletedEvent = AgentEventBase & {
  type: "tool.completed";
  toolName: string;
  outputSummary: string;
};

export type ScreenshotKeyframeEvent = AgentEventBase & {
  type: "screenshot.keyframe";
  label: string;
  imageBase64?: string;
};

export type AssistantTextDeltaEvent = AgentEventBase & {
  type: "assistant.text.delta";
  text: string;
};

export type AssistantTextDoneEvent = AgentEventBase & {
  type: "assistant.text.done";
};

export type TaskCompletedEvent = AgentEventBase & {
  type: "task.completed";
  summary: string;
};

export type TaskFailedEvent = AgentEventBase & {
  type: "task.failed";
  message: string;
};

export type AgentEvent =
  | TaskCreatedEvent
  | PlanUpdatedEvent
  | StepStartedEvent
  | StepCompletedEvent
  | PermissionRequestedEvent
  | PermissionResolvedEvent
  | ToolStartedEvent
  | ToolCompletedEvent
  | ScreenshotKeyframeEvent
  | AssistantTextDeltaEvent
  | AssistantTextDoneEvent
  | TaskCompletedEvent
  | TaskFailedEvent;

/** Emit an agent event for the current task run (runner + tools). */
export type EmitFn = (event: AgentEvent) => void;

export function createEventId(): string {
  return generateId();
}
