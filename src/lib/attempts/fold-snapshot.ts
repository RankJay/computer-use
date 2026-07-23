import { createFoldState, type FoldState } from "@/lib/session/project-session";
import type { SessionProjection } from "@/lib/session/projection";

import { ATTEMPT_FOLD_SNAPSHOT_VERSION, type AttemptFoldSnapshot } from "./types";

export function projectionToFoldSnapshot(projection: SessionProjection): AttemptFoldSnapshot {
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

export function isAttemptFoldSnapshot(value: unknown): value is AttemptFoldSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("version" in value) || value.version !== ATTEMPT_FOLD_SNAPSHOT_VERSION) {
    return false;
  }
  if (!("chatMessages" in value) || !Array.isArray(value.chatMessages)) {
    return false;
  }
  if (!("rows" in value) || !Array.isArray(value.rows)) {
    return false;
  }
  if (!("status" in value) || typeof value.status !== "string") {
    return false;
  }
  return true;
}
