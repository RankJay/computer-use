/**
 * Chat Client metadata row. Transcript truth is the Attempt ledger
 * (MandateProjection), never a messages blob.
 */
export type StoredChat = {
  id: string;
  title: string;
  modelId: string;
  /** Linked Mandate — never equal to chat id. */
  mandateId: string;
  createdAt: number;
  updatedAt: number;
};

export type ChatSummary = Pick<StoredChat, "id" | "title" | "updatedAt">;
