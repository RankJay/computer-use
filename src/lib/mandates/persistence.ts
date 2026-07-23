import { isTauriRuntime } from "@/lib/agent/is-tauri-runtime";
import { MemoryMandatesPersistence } from "@/lib/mandates/adapters/memory-store";
import { TauriSqlMandatesPersistence } from "@/lib/mandates/adapters/tauri-sql-store";
import type {
  Mandate,
  MandateKind,
  MandateLifecycleStatus,
  MandateSuccessCriteria,
  StandingPolicyDocument,
} from "@/lib/mandates/types";

export type CreateMandateInput = {
  kind?: MandateKind;
  id?: string;
  createdAt?: number;
  status?: MandateLifecycleStatus;
  parentMandateId?: string | null;
  standingPolicy?: StandingPolicyDocument | null;
  successCriteria?: MandateSuccessCriteria;
};

export type UpdateMandateInput = {
  status?: MandateLifecycleStatus;
  standingPolicy?: StandingPolicyDocument | null;
  parentMandateId?: string | null;
  successCriteria?: MandateSuccessCriteria;
};

export type MandatesPersistence = {
  create(input?: CreateMandateInput): Promise<Mandate>;
  get(id: string): Promise<Mandate | null>;
  update(id: string, patch: UpdateMandateInput): Promise<Mandate | null>;
};

export function createMandatesPersistence(): MandatesPersistence {
  if (!isTauriRuntime()) {
    return new MemoryMandatesPersistence();
  }
  return new TauriSqlMandatesPersistence();
}
