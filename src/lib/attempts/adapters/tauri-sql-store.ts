import { coalesceDurableEvents } from "@/lib/attempts/coalesce";
import { isAttemptFoldSnapshot } from "@/lib/attempts/fold-snapshot";
import type {
  AppendEventsInput,
  AttemptEventStore,
  BeginAttemptInput,
  SettleAttemptInput,
} from "@/lib/attempts/persistence";
import type { AttemptFoldSnapshot, MandateLedgerOpen } from "@/lib/attempts/types";
import { openLocalDb } from "@/lib/local-db";
import { isRuntimeEvent, type RuntimeEvent } from "@/lib/session/events";

type AttemptRow = {
  id: string;
  mandate_id: string;
  started_at: number;
  settled_at: number | null;
  status: string | null;
  snapshot_last_seq: number | null;
  snapshot_json: string | null;
};

type EventRow = {
  attempt_id: string;
  seq: number;
  event_json: string;
};

function parseSnapshot(json: string | null): AttemptFoldSnapshot | null {
  if (json === null || json.length === 0) {
    return null;
  }
  const parsed: unknown = JSON.parse(json);
  return isAttemptFoldSnapshot(parsed) ? parsed : null;
}

function parseEvent(json: string): RuntimeEvent {
  const parsed: unknown = JSON.parse(json);
  if (!isRuntimeEvent(parsed)) {
    throw new Error("attempt_events.event_json is not a RuntimeEvent");
  }
  return parsed;
}

export class TauriSqlAttemptEventStore implements AttemptEventStore {
  private db() {
    return openLocalDb();
  }

  async beginAttempt(input: BeginAttemptInput): Promise<void> {
    const db = await this.db();
    await db.execute(
      `INSERT INTO attempts (id, mandate_id, started_at, settled_at, status, snapshot_last_seq, snapshot_json)
       VALUES ($1, $2, $3, NULL, NULL, NULL, NULL)
       ON CONFLICT(id) DO NOTHING`,
      [input.attemptId, input.mandateId, input.startedAt ?? Date.now()],
    );
  }

  async appendEvents(input: AppendEventsInput): Promise<number> {
    await this.beginAttempt({
      attemptId: input.attemptId,
      mandateId: input.mandateId,
    });
    const compact = coalesceDurableEvents(input.events);
    if (compact.length === 0) {
      return this.getLastSeq(input.attemptId);
    }

    const db = await this.db();
    const last = await this.getLastSeq(input.attemptId);
    let seq = last;
    for (const event of compact) {
      seq += 1;
      await db.execute(
        `INSERT INTO attempt_events (attempt_id, mandate_id, seq, event_json)
         VALUES ($1, $2, $3, $4)`,
        [input.attemptId, input.mandateId, seq, JSON.stringify(event)],
      );
    }
    return seq;
  }

  async settleAttempt(input: SettleAttemptInput): Promise<void> {
    await this.beginAttempt({
      attemptId: input.attemptId,
      mandateId: input.mandateId,
    });
    const db = await this.db();
    await db.execute(
      `UPDATE attempts
       SET settled_at = $1,
           status = $2,
           snapshot_last_seq = $3,
           snapshot_json = $4
       WHERE id = $5`,
      [
        input.settledAt ?? Date.now(),
        input.status,
        input.lastSeq,
        JSON.stringify(input.snapshot),
        input.attemptId,
      ],
    );
  }

  async getLastSeq(attemptId: string): Promise<number> {
    const db = await this.db();
    const rows = await db.select<{ max_seq: number | null }[]>(
      "SELECT MAX(seq) AS max_seq FROM attempt_events WHERE attempt_id = $1",
      [attemptId],
    );
    return rows[0]?.max_seq ?? 0;
  }

  async loadForMandateOpen(mandateId: string): Promise<MandateLedgerOpen | null> {
    const db = await this.db();
    const attemptRows = await db.select<AttemptRow[]>(
      `SELECT id, mandate_id, started_at, settled_at, status, snapshot_last_seq, snapshot_json
       FROM attempts
       WHERE mandate_id = $1
       ORDER BY started_at ASC, id ASC`,
      [mandateId],
    );

    if (attemptRows.length === 0) {
      return null;
    }

    let baseIndex = -1;
    let snapshot: AttemptFoldSnapshot | null = null;
    for (let i = attemptRows.length - 1; i >= 0; i -= 1) {
      const snap = parseSnapshot(attemptRows[i]?.snapshot_json ?? null);
      if (snap) {
        baseIndex = i;
        snapshot = snap;
        break;
      }
    }

    const events: RuntimeEvent[] = [];

    if (snapshot && baseIndex >= 0) {
      const base = attemptRows[baseIndex];
      if (!base) {
        return { snapshot, events };
      }
      const afterSeq = base.snapshot_last_seq ?? 0;
      events.push(...(await this.loadEvents(base.id, afterSeq)));
      for (let i = baseIndex + 1; i < attemptRows.length; i += 1) {
        const next = attemptRows[i];
        if (next) {
          events.push(...(await this.loadEvents(next.id, 0)));
        }
      }
    } else {
      for (const row of attemptRows) {
        events.push(...(await this.loadEvents(row.id, 0)));
      }
    }

    if (!snapshot && events.length === 0) {
      return null;
    }

    return { snapshot, events };
  }

  private async loadEvents(attemptId: string, afterSeq: number): Promise<RuntimeEvent[]> {
    const db = await this.db();
    const rows = await db.select<EventRow[]>(
      `SELECT attempt_id, seq, event_json
       FROM attempt_events
       WHERE attempt_id = $1 AND seq > $2
       ORDER BY seq ASC`,
      [attemptId, afterSeq],
    );
    return rows.map((row) => parseEvent(row.event_json));
  }
}
