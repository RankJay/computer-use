import { coalesceDurableEvents } from "@/lib/attempts/coalesce";
import type {
  AppendEventsInput,
  AttemptEventStore,
  BeginAttemptInput,
  SettleAttemptInput,
} from "@/lib/attempts/persistence";
import type { AttemptFoldSnapshot, AttemptRecord, MandateLedgerOpen } from "@/lib/attempts/types";
import type { RuntimeEvent } from "@/lib/session/events";

type MemoryAttempt = AttemptRecord & {
  events: RuntimeEvent[];
};

export class MemoryAttemptEventStore implements AttemptEventStore {
  private readonly attempts = new Map<string, MemoryAttempt>();

  async beginAttempt(input: BeginAttemptInput): Promise<void> {
    if (this.attempts.has(input.attemptId)) {
      return;
    }
    this.attempts.set(input.attemptId, {
      id: input.attemptId,
      mandateId: input.mandateId,
      startedAt: input.startedAt ?? Date.now(),
      settledAt: null,
      status: null,
      snapshotLastSeq: null,
      snapshot: null,
      events: [],
    });
  }

  async appendEvents(input: AppendEventsInput): Promise<number> {
    await this.beginAttempt({
      attemptId: input.attemptId,
      mandateId: input.mandateId,
    });
    const row = this.attempts.get(input.attemptId);
    if (!row) {
      throw new Error(`attempt ${input.attemptId} missing after begin`);
    }
    const compact = coalesceDurableEvents(input.events);
    row.events.push(...compact);
    return row.events.length;
  }

  async settleAttempt(input: SettleAttemptInput): Promise<void> {
    await this.beginAttempt({
      attemptId: input.attemptId,
      mandateId: input.mandateId,
    });
    const row = this.attempts.get(input.attemptId);
    if (!row) {
      throw new Error(`attempt ${input.attemptId} missing after begin`);
    }
    row.settledAt = input.settledAt ?? Date.now();
    row.status = input.status;
    row.snapshotLastSeq = input.lastSeq;
    row.snapshot = input.snapshot;
  }

  async getLastSeq(attemptId: string): Promise<number> {
    return this.attempts.get(attemptId)?.events.length ?? 0;
  }

  async loadForMandateOpen(mandateId: string): Promise<MandateLedgerOpen | null> {
    const ordered = [...this.attempts.values()]
      .filter((a) => a.mandateId === mandateId)
      .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));

    if (ordered.length === 0) {
      return null;
    }

    let baseIndex = -1;
    let snapshot: AttemptFoldSnapshot | null = null;
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const snap = ordered[i]?.snapshot;
      if (snap) {
        baseIndex = i;
        snapshot = snap;
        break;
      }
    }

    const events: RuntimeEvent[] = [];
    if (snapshot && baseIndex >= 0) {
      const base = ordered[baseIndex];
      if (!base) {
        return { snapshot, events };
      }
      const after = base.snapshotLastSeq ?? 0;
      events.push(...base.events.slice(after));
      for (let i = baseIndex + 1; i < ordered.length; i += 1) {
        const next = ordered[i];
        if (next) {
          events.push(...next.events);
        }
      }
    } else {
      for (const attempt of ordered) {
        events.push(...attempt.events);
      }
    }

    if (!snapshot && events.length === 0) {
      return null;
    }

    return { snapshot, events };
  }
}
