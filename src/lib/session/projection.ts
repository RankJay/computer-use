import type { UIMessage } from "ai";

import type { AgentTranscriptRow } from "@/features/ai-chat/types";
import { getDefaultAgentModel } from "@/lib/agent-models";

import type { LanguageModelUsageSnapshot, RunStatus } from "./events";

export type SessionFailure = {
  code: string;
  message: string;
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

export type SessionProjection = {
  taskId: string | null;
  status: RunStatus;
  failure: SessionFailure | null;
  rows: AgentTranscriptRow[];
  chatMessages: UIMessage[];
  pendingPermission: PendingPermission | null;
  usage: SessionUsage;
  budget: SessionBudget;
  canSubmit: boolean;
  canCancel: boolean;
  cancelVisible: boolean;
  inputDisabled: boolean;
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
    pendingPermission: null,
    usage: { ...EMPTY_SESSION_USAGE },
    budget: { ...EMPTY_SESSION_BUDGET },
    canSubmit: true,
    canCancel: false,
    cancelVisible: false,
    inputDisabled: false,
  };
}

export function deriveControlFlags(status: RunStatus): {
  canSubmit: boolean;
  canCancel: boolean;
  cancelVisible: boolean;
  inputDisabled: boolean;
} {
  const active = status === "running" || status === "streaming" || status === "waiting_permission";

  return {
    canSubmit: !active,
    canCancel: active,
    cancelVisible: active,
    inputDisabled: active,
  };
}
