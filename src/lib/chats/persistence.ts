import { MemoryChatsPersistence } from "@/lib/chats/adapters/memory-store";
import { TauriSqlChatsPersistence } from "@/lib/chats/adapters/tauri-sql-store";
import type { ChatSummary, StoredChat } from "@/lib/chats/types";
import { isTauriRuntime } from "@/lib/runtime/is-tauri-runtime";

export type ChatsPersistence = {
  list(): Promise<ChatSummary[]>;
  load(id: string): Promise<StoredChat | null>;
  save(chat: StoredChat): Promise<void>;
  remove(id: string): Promise<void>;
};

export function createChatsPersistence(): ChatsPersistence {
  if (!isTauriRuntime()) {
    return new MemoryChatsPersistence();
  }
  return new TauriSqlChatsPersistence();
}
