import type { UIMessage } from "ai";

import type { LanguageModelUsageSnapshot, RunStatus, RuntimeEvent } from "@/lib/session/events";
import type { AttemptBudget, AttemptFailure, PendingPermission } from "@/lib/session/projection";
import type { AgentTranscriptRow } from "@/lib/session/rows";

export const ATTEMPT_FOLD_SNAPSHOT_VERSION = 1 as const;

/**
 * Fold checkpoint written on Attempt settle.
 * Open path = latest snapshot + event tail (ADR 0007).
 */
export type AttemptFoldSnapshot = {
  version: typeof ATTEMPT_FOLD_SNAPSHOT_VERSION;
  taskId: string | null;
  status: RunStatus;
  failure: AttemptFailure | null;
  rows: AgentTranscriptRow[];
  chatMessages: UIMessage[];
  pendingPermissions: PendingPermission[];
  usage: {
    modelId: string | null;
    usage: LanguageModelUsageSnapshot | null;
    usedTokens: number;
    maxTokens: number;
  };
  budget: AttemptBudget;
  streamingMessageId: string | null;
};

export type AttemptRecord = {
  id: string;
  mandateId: string;
  startedAt: number;
  settledAt: number | null;
  status: RunStatus | null;
  snapshotLastSeq: number | null;
  snapshot: AttemptFoldSnapshot | null;
};

/** Result of opening a Mandate from the durable ledger. */
export type MandateLedgerOpen = {
  snapshot: AttemptFoldSnapshot | null;
  events: RuntimeEvent[];
};
