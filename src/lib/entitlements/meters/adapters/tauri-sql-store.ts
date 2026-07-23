import type { MeterStore } from "@/lib/entitlements/meters/persistence";
import { openLocalDb } from "@/lib/local-db";

type MeterRow = {
  value: number;
};

export class TauriSqlMeterStore implements MeterStore {
  private db() {
    return openLocalDb();
  }

  async get(subjectId: string, meterKey: string, periodKey: string): Promise<number> {
    const db = await this.db();
    const rows = await db.select<MeterRow[]>(
      `SELECT value FROM meters
       WHERE subject_id = $1 AND meter_key = $2 AND period_key = $3`,
      [subjectId, meterKey, periodKey],
    );
    return rows[0]?.value ?? 0;
  }

  async increment(
    subjectId: string,
    meterKey: string,
    periodKey: string,
    amount: number,
  ): Promise<number> {
    const db = await this.db();
    await db.execute(
      `INSERT INTO meters (subject_id, meter_key, period_key, value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(subject_id, meter_key, period_key)
       DO UPDATE SET value = value + excluded.value`,
      [subjectId, meterKey, periodKey, amount],
    );
    return this.get(subjectId, meterKey, periodKey);
  }
}
