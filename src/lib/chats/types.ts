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
  messages: UIMessage[];
  createdAt: number;
  updatedAt: number;
};
