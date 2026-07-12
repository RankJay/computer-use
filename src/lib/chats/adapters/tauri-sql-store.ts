import Database from "@tauri-apps/plugin-sql";
import type { UIMessage } from "ai";

import type { ChatsPersistence } from "@/lib/chats/persistence";
import type { ChatSummary, StoredChat } from "@/lib/chats/types";

const CHATS_DB = "sqlite:chats.db";

type ChatSummaryRow = {
  id: string;
  title: string;
  updated_at: number;
};

type ChatRow = {
  id: string;
  title: string;
  model_id: string;
  messages_json: string;
  created_at: number;
  updated_at: number;
};

function isUIMessage(value: object): value is UIMessage {
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "role" in value &&
    typeof value.role === "string" &&
    "parts" in value &&
    Array.isArray(value.parts)
  );
}

function parseMessages(messagesJson: string): UIMessage[] {
  const parsed: unknown = JSON.parse(messagesJson);
  if (!Array.isArray(parsed)) {
    throw new Error("chats.messages_json must be a JSON array");
  }

  const messages: UIMessage[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null || !isUIMessage(item)) {
      throw new Error("chats.messages_json contains an invalid UIMessage");
    }
    messages.push(item);
  }
  return messages;
}

function rowToStoredChat(row: ChatRow): StoredChat {
  return {
    id: row.id,
    title: row.title,
    modelId: row.model_id,
    messages: parseMessages(row.messages_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TauriSqlChatsPersistence implements ChatsPersistence {
  private dbPromise: Promise<Database> | null = null;

  private db(): Promise<Database> {
    this.dbPromise ??= Database.load(CHATS_DB);
    return this.dbPromise;
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
    const rows = await db.select<ChatRow[]>("SELECT * FROM chats WHERE id = $1", [id]);
    const row = rows[0];
    return row === undefined ? null : rowToStoredChat(row);
  }

  async save(chat: StoredChat): Promise<void> {
    const db = await this.db();
    await db.execute(
      `INSERT INTO chats (id, title, model_id, messages_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         model_id = excluded.model_id,
         messages_json = excluded.messages_json,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
      [
        chat.id,
        chat.title,
        chat.modelId,
        JSON.stringify(chat.messages),
        chat.createdAt,
        chat.updatedAt,
      ],
    );
  }

  async remove(id: string): Promise<void> {
    const db = await this.db();
    await db.execute("DELETE FROM chats WHERE id = $1", [id]);
  }
}
