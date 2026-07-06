import type { UIMessage } from "ai";

export type RunStatus =
  | "idle"
  | "running"
  | "streaming"
  | "waiting_permission"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type RuntimeEventBase = {
  eventId: string;
  taskId: string;
  timestamp: number;
};

/** JSON-serializable UI message part for event payloads. */
export type UIMessagePartSnapshot = UIMessage["parts"][number];

export type LanguageModelUsageSnapshot = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTokenDetails?: {
    noCacheTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  outputTokenDetails?: {
    textTokens?: number;
    reasoningTokens?: number;
  };
};

export type TaskStartedEvent = RuntimeEventBase & {
  type: "task.started";
  prompt: string;
  modelId: string;
  agentMode: "live" | "demo";
  userMessageId?: string;
};

export type TaskStatusChangedEvent = RuntimeEventBase & {
  type: "task.status_changed";
  status: RunStatus;
  reason?: string;
};

export type TaskCompletedEvent = RuntimeEventBase & {
  type: "task.completed";
  finishReason: "stop" | "budget" | "cancelled" | "error";
};

export type TaskFailedEvent = RuntimeEventBase & {
  type: "task.failed";
  code: string;
  message: string;
  recoverable: boolean;
};

export type AssistantMessageStartedEvent = RuntimeEventBase & {
  type: "assistant.message_started";
  messageId: string;
  role: "assistant";
};

export type AssistantPartUpdatedEvent = RuntimeEventBase & {
  type: "assistant.part_updated";
  messageId: string;
  partIndex: number;
  part: UIMessagePartSnapshot;
};

export type AssistantMessageFinishedEvent = RuntimeEventBase & {
  type: "assistant.message_finished";
  messageId: string;
};

export type CapabilityRequestedEvent = RuntimeEventBase & {
  type: "capability.requested";
  callId: string;
  capability: string;
  input: unknown;
};

export type CapabilityCompletedEvent = RuntimeEventBase & {
  type: "capability.completed";
  callId: string;
  capability: string;
  output: unknown;
};

export type CapabilityFailedEvent = RuntimeEventBase & {
  type: "capability.failed";
  callId: string;
  capability: string;
  error: { code: string; message: string; details?: string; cause?: string };
};

export type PermissionRequestedEvent = RuntimeEventBase & {
  type: "permission.requested";
  callId: string;
  capability: string;
  input: unknown;
  risk: "low" | "medium" | "high";
};

export type PermissionResolvedEvent = RuntimeEventBase & {
  type: "permission.resolved";
  callId: string;
  decision: "approved" | "denied";
  persisted?: boolean;
};

export type UsageUpdatedEvent = RuntimeEventBase & {
  type: "usage.updated";
  modelId: string;
  usage: LanguageModelUsageSnapshot;
  usedTokens: number;
  maxTokens: number;
};

export type BudgetUpdatedEvent = RuntimeEventBase & {
  type: "budget.updated";
  stepsUsed: number;
  maxSteps: number;
  costUsd: number;
  maxCostUsd: number;
  elapsedMs: number;
  maxWallClockMs: number;
};

export type BudgetExceededEvent = RuntimeEventBase & {
  type: "budget.exceeded";
  dimension: "steps" | "cost" | "wall_clock";
};

export type ActivityMarkerEvent = RuntimeEventBase & {
  type: "activity.marker";
  markerId: string;
  variant?: "default" | "separator" | "border";
  text: string;
  live?: boolean;
  status?: boolean;
};

export type ActivityChainUpdatedEvent = RuntimeEventBase & {
  type: "activity.chain_updated";
  chainId: string;
  steps: Array<{
    label: string;
    description?: string;
    status?: "complete" | "active" | "pending";
    searchResults?: string[];
  }>;
};

export type ActivityTaskUpdatedEvent = RuntimeEventBase & {
  type: "activity.task_updated";
  activityTaskId: string;
  title: string;
  items: Array<string | { text: string; file?: { name: string } }>;
};

export type RuntimeEvent =
  | TaskStartedEvent
  | TaskStatusChangedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | AssistantMessageStartedEvent
  | AssistantPartUpdatedEvent
  | AssistantMessageFinishedEvent
  | CapabilityRequestedEvent
  | CapabilityCompletedEvent
  | CapabilityFailedEvent
  | PermissionRequestedEvent
  | PermissionResolvedEvent
  | UsageUpdatedEvent
  | BudgetUpdatedEvent
  | BudgetExceededEvent
  | ActivityMarkerEvent
  | ActivityChainUpdatedEvent
  | ActivityTaskUpdatedEvent;

export type RuntimeEventPayload = {
  [Type in RuntimeEvent["type"]]: Omit<
    Extract<RuntimeEvent, { type: Type }>,
    "eventId" | "taskId" | "timestamp"
  >;
}[RuntimeEvent["type"]];

export function isRuntimeEvent(value: unknown): value is RuntimeEvent {
  return typeof value === "object" && value !== null && "type" in value && "eventId" in value;
}
