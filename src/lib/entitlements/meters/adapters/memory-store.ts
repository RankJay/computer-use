import type { MeterStore } from "@/lib/entitlements/meters/persistence";

function key(subjectId: string, meterKey: string, periodKey: string): string {
  return `${subjectId}\0${meterKey}\0${periodKey}`;
}

/** In-memory adapter for tests. */
export class MemoryMeterStore implements MeterStore {
  private readonly values = new Map<string, number>();

  async get(subjectId: string, meterKey: string, periodKey: string): Promise<number> {
    return this.values.get(key(subjectId, meterKey, periodKey)) ?? 0;
  }

  async increment(
    subjectId: string,
    meterKey: string,
    periodKey: string,
    amount: number,
  ): Promise<number> {
    const k = key(subjectId, meterKey, periodKey);
    const next = (this.values.get(k) ?? 0) + amount;
    this.values.set(k, next);
    return next;
  }
}
