import { TauriSqlChatsPersistence } from "@/lib/chats/adapters/tauri-sql-store";
import type { ChatSummary, StoredChat } from "@/lib/chats/types";

export type ChatsPersistence = {
  list(): Promise<ChatSummary[]>;
  load(id: string): Promise<StoredChat | null>;
  save(chat: StoredChat): Promise<void>;
  remove(id: string): Promise<void>;
};

export function createChatsPersistence(): ChatsPersistence {
  return new TauriSqlChatsPersistence();
}
