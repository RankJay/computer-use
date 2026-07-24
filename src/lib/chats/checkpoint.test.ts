import { describe, expect, test } from "bun:test";

import type { UIMessage } from "ai";

import { MemoryChatsPersistence } from "@/lib/chats/adapters/memory-store";
import {
  buildCheckpointChat,
  checkpointErrorMessage,
  createChatCheckpointController,
  firstUserPrompt,
  type ChatCheckpointPorts,
} from "@/lib/chats/checkpoint";

describe("firstUserPrompt", () => {
  test("joins text parts from the first user message", () => {
    const messages: UIMessage[] = [
      {
        id: "a",
        role: "assistant",
        parts: [{ type: "text", text: "skip" }],
      },
      {
        id: "u",
        role: "user",
        parts: [
          { type: "text", text: "hello " },
          { type: "text", text: "world" },
        ],
      },
    ];
    expect(firstUserPrompt(messages)).toBe("hello world");
  });

  test("empty when no user message", () => {
    expect(firstUserPrompt([])).toBe("");
  });
});

describe("buildCheckpointChat", () => {
  test("uses meta when present", () => {
    const chat = buildCheckpointChat({
      id: "c1",
      mandateId: "m1",
      titleSourceMessages: [{ id: "u", role: "user", parts: [{ type: "text", text: "hi" }] }],
      meta: { title: "Saved", modelId: "model-a", createdAt: 10, mandateId: "m1" },
      projection: { usage: { modelId: "model-b" } },
      fallbackModelId: "fallback",
      now: 99,
    });
    expect(chat).toEqual({
      id: "c1",
      mandateId: "m1",
      title: "Saved",
      modelId: "model-a",
      createdAt: 10,
      updatedAt: 99,
    });
  });

  test("derives title and model when meta missing", () => {
    const chat = buildCheckpointChat({
      id: "c2",
      mandateId: "m2",
      titleSourceMessages: [{ id: "u", role: "user", parts: [{ type: "text", text: "Ship it" }] }],
      meta: null,
      projection: { usage: { modelId: "model-b" } },
      fallbackModelId: "fallback",
      now: 50,
    });
    expect(chat.id).toBe("c2");
    expect(chat.mandateId).toBe("m2");
    expect(chat.title.length).toBeGreaterThan(0);
    expect(chat.modelId).toBe("model-b");
    expect(chat.createdAt).toBe(50);
    expect(chat.updatedAt).toBe(50);
  });

  test("rejects aliased mandateId", () => {
    expect(() =>
      buildCheckpointChat({
        id: "same",
        mandateId: "same",
        titleSourceMessages: [],
        meta: null,
        projection: { usage: { modelId: null } },
        fallbackModelId: "fallback",
      }),
    ).toThrow("mandateId must not equal chat id");
  });
});

describe("checkpointErrorMessage", () => {
  test("uses Error message when present", () => {
    expect(checkpointErrorMessage(new Error("disk full"))).toBe("disk full");
  });

  test("fallback for unknown errors", () => {
    expect(checkpointErrorMessage("nope")).toBe("Chat could not be written to this device.");
  });
});

describe("createChatCheckpointController", () => {
  function ports(overrides: Partial<ChatCheckpointPorts> = {}): ChatCheckpointPorts {
    const chats = new MemoryChatsPersistence();
    return {
      chats,
      flushLedger: async () => {},
      getLiveIds: () => ({ mandateId: "m1", attemptId: "a1" }),
      getLiveChatId: () => null,
      getFocusedMandateId: () => "m1",
      setLiveChatId: () => {},
      setFocusedMandateId: () => {},
      getFallbackModelId: () => "model-fallback",
      getRouteChatId: () => undefined,
      onSaved: async () => {},
      onError: () => {},
      ...overrides,
    };
  }

  test("creates chat on completed transition and navigates", async () => {
    const saved: { id: string; navigate: boolean }[] = [];
    let liveChatId: string | null = null;
    const p = ports({
      getLiveChatId: () => liveChatId,
      setLiveChatId: (id) => {
        liveChatId = id;
      },
      onSaved: async (chat, options) => {
        saved.push({ id: chat.id, navigate: options.navigateToChat });
      },
    });
    const controller = createChatCheckpointController(p);

    controller.onProjectionChange({
      status: "streaming",
      chatMessages: [{ id: "u", role: "user", parts: [{ type: "text", text: "Hello world" }] }],
      usage: { modelId: "model-x" },
    });
    controller.onProjectionChange({
      status: "completed",
      chatMessages: [{ id: "u", role: "user", parts: [{ type: "text", text: "Hello world" }] }],
      usage: { modelId: "model-x" },
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(saved).toHaveLength(1);
    expect(saved[0]?.navigate).toBe(true);
    expect(liveChatId).not.toBeNull();
    expect(liveChatId!).toBe(saved[0]!.id);
    const loaded = await p.chats.load(saved[0]!.id);
    expect(loaded?.mandateId).toBe("m1");
    expect(loaded?.title.length).toBeGreaterThan(0);
  });

  test("cancelled does not checkpoint", async () => {
    let saved = 0;
    const controller = createChatCheckpointController(
      ports({
        onSaved: async () => {
          saved += 1;
        },
      }),
    );

    controller.onProjectionChange({
      status: "streaming",
      chatMessages: [],
      usage: { modelId: null },
    });
    controller.onProjectionChange({
      status: "cancelled",
      chatMessages: [],
      usage: { modelId: null },
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(saved).toBe(0);
  });

  test("updates existing chat without navigate", async () => {
    const chats = new MemoryChatsPersistence();
    await chats.save({
      id: "c-existing",
      title: "Old",
      modelId: "m-old",
      mandateId: "m1",
      createdAt: 1,
      updatedAt: 1,
    });

    const navigated: boolean[] = [];
    const controller = createChatCheckpointController(
      ports({
        chats,
        getLiveChatId: () => "c-existing",
        onSaved: async (_chat, options) => {
          navigated.push(options.navigateToChat);
        },
      }),
    );
    controller.setMeta({
      title: "Old",
      modelId: "m-old",
      createdAt: 1,
      mandateId: "m1",
    });

    controller.onProjectionChange({
      status: "streaming",
      chatMessages: [],
      usage: { modelId: "m-new" },
    });
    controller.onProjectionChange({
      status: "failed",
      chatMessages: [],
      usage: { modelId: "m-new" },
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(navigated).toEqual([false]);
    const loaded = await chats.load("c-existing");
    expect(loaded?.title).toBe("Old");
    expect(loaded?.updatedAt).toBeGreaterThan(1);
  });
});
