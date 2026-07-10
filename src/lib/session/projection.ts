import type { UIMessage } from "ai";

import { getDefaultAgentModel } from "@/lib/agent-models";

import type { LanguageModelUsageSnapshot, RunStatus } from "./events";
import type { AgentTranscriptRow } from "./rows";

export type SessionFailure = {
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

export type SessionUsage = {
  modelId: string | null;
  usage: LanguageModelUsageSnapshot | null;
  usedTokens: number;
  maxTokens: number;
};

export type SessionBudget = {
  stepsUsed: number;
  maxSteps: number;
  costUsd: number;
  maxCostUsd: number;
  elapsedMs: number;
  maxWallClockMs: number;
};

/** Canonical session read model. Control flags are derived elsewhere — never stored. */
export type SessionProjection = {
  taskId: string | null;
  status: RunStatus;
  failure: SessionFailure | null;
  rows: AgentTranscriptRow[];
  chatMessages: UIMessage[];
  pendingPermissions: PendingPermission[];
  usage: SessionUsage;
  budget: SessionBudget;
  streamingMessageId: string | null;
};

export const EMPTY_SESSION_BUDGET: SessionBudget = {
  stepsUsed: 0,
  maxSteps: 50,
  costUsd: 0,
  maxCostUsd: 5,
  elapsedMs: 0,
  maxWallClockMs: 900_000,
};

export const EMPTY_SESSION_USAGE: SessionUsage = {
  modelId: null,
  usage: null,
  usedTokens: 0,
  maxTokens: getDefaultAgentModel().contextWindowTokens,
};

export function createEmptySessionProjection(): SessionProjection {
  return {
    taskId: null,
    status: "idle",
    failure: null,
    rows: [],
    chatMessages: [],
    pendingPermissions: [],
    usage: { ...EMPTY_SESSION_USAGE },
    budget: { ...EMPTY_SESSION_BUDGET },
    streamingMessageId: null,
  };
}
