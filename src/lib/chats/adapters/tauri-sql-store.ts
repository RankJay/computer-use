import type { ChatsPersistence } from "@/lib/chats/persistence";
import type { ChatSummary, StoredChat } from "@/lib/chats/types";
import { openLocalDb } from "@/lib/local-db";

type ChatSummaryRow = {
  id: string;
  title: string;
  updated_at: number;
};

type ChatRow = {
  id: string;
  title: string;
  model_id: string;
  mandate_id: string;
  created_at: number;
  updated_at: number;
};

function rowToStoredChat(row: ChatRow): StoredChat {
  if (row.mandate_id.length === 0) {
    throw new Error(`chats.mandate_id missing for chat ${row.id}`);
  }
  if (row.mandate_id === row.id) {
    throw new Error(`chats.mandate_id must not equal chat id (${row.id})`);
  }
  return {
    id: row.id,
    title: row.title,
    modelId: row.model_id,
    mandateId: row.mandate_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TauriSqlChatsPersistence implements ChatsPersistence {
  private db() {
    return openLocalDb();
  }

  async list(): Promise<ChatSummary[]> {
    const db = await this.db();
    const rows = await db.select<ChatSummaryRow[]>(
      "SELECT id, title, updated_at FROM chats ORDER BY updated_at DESC",
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
    }));
  }

  async load(id: string): Promise<StoredChat | null> {
    const db = await this.db();
    const rows = await db.select<ChatRow[]>(
      "SELECT id, title, model_id, mandate_id, created_at, updated_at FROM chats WHERE id = $1",
      [id],
    );
    const row = rows[0];
    return row === undefined ? null : rowToStoredChat(row);
  }

  async save(chat: StoredChat): Promise<void> {
    if (chat.mandateId.length === 0) {
      throw new Error("StoredChat.mandateId is required");
    }
    if (chat.mandateId === chat.id) {
      throw new Error("StoredChat.mandateId must not equal chat id");
    }
    const db = await this.db();
    await db.execute(
      `INSERT INTO chats (id, title, model_id, mandate_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         model_id = excluded.model_id,
         mandate_id = excluded.mandate_id,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
      [chat.id, chat.title, chat.modelId, chat.mandateId, chat.createdAt, chat.updatedAt],
    );
  }

  async remove(id: string): Promise<void> {
    const db = await this.db();
    await db.execute("DELETE FROM chats WHERE id = $1", [id]);
  }
}
