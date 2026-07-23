import { openLocalDb } from "@/lib/local-db";
import type {
  CreateMandateInput,
  MandatesPersistence,
  UpdateMandateInput,
} from "@/lib/mandates/persistence";
import type {
  Mandate,
  MandateKind,
  MandateLifecycleStatus,
  StandingPolicyDocument,
} from "@/lib/mandates/types";

type MandateRow = {
  id: string;
  created_at: number;
  kind: string;
  status: string | null;
  parent_mandate_id: string | null;
  standing_policy_json: string | null;
};

function stringArrayField(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    return undefined;
  }
  return value;
}

function parseStandingPolicy(raw: string | null): StandingPolicyDocument | null {
  if (raw == null || raw.length === 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  if (Reflect.get(parsed, "version") !== 1) {
    return null;
  }
  const allowCapabilities = stringArrayField(Reflect.get(parsed, "allowCapabilities"));
  const denyCapabilities = stringArrayField(Reflect.get(parsed, "denyCapabilities"));
  return {
    version: 1,
    ...(allowCapabilities ? { allowCapabilities } : {}),
    ...(denyCapabilities ? { denyCapabilities } : {}),
  };
}

function parseKind(raw: string): MandateKind {
  return raw === "interactive" ? "interactive" : "interactive";
}

function parseStatus(raw: string | null): MandateLifecycleStatus {
  switch (raw) {
    case "armed":
    case "running":
    case "paused":
    case "waiting_permission":
    case "done":
    case "failed":
      return raw;
    default:
      return "armed";
  }
}

function rowToMandate(row: MandateRow): Mandate {
  return {
    id: row.id,
    createdAt: row.created_at,
    kind: parseKind(row.kind),
    status: parseStatus(row.status),
    parentMandateId: row.parent_mandate_id,
    standingPolicy: parseStandingPolicy(row.standing_policy_json),
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
      status: input.status ?? "armed",
      parentMandateId: input.parentMandateId ?? null,
      standingPolicy: input.standingPolicy ?? null,
    };
    const db = await this.db();
    await db.execute(
      `INSERT INTO mandates (id, created_at, kind, status, parent_mandate_id, standing_policy_json)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        mandate.id,
        mandate.createdAt,
        mandate.kind,
        mandate.status,
        mandate.parentMandateId,
        mandate.standingPolicy ? JSON.stringify(mandate.standingPolicy) : null,
      ],
    );
    return mandate;
  }

  async get(id: string): Promise<Mandate | null> {
    const db = await this.db();
    const rows = await db.select<MandateRow[]>(
      `SELECT id, created_at, kind, status, parent_mandate_id, standing_policy_json
       FROM mandates WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    return row === undefined ? null : rowToMandate(row);
  }

  async update(id: string, patch: UpdateMandateInput): Promise<Mandate | null> {
    const existing = await this.get(id);
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
    const db = await this.db();
    await db.execute(
      `UPDATE mandates
       SET status = $2, parent_mandate_id = $3, standing_policy_json = $4
       WHERE id = $1`,
      [
        next.id,
        next.status,
        next.parentMandateId,
        next.standingPolicy ? JSON.stringify(next.standingPolicy) : null,
      ],
    );
    return next;
  }
}
