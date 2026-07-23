import { TauriSqlMandatesPersistence } from "@/lib/mandates/adapters/tauri-sql-store";
import type { Mandate, MandateKind } from "@/lib/mandates/types";

export type CreateMandateInput = {
  kind?: MandateKind;
  id?: string;
  createdAt?: number;
};

export type MandatesPersistence = {
  create(input?: CreateMandateInput): Promise<Mandate>;
  get(id: string): Promise<Mandate | null>;
};

export function createMandatesPersistence(): MandatesPersistence {
  return new TauriSqlMandatesPersistence();
}
