import type { UIMessage } from "ai";

export type ChatSummary = {
  id: string;
  title: string;
  updatedAt: number;
};

export type StoredChat = {
  id: string;
  title: string;
  modelId: string;
  /** Linked Mandate — never equal to chat id. Required for new chats; legacy rows backfill on load. */
  mandateId: string;
  messages: UIMessage[];
  createdAt: number;
  updatedAt: number;
};
