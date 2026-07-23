import type { CreateMandateInput, MandatesPersistence } from "@/lib/mandates/persistence";
import type { Mandate } from "@/lib/mandates/types";

/** In-memory adapter for tests. */
export class MemoryMandatesPersistence implements MandatesPersistence {
  private readonly mandates = new Map<string, Mandate>();

  async create(input: CreateMandateInput = {}): Promise<Mandate> {
    const mandate: Mandate = {
      id: input.id ?? crypto.randomUUID(),
      createdAt: input.createdAt ?? Date.now(),
      kind: input.kind ?? "interactive",
    };
    this.mandates.set(mandate.id, mandate);
    return mandate;
  }

  async get(id: string): Promise<Mandate | null> {
    return this.mandates.get(id) ?? null;
  }
}
