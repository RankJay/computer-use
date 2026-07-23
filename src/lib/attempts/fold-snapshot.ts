import type { UIMessage } from "ai";
import { z } from "zod";

import { capabilityRiskSchema } from "@/lib/agent/capabilities/risk";
import { runStatusSchema, type LanguageModelUsageSnapshot } from "@/lib/session/events";
import { createFoldState, type FoldState } from "@/lib/session/fold";
import type { MandateProjection } from "@/lib/session/projection";
import type { AgentTranscriptRow } from "@/lib/session/rows";

import { ATTEMPT_FOLD_SNAPSHOT_VERSION, type AttemptFoldSnapshot } from "./types";

export function projectionToFoldSnapshot(projection: MandateProjection): AttemptFoldSnapshot {
  return {
    version: ATTEMPT_FOLD_SNAPSHOT_VERSION,
    taskId: projection.taskId,
    status: projection.status,
    failure: projection.failure,
    rows: projection.rows,
    chatMessages: projection.chatMessages,
    pendingPermissions: projection.pendingPermissions,
    usage: { ...projection.usage },
    budget: { ...projection.budget },
    streamingMessageId: projection.streamingMessageId,
  };
}

export function foldStateFromSnapshot(snapshot: AttemptFoldSnapshot): FoldState {
  return createFoldState(
    {
      taskId: snapshot.taskId,
      status: snapshot.status,
      failure: snapshot.failure,
      rows: snapshot.rows,
      chatMessages: snapshot.chatMessages,
      pendingPermissions: snapshot.pendingPermissions,
      usage: { ...snapshot.usage },
      budget: { ...snapshot.budget },
      streamingMessageId: snapshot.streamingMessageId,
    },
    new Set(),
  );
}

const TRANSCRIPT_ROW_TYPES = new Set(["marker", "message", "chain-of-thought", "task"]);

function isAgentTranscriptRow(value: unknown): value is AgentTranscriptRow {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }
  const type = value.type;
  return typeof type === "string" && TRANSCRIPT_ROW_TYPES.has(type);
}

function isUiMessage(value: unknown): value is UIMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("id" in value) || typeof value.id !== "string") {
    return false;
  }
  if (!("role" in value) || typeof value.role !== "string") {
    return false;
  }
  if (!("parts" in value) || !Array.isArray(value.parts)) {
    return false;
  }
  return true;
}

function isLanguageModelUsageSnapshot(value: unknown): value is LanguageModelUsageSnapshot {
  return typeof value === "object" && value !== null;
}

/**
 * Trust-boundary schema for fold snapshots loaded from SQLite JSON.
 * Nested transcript/message bodies stay structural (not full UIMessage Zod).
 * In-memory folds stay unvalidated (projection-owned).
 */
export const attemptFoldSnapshotSchema = z.object({
  version: z.literal(ATTEMPT_FOLD_SNAPSHOT_VERSION),
  taskId: z.string().nullable(),
  status: runStatusSchema,
  failure: z
    .object({
      code: z.string(),
      message: z.string(),
      recoverable: z.boolean(),
    })
    .nullable(),
  rows: z.array(z.custom<AgentTranscriptRow>(isAgentTranscriptRow)),
  chatMessages: z.array(z.custom<UIMessage>(isUiMessage)),
  pendingPermissions: z.array(
    z.object({
      callId: z.string(),
      capability: z.string(),
      input: z.unknown(),
      risk: capabilityRiskSchema,
    }),
  ),
  usage: z.object({
    modelId: z.string().nullable(),
    usage: z.custom<LanguageModelUsageSnapshot | null>(
      (value): value is LanguageModelUsageSnapshot | null =>
        value === null || isLanguageModelUsageSnapshot(value),
    ),
    usedTokens: z.number(),
    maxTokens: z.number(),
  }),
  budget: z.object({
    stepsUsed: z.number(),
    maxSteps: z.number(),
    costUsd: z.number(),
    maxCostUsd: z.number(),
    elapsedMs: z.number(),
    maxWallClockMs: z.number(),
  }),
  streamingMessageId: z.string().nullable(),
}) satisfies z.ZodType<AttemptFoldSnapshot>;

export function isAttemptFoldSnapshot(value: unknown): value is AttemptFoldSnapshot {
  return attemptFoldSnapshotSchema.safeParse(value).success;
}

export function parseAttemptFoldSnapshot(value: unknown): AttemptFoldSnapshot | null {
  const parsed = attemptFoldSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}
