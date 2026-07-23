import type { ChatsPersistence } from "@/lib/chats/persistence";
import type { ChatSummary, StoredChat } from "@/lib/chats/types";

function assertMandateId(chat: StoredChat): void {
  if (chat.mandateId.length === 0) {
    throw new Error("StoredChat.mandateId is required");
  }
  if (chat.mandateId === chat.id) {
    throw new Error("StoredChat.mandateId must not equal chat id");
  }
}

/** In-memory adapter for tests / non-Tauri. */
export class MemoryChatsPersistence implements ChatsPersistence {
  private readonly chats = new Map<string, StoredChat>();

  async list(): Promise<ChatSummary[]> {
    return [...this.chats.values()]
      .map((chat) => ({
        id: chat.id,
        title: chat.title,
        updatedAt: chat.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async load(id: string): Promise<StoredChat | null> {
    return this.chats.get(id) ?? null;
  }

  async save(chat: StoredChat): Promise<void> {
    assertMandateId(chat);
    this.chats.set(chat.id, chat);
  }

  async remove(id: string): Promise<void> {
    this.chats.delete(id);
  }
}
