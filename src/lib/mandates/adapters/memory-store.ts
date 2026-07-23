import type {
  CreateMandateInput,
  MandatesPersistence,
  UpdateMandateInput,
} from "@/lib/mandates/persistence";
import type { Mandate } from "@/lib/mandates/types";

/** In-memory adapter for tests. */
export class MemoryMandatesPersistence implements MandatesPersistence {
  private readonly mandates = new Map<string, Mandate>();

  async create(input: CreateMandateInput = {}): Promise<Mandate> {
    const mandate: Mandate = {
      id: input.id ?? crypto.randomUUID(),
      createdAt: input.createdAt ?? Date.now(),
      kind: input.kind ?? "interactive",
      status: input.status ?? "armed",
      parentMandateId: input.parentMandateId ?? null,
      standingPolicy: input.standingPolicy ?? null,
    };
    this.mandates.set(mandate.id, mandate);
    return mandate;
  }

  async get(id: string): Promise<Mandate | null> {
    return this.mandates.get(id) ?? null;
  }

  async update(id: string, patch: UpdateMandateInput): Promise<Mandate | null> {
    const existing = this.mandates.get(id);
    if (!existing) {
      return null;
    }
    const next: Mandate = {
      ...existing,
      status: patch.status ?? existing.status,
      standingPolicy:
        patch.standingPolicy !== undefined ? patch.standingPolicy : existing.standingPolicy,
      parentMandateId:
        patch.parentMandateId !== undefined ? patch.parentMandateId : existing.parentMandateId,
    };
    this.mandates.set(id, next);
    return next;
  }
}
