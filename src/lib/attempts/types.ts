import type { RunStatus, RuntimeEvent } from "@/lib/session/events";
import type { MandateProjection } from "@/lib/session/projection";

export const ATTEMPT_FOLD_SNAPSHOT_VERSION = 2 as const;

/**
 * Fold checkpoint written on Attempt settle.
 * Open path = latest snapshot + event tail (ADR 0007).
 */
export type AttemptFoldSnapshot = MandateProjection & {
  version: typeof ATTEMPT_FOLD_SNAPSHOT_VERSION;
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
