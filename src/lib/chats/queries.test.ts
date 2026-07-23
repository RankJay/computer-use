import { describe, expect, test } from "bun:test";

import { QueryClient } from "@tanstack/react-query";

import type { ChatsPersistence } from "@/lib/chats/persistence";
import { chatsKeys } from "@/lib/chats/queries";
import type { ChatSummary, StoredChat } from "@/lib/chats/types";

class FakeChatsPersistence implements ChatsPersistence {
  private chats = new Map<string, StoredChat>();

  constructor(initial: StoredChat[] = []) {
    for (const chat of initial) {
      this.chats.set(chat.id, chat);
    }
  }

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
    this.chats.set(chat.id, chat);
  }

  async remove(id: string): Promise<void> {
    this.chats.delete(id);
  }
}

function stored(partial: Partial<StoredChat> & Pick<StoredChat, "id" | "title">): StoredChat {
  return {
    modelId: "openai/gpt-5.4",
    mandateId: `mandate-${partial.id}`,
    messages: [],
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe("chats query/mutation cache", () => {
  test("list query caches summaries from persistence", async () => {
    const persistence = new FakeChatsPersistence([
      stored({ id: "a", title: "A", updatedAt: 2 }),
      stored({ id: "b", title: "B", updatedAt: 1 }),
    ]);
    const client = new QueryClient();

    const list = await client.fetchQuery({
      queryKey: chatsKeys.list(),
      queryFn: () => persistence.list(),
    });

    expect(list).toEqual([
      { id: "a", title: "A", updatedAt: 2 },
      { id: "b", title: "B", updatedAt: 1 },
    ]);
    expect(client.getQueryData<ChatSummary[]>(chatsKeys.list())).toEqual(list);
  });

  test("delete drops the chat from the cached list", async () => {
    const persistence = new FakeChatsPersistence([
      stored({ id: "a", title: "A", updatedAt: 2 }),
      stored({ id: "b", title: "B", updatedAt: 1 }),
    ]);
    const client = new QueryClient();

    await client.fetchQuery({
      queryKey: chatsKeys.list(),
      queryFn: () => persistence.list(),
    });

    await persistence.remove("a");
    client.setQueryData<ChatSummary[]>(chatsKeys.list(), (current) =>
      current?.filter((chat) => chat.id !== "a"),
    );

    expect(client.getQueryData<ChatSummary[]>(chatsKeys.list())).toEqual([
      { id: "b", title: "B", updatedAt: 1 },
    ]);
    expect(await persistence.load("a")).toBeNull();
  });
});
