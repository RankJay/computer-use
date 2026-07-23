import { TauriSqlMeterStore } from "@/lib/entitlements/meters/adapters/tauri-sql-store";

export type MeterStore = {
  get(subjectId: string, meterKey: string, periodKey: string): Promise<number>;
  /** Atomically add `amount`; returns the new total. */
  increment(
    subjectId: string,
    meterKey: string,
    periodKey: string,
    amount: number,
  ): Promise<number>;
};

export function createMeterStore(): MeterStore {
  return new TauriSqlMeterStore();
}
