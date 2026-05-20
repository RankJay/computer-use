import { describe, expect, test } from "bun:test";

import {
  countOpenPointerTools,
  countOpenUiAutomationTools,
} from "@/agent/session/uiAutomationDepth";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import type { AgentEvent } from "@/agent/types";

const taskId = "task-1";

function toolEvent(
  id: string,
  type: "tool.started" | "tool.completed",
  toolName: string,
): AgentEvent {
  if (type === "tool.started") {
    return { id, at: 1000, taskId, type, toolName, inputSummary: "in" };
  }
  return { id, at: 1000, taskId, type, toolName, outputSummary: "out" };
}

describe("uiAutomationDepth", () => {
  test("countOpenUiAutomationTools increments and decrements on matching events", () => {
    const events = [
      toolEvent("s1", "tool.started", AGENT_TOOL_NAMES.POINTER_MOVE),
      toolEvent("c1", "tool.completed", AGENT_TOOL_NAMES.POINTER_MOVE),
    ] as const;

    expect(countOpenUiAutomationTools(events.slice(0, 1))).toBe(1);
    expect(countOpenUiAutomationTools(events)).toBe(0);
  });

  test("countOpenPointerTools ignores type.text and key.tap", () => {
    const events = [
      toolEvent("s1", "tool.started", AGENT_TOOL_NAMES.TYPE_TEXT),
      toolEvent("s2", "tool.started", AGENT_TOOL_NAMES.KEY_TAP),
    ];

    expect(countOpenUiAutomationTools(events)).toBe(2);
    expect(countOpenPointerTools(events)).toBe(0);
  });
});
