import { describe, expect, test } from "bun:test";

import { createTestHostRuntime } from "@/agent/host/testHostRuntime";
import { eventForDiskLog } from "@/agent/persistence/sessionLogs";
import {
  emitAndPersistLiveSessionEvent,
  persistLiveSessionEvent,
} from "@/agent/session/liveSessionLogPolicy";
import type { AgentEvent, EmitFn } from "@/agent/types";

describe("liveSessionLogPolicy", () => {
  test("persistLiveSessionEvent appends task lifecycle events to the log", async () => {
    const lines: string[] = [];
    const runtime = createTestHostRuntime({ isDesktop: true });
    const loggingRuntime = {
      ...runtime,
      canPersistSessionLogs: true,
      appendSessionLogLine: async (_sessionId: string, line: string) => {
        lines.push(line);
      },
      writeSessionKeyframe: async () => {},
    };

    const event: AgentEvent = {
      id: "e-1",
      at: 1,
      taskId: "task-1",
      type: "task.completed",
      summary: "done",
    };

    await persistLiveSessionEvent("task-1", event, loggingRuntime);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toEqual(eventForDiskLog(event));
  });

  test("screenshot keyframes persist PNG separately and redact base64 in the log line", async () => {
    const lines: string[] = [];
    const keyframes: { filename: string; png: string }[] = [];
    const runtime = createTestHostRuntime({ isDesktop: true });
    const loggingRuntime = {
      ...runtime,
      canPersistSessionLogs: true,
      appendSessionLogLine: async (_sessionId: string, line: string) => {
        lines.push(line);
      },
      writeSessionKeyframe: async (
        _sessionId: string,
        filename: string,
        pngBase64: string,
      ) => {
        keyframes.push({ filename, png: pngBase64 });
      },
    };

    const event: AgentEvent = {
      id: "e-2",
      at: 2,
      taskId: "task-1",
      type: "screenshot.keyframe",
      label: "capture",
      imageBase64: "png-data",
    };

    await persistLiveSessionEvent("task-1", event, loggingRuntime);

    expect(keyframes).toHaveLength(1);
    expect(keyframes[0]?.png).toBe("png-data");
    expect(keyframes[0]?.filename.endsWith(".png")).toBe(true);

    const logged = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
    expect(logged.imageBase64Redacted).toBe(true);
    expect(logged.imageBase64).toBeUndefined();
  });

  test("emitAndPersistLiveSessionEvent emits then persists", async () => {
    const emitted: AgentEvent[] = [];
    const lines: string[] = [];
    const emit: EmitFn = (event) => {
      emitted.push(event);
    };
    const runtime = createTestHostRuntime({ isDesktop: true });
    const loggingRuntime = {
      ...runtime,
      canPersistSessionLogs: true,
      appendSessionLogLine: async (_sessionId: string, line: string) => {
        lines.push(line);
      },
      writeSessionKeyframe: async () => {},
    };

    const event: AgentEvent = {
      id: "e-3",
      at: 3,
      taskId: "task-1",
      type: "task.failed",
      message: "err",
    };

    await emitAndPersistLiveSessionEvent(emit, "task-1", event, loggingRuntime);

    expect(emitted).toEqual([event]);
    expect(lines).toHaveLength(1);
  });
});
