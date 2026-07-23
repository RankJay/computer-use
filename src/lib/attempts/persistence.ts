import { MemoryAttemptEventStore } from "@/lib/attempts/adapters/memory-store";
import { TauriSqlAttemptEventStore } from "@/lib/attempts/adapters/tauri-sql-store";
import type { AttemptFoldSnapshot, MandateLedgerOpen } from "@/lib/attempts/types";
import { isTauriRuntime } from "@/lib/runtime/is-tauri-runtime";
import type { RuntimeEvent, RunStatus } from "@/lib/session/events";

export type BeginAttemptInput = {
  attemptId: string;
  mandateId: string;
  startedAt?: number;
};

export type AppendEventsInput = {
  attemptId: string;
  mandateId: string;
  events: readonly RuntimeEvent[];
};

export type SettleAttemptInput = {
  attemptId: string;
  mandateId: string;
  status: RunStatus;
  lastSeq: number;
  snapshot: AttemptFoldSnapshot;
  settledAt?: number;
};

/**
 * Durable Attempt event ledger — truth for recovery (ADR 0003 / 0007).
 * UIMessages remain a Chat Client checkpoint, not a second write-ahead log.
 */
export type AttemptEventStore = {
  beginAttempt(input: BeginAttemptInput): Promise<void>;
  /** Append events; implementation may coalesce part_updated before write. Returns last seq. */
  appendEvents(input: AppendEventsInput): Promise<number>;
  settleAttempt(input: SettleAttemptInput): Promise<void>;
  /** Latest snapshot + event tail for Mandate open. null if no ledger rows. */
  loadForMandateOpen(mandateId: string): Promise<MandateLedgerOpen | null>;
  /** Highest seq written for an Attempt (0 if none). */
  getLastSeq(attemptId: string): Promise<number>;
};

export function createAttemptEventStore(): AttemptEventStore {
  if (!isTauriRuntime()) {
    return new MemoryAttemptEventStore();
  }
  return new TauriSqlAttemptEventStore();
}
