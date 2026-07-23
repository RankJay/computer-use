import { openLocalDb } from "@/lib/local-db";
import type { CreateMandateInput, MandatesPersistence } from "@/lib/mandates/persistence";
import type { Mandate, MandateKind } from "@/lib/mandates/types";

type MandateRow = {
  id: string;
  created_at: number;
  kind: string;
};

function rowToMandate(row: MandateRow): Mandate {
  return {
    id: row.id,
    createdAt: row.created_at,
    kind: row.kind as MandateKind,
  };
}

export class TauriSqlMandatesPersistence implements MandatesPersistence {
  private db() {
    return openLocalDb();
  }

  async create(input: CreateMandateInput = {}): Promise<Mandate> {
    const mandate: Mandate = {
      id: input.id ?? crypto.randomUUID(),
      createdAt: input.createdAt ?? Date.now(),
      kind: input.kind ?? "interactive",
    };
    const db = await this.db();
    await db.execute("INSERT INTO mandates (id, created_at, kind) VALUES ($1, $2, $3)", [
      mandate.id,
      mandate.createdAt,
      mandate.kind,
    ]);
    return mandate;
  }

  async get(id: string): Promise<Mandate | null> {
    const db = await this.db();
    const rows = await db.select<MandateRow[]>(
      "SELECT id, created_at, kind FROM mandates WHERE id = $1",
      [id],
    );
    const row = rows[0];
    return row === undefined ? null : rowToMandate(row);
  }
}
