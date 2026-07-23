import type { UIMessage } from "ai";

/**
 * Dual-write discipline: when the Attempt ledger owns the transcript, Chat
 * checkpoints store metadata only (`messages: []`). Legacy chats without
 * ledger rows still persist UIMessage blobs for hydrate fallback.
 */
export function chatMessagesForCheckpoint(input: {
  readonly messages: readonly UIMessage[];
  readonly ledgerOwnsTranscript: boolean;
}): UIMessage[] {
  if (input.ledgerOwnsTranscript) {
    return [];
  }
  return [...input.messages];
}
