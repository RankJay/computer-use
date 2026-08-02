import { describe, expect, test } from "bun:test";

import type { UIMessage } from "ai";

import { prepareMessagesForModel } from "./prepare-messages-for-model";

describe("prepareMessagesForModel", () => {
  test("strips completed web_search and keeps assistant text", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "text", text: "Gold is expensive." },
          {
            type: "tool-web_search",
            toolCallId: "srvtoolu_ok",
            state: "output-available",
            providerExecuted: true,
            input: { query: "gold" },
            output: [
              {
                type: "web_search_result",
                url: "https://example.com",
                title: "Example",
                pageAge: null,
                encryptedContent: "enc_abc",
              },
            ],
          },
        ],
      },
    ];

    const prepared = prepareMessagesForModel(messages);
    expect(prepared[0]?.parts).toEqual([{ type: "text", text: "Gold is expensive." }]);
  });

  test("strips web_search even when providerExecuted was dropped", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-web_search",
            toolCallId: "srvtoolu_bad",
            state: "output-available",
            input: {},
            output: { action: { type: "search", query: "gold" } },
          },
        ],
      },
    ];

    const prepared = prepareMessagesForModel(messages);
    expect(prepared[0]?.parts).toEqual([]);
  });

  test("strips incomplete web_search parts", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-web_search",
            toolCallId: "srvtoolu_test",
            state: "input-available",
            input: {},
          },
        ],
      },
    ];
    const prepared = prepareMessagesForModel(messages);
    expect(prepared[0]?.parts).toEqual([]);
  });

  test("leaves client tools unchanged", () => {
    const messages: UIMessage[] = [
      {
        id: "a2",
        role: "assistant",
        parts: [
          {
            type: "tool-screenshot",
            toolCallId: "call_1",
            state: "output-available",
            input: {},
            output: { ok: true },
          },
        ],
      },
    ];
    const prepared = prepareMessagesForModel(messages);
    expect(prepared[0]?.parts[0]).toEqual(messages[0]!.parts[0]);
  });
});
