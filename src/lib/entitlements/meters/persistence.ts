import { MemoryMeterStore } from "@/lib/entitlements/meters/adapters/memory-store";
import { TauriSqlMeterStore } from "@/lib/entitlements/meters/adapters/tauri-sql-store";
import { isTauriRuntime } from "@/lib/runtime/is-tauri-runtime";

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
  if (!isTauriRuntime()) {
    return new MemoryMeterStore();
  }
  return new TauriSqlMeterStore();
}
