import type { UIMessage } from "ai";

export const RUNTIME_EVENT_SCHEMA_VERSION = 1;

export type RunStatus =
  | "idle"
  | "running"
  | "streaming"
  | "waiting_permission"
  | "completed"
  | "failed"
  | "cancelled";

export type RuntimeEventEnvelope = {
  eventId: string;
  taskId: string;
  timestamp: number;
  schemaVersion: number;
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

export type TaskStartedPayload = {
  type: "task.started";
  prompt: string;
  modelId: string;
  agentMode: "live" | "demo";
  userMessageId?: string;
  /** When true (e.g. retry), do not append a new user message row. */
  omitUserMessage?: boolean;
};

export type TaskStatusChangedPayload = {
  type: "task.status_changed";
  status: RunStatus;
  reason?: string;
};

export type TaskCompletedPayload = {
  type: "task.completed";
  finishReason: "stop" | "budget" | "cancelled" | "error";
};

export type TaskFailedPayload = {
  type: "task.failed";
  code: string;
  message: string;
  recoverable: boolean;
};

export type AssistantMessageStartedPayload = {
  type: "assistant.message_started";
  messageId: string;
  role: "assistant";
};

export type AssistantPartUpdatedPayload = {
  type: "assistant.part_updated";
  messageId: string;
  partIndex: number;
  part: UIMessagePartSnapshot;
};

export type AssistantMessageFinishedPayload = {
  type: "assistant.message_finished";
  messageId: string;
};

export type CapabilityRequestedPayload = {
  type: "capability.requested";
  callId: string;
  capability: string;
  input: unknown;
};

export type CapabilityCompletedPayload = {
  type: "capability.completed";
  callId: string;
  capability: string;
  output: unknown;
};

export type CapabilityFailedPayload = {
  type: "capability.failed";
  callId: string;
  capability: string;
  error: { code: string; message: string; details?: string; cause?: string };
};

export type PermissionRequestedPayload = {
  type: "permission.requested";
  callId: string;
  capability: string;
  input: unknown;
  risk: "low" | "medium" | "high";
};

export type PermissionResolvedPayload = {
  type: "permission.resolved";
  callId: string;
  decision: "approved" | "denied";
  persisted?: boolean;
};

export type UsageUpdatedPayload = {
  type: "usage.updated";
  modelId: string;
  usage?: LanguageModelUsageSnapshot;
  usedTokens: number;
  maxTokens: number;
};

export type BudgetUpdatedPayload = {
  type: "budget.updated";
  stepsUsed: number;
  maxSteps: number;
  costUsd: number;
  maxCostUsd: number;
  elapsedMs: number;
  maxWallClockMs: number;
};

export type BudgetExceededPayload = {
  type: "budget.exceeded";
  dimension: "steps" | "cost" | "wall_clock";
};

export type ActivityMarkerPayload = {
  type: "activity.marker";
  markerId: string;
  variant?: "default" | "separator" | "border";
  text: string;
  live?: boolean;
  status?: boolean;
};

export type ActivityChainUpdatedPayload = {
  type: "activity.chain_updated";
  chainId: string;
  steps: Array<{
    label: string;
    description?: string;
    status?: "complete" | "active" | "pending";
    searchResults?: string[];
  }>;
};

export type ActivityTaskUpdatedPayload = {
  type: "activity.task_updated";
  activityTaskId: string;
  title: string;
  items: Array<string | { text: string; file?: { name: string } }>;
};

export type RuntimeEventPayload =
  | TaskStartedPayload
  | TaskStatusChangedPayload
  | TaskCompletedPayload
  | TaskFailedPayload
  | AssistantMessageStartedPayload
  | AssistantPartUpdatedPayload
  | AssistantMessageFinishedPayload
  | CapabilityRequestedPayload
  | CapabilityCompletedPayload
  | CapabilityFailedPayload
  | PermissionRequestedPayload
  | PermissionResolvedPayload
  | UsageUpdatedPayload
  | BudgetUpdatedPayload
  | BudgetExceededPayload
  | ActivityMarkerPayload
  | ActivityChainUpdatedPayload
  | ActivityTaskUpdatedPayload;

export type RuntimeEvent = RuntimeEventEnvelope & RuntimeEventPayload;

export function isRuntimeEvent(value: unknown): value is RuntimeEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "eventId" in value &&
    "taskId" in value &&
    "schemaVersion" in value
  );
}
