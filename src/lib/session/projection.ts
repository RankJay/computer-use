import type { UIMessage } from "ai";

import { getDefaultAgentModel } from "@/lib/agent-models";

import type { LanguageModelUsageSnapshot, RunStatus } from "./events";
import type { AgentTranscriptRow } from "./rows";

export type AttemptFailure = {
  code: string;
  message: string;
  recoverable: boolean;
};

export type PendingPermission = {
  callId: string;
  capability: string;
  input: unknown;
  risk: "low" | "medium" | "high";
};

export type AttemptUsage = {
  modelId: string | null;
  usage: LanguageModelUsageSnapshot | null;
  usedTokens: number;
  maxTokens: number;
};

export type AttemptBudget = {
  stepsUsed: number;
  maxSteps: number;
  costUsd: number;
  maxCostUsd: number;
  elapsedMs: number;
  maxWallClockMs: number;
};

/** Mandate-scoped audit/UI read model (fold of Attempt events + live tail). */
export type MandateProjection = {
  taskId: string | null;
  status: RunStatus;
  failure: AttemptFailure | null;
  rows: AgentTranscriptRow[];
  chatMessages: UIMessage[];
  pendingPermissions: PendingPermission[];
  usage: AttemptUsage;
  budget: AttemptBudget;
  streamingMessageId: string | null;
};

export const EMPTY_ATTEMPT_BUDGET: AttemptBudget = {
  stepsUsed: 0,
  maxSteps: 50,
  costUsd: 0,
  maxCostUsd: 5,
  elapsedMs: 0,
  maxWallClockMs: 900_000,
};

export const EMPTY_ATTEMPT_USAGE: AttemptUsage = {
  modelId: null,
  usage: null,
  usedTokens: 0,
  maxTokens: getDefaultAgentModel().contextWindowTokens,
};

/** Shared empty pending list — fold clears must reuse this, never `[]`. */
export const EMPTY_PENDING_PERMISSIONS: PendingPermission[] = [];

export function createEmptyMandateProjection(): MandateProjection {
  return {
    taskId: null,
    status: "idle",
    failure: null,
    rows: [],
    chatMessages: [],
    pendingPermissions: EMPTY_PENDING_PERMISSIONS,
    usage: { ...EMPTY_ATTEMPT_USAGE },
    budget: { ...EMPTY_ATTEMPT_BUDGET },
    streamingMessageId: null,
  };
}
