import { describe, expect, test } from "bun:test";

import {
  buildAssistantTextDoneEvent,
  buildLiveCompletionEvents,
  buildTaskCompletedEvent,
  buildTaskCreatedEvent,
  buildTaskFailedEvent,
} from "@/agent/session/liveTaskEvents";

const taskId = "task-1";
const meta = { id: "ev-1", at: 1000 };

describe("liveTaskEvents", () => {
  test("completion emits assistant.text.done and task.completed", () => {
    const { done, completed } = buildLiveCompletionEvents(taskId, "All done.", () => ({
      id: "done-1",
      at: 1,
    }));

    expect(done).toEqual({
      id: "done-1",
      at: 1,
      taskId,
      type: "assistant.text.done",
    });
    expect(completed.type).toBe("task.completed");
    expect(completed.summary).toBe("All done.");
  });

  test("empty model text uses default completion summary", () => {
    const completed = buildTaskCompletedEvent(taskId, "", { id: "c-1", at: 2 });
    expect(completed.summary).toContain("no textual summary");
  });

  test("long completion text is truncated to 8000 chars", () => {
    const text = "x".repeat(9000);
    const completed = buildTaskCompletedEvent(taskId, text, meta);
    expect(completed.summary.length).toBe(8000);
  });

  test("failures emit task.failed with Error message", () => {
    const failEv = buildTaskFailedEvent(taskId, new Error("boom"), meta);
    expect(failEv).toEqual({
      ...meta,
      taskId,
      type: "task.failed",
      message: "boom",
    });
  });

  test("failures stringify non-Error values", () => {
    const failEv = buildTaskFailedEvent(taskId, 42, meta);
    expect(failEv.message).toBe("42");
  });

  test("task.created carries prompt", () => {
    const created = buildTaskCreatedEvent(taskId, "run tests", meta);
    expect(created.type).toBe("task.created");
    expect(created.prompt).toBe("run tests");
  });

  test("assistant.text.done has no text field", () => {
    const done = buildAssistantTextDoneEvent(taskId, meta);
    expect(done.type).toBe("assistant.text.done");
    expect("text" in done).toBe(false);
  });
});
