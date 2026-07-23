import { describe, expect, test } from "bun:test";

import type { RuntimeEvent } from "@/lib/session/events";

import { coalesceDurableEvents } from "./coalesce";

function partUpdated(
  eventId: string,
  messageId: string,
  partIndex: number,
  text: string,
): RuntimeEvent {
  return {
    type: "assistant.part_updated",
    eventId,
    taskId: "a1",
    timestamp: 1,
    schemaVersion: 1,
    messageId,
    partIndex,
    part: { type: "text", text },
  };
}

describe("coalesceDurableEvents", () => {
  test("keeps only the latest part_updated per message+index", () => {
    const events: RuntimeEvent[] = [
      partUpdated("e1", "m1", 0, "H"),
      partUpdated("e2", "m1", 0, "He"),
      partUpdated("e3", "m1", 0, "Hello"),
      {
        type: "assistant.message_finished",
        eventId: "e4",
        taskId: "a1",
        timestamp: 2,
        schemaVersion: 1,
        messageId: "m1",
      },
    ];

    const compact = coalesceDurableEvents(events);
    expect(compact).toHaveLength(2);
    expect(compact[0]).toMatchObject({
      type: "assistant.part_updated",
      part: { type: "text", text: "Hello" },
    });
    expect(compact[1]?.type).toBe("assistant.message_finished");
  });

  test("does not coalesce different part indices", () => {
    const events = [
      partUpdated("e1", "m1", 0, "A"),
      partUpdated("e2", "m1", 1, "B"),
      partUpdated("e3", "m1", 0, "AA"),
    ];
    const compact = coalesceDurableEvents(events);
    expect(compact).toHaveLength(2);
    expect(compact[0]).toMatchObject({ partIndex: 0, part: { text: "AA" } });
    expect(compact[1]).toMatchObject({ partIndex: 1, part: { text: "B" } });
  });
});
