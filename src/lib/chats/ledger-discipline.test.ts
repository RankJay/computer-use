import { describe, expect, test } from "bun:test";

import { chatMessagesForCheckpoint } from "./ledger-discipline";

describe("chatMessagesForCheckpoint", () => {
  test("ledger-owned transcript persists empty messages", () => {
    expect(
      chatMessagesForCheckpoint({
        messages: [{ id: "u", role: "user", parts: [{ type: "text", text: "hi" }] }],
        ledgerOwnsTranscript: true,
      }),
    ).toEqual([]);
  });

  test("legacy path keeps messages when ledger does not own", () => {
    const messages = [
      { id: "u", role: "user" as const, parts: [{ type: "text" as const, text: "hi" }] },
    ];
    expect(
      chatMessagesForCheckpoint({
        messages,
        ledgerOwnsTranscript: false,
      }),
    ).toEqual(messages);
  });
});
