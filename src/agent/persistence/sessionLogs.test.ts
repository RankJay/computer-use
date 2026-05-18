import { describe, expect, test } from "bun:test";
import { eventForDiskLog } from "@/agent/persistence/sessionLogs";
import type { AgentEvent } from "@/agent/types";

describe("sessionLogs", () => {
  test("session log redacts screenshot base64", () => {
    const event: AgentEvent = {
      id: "event-1",
      at: 1,
      taskId: "task-1",
      type: "screenshot.keyframe",
      label: "before click",
      imageBase64: "base64-payload",
    };

    expect(eventForDiskLog(event)).toEqual({
      id: "event-1",
      at: 1,
      taskId: "task-1",
      type: "screenshot.keyframe",
      label: "before click",
      imageBase64Redacted: true,
    });
  });

  test("session log keeps non-screenshot events unchanged", () => {
    const event: AgentEvent = {
      id: "event-2",
      at: 2,
      taskId: "task-1",
      type: "assistant.text.delta",
      text: "hello",
    };

    expect(eventForDiskLog(event)).toEqual(event);
  });
});
