export type ChatSummary = {
  id: string;
  title: string;
  updatedAt: number;
};

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
