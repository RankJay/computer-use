import { describe, expect, test } from "bun:test";

import { zodSchema } from "ai";
import { z } from "zod";

import type { LiveAgentToolContext } from "@/agent/agentSessionContext";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import { defineActuateTool } from "@/agent/tools/defineActuateTool";
import { TOOL_CANCELLED_REASON, ToolTimeoutError } from "@/agent/tools/toolCancellation";
import type { AgentEvent, PermissionChoice } from "@/agent/types";

function createTestContext(options?: {
  readonly choice?: PermissionChoice;
  readonly signal?: AbortSignal;
}): { readonly ctx: LiveAgentToolContext; readonly events: AgentEvent[] } {
  const events: AgentEvent[] = [];
  const ctx: LiveAgentToolContext = {
    taskId: "task-1",
    native: null,
    workspaceFiles: {
      readFile: async () => "",
      listDirectory: async () => [],
      writeFile: async () => "",
    },
    hostOs: "linux",
    workspaceRoot: "/workspace",
    signal: options?.signal ?? new AbortController().signal,
    permissionMode: "ask_all",
    uiAutomationEnabled: true,
    persistedToolApprovals: new Set(),
    sessionRiskApproved: new Set(),
    vision: { latestPng: null },
    emit: (event) => {
      events.push(event);
    },
    waitForPermission: async () => options?.choice ?? "allow_once",
    persistAlwaysAllow: async () => {},
    appendStructuredLog: async () => {},
  };
  return { ctx, events };
}

function createLifecycleTool(ctx: LiveAgentToolContext, execute: () => Promise<string>) {
  return defineActuateTool(ctx, {
    toolName: AGENT_TOOL_NAMES.FILE_READ,
    description: "Test tool",
    inputSchema: zodSchema(z.object({ name: z.string() })),
    nativeGate: "none",
    permission: (input) => ({
      summary: `Read ${input.name}`,
      rationale: "Test permission.",
      details: input.name,
    }),
    deniedError: "Denied.",
    describe: (input) => input.name,
    execute: async () => {
      const value = await execute();
      return { ok: true, value: { value }, timelineSummary: value };
    },
  });
}

describe("defineActuateTool", () => {
  test("emits permission, start, and completion around a successful execute", async () => {
    const { ctx, events } = createTestContext();
    const tool = createLifecycleTool(ctx, async () => "done");

    const result = await tool.execute({ name: "file.txt" }, { toolCallId: "call-1", messages: [] });

    expect(result).toEqual({ ok: true, value: "done" });
    expect(events.map((event) => event.type)).toEqual([
      "permission.requested",
      "permission.resolved",
      "tool.started",
      "tool.completed",
    ]);
    expect(events[2]).toMatchObject({
      type: "tool.started",
      toolName: AGENT_TOOL_NAMES.FILE_READ,
      inputSummary: "file.txt",
    });
    expect(events[3]).toMatchObject({
      type: "tool.completed",
      toolName: AGENT_TOOL_NAMES.FILE_READ,
      outputSummary: "done",
    });
  });

  test("returns the denied error without starting the tool", async () => {
    const { ctx, events } = createTestContext({ choice: "deny" });
    const tool = createLifecycleTool(ctx, async () => "done");

    const result = await tool.execute({ name: "file.txt" }, { toolCallId: "call-1", messages: [] });

    expect(result).toEqual({ ok: false, error: "Denied." });
    expect(events.map((event) => event.type)).toEqual([
      "permission.requested",
      "permission.resolved",
    ]);
  });

  test("emits cancellation when execution aborts", async () => {
    const controller = new AbortController();
    const { ctx, events } = createTestContext({ signal: controller.signal });
    const tool = createLifecycleTool(ctx, async () => {
      controller.abort();
      await Promise.resolve();
      return "done";
    });

    const result = await tool.execute({ name: "file.txt" }, { toolCallId: "call-1", messages: [] });

    expect(result).toEqual({ ok: false, error: TOOL_CANCELLED_REASON });
    expect(events.map((event) => event.type)).toEqual([
      "permission.requested",
      "permission.resolved",
      "tool.started",
      "tool.cancelled",
    ]);
  });

  test("routes timeout and generic errors to their timeline branches", async () => {
    const timeout = createTestContext();
    const timeoutTool = createLifecycleTool(timeout.ctx, async () => {
      throw new ToolTimeoutError(AGENT_TOOL_NAMES.FILE_READ, 5_000, 12);
    });

    const timeoutResult = await timeoutTool.execute(
      { name: "file.txt" },
      { toolCallId: "call-1", messages: [] },
    );

    expect(timeoutResult).toEqual({
      ok: false,
      error: { kind: "timeout", timeoutMs: 5_000, elapsedMs: 12 },
    });
    expect(timeout.events.map((event) => event.type)).toContain("tool.error");

    const generic = createTestContext();
    const genericTool = createLifecycleTool(generic.ctx, async () => {
      throw new Error("boom");
    });

    const genericResult = await genericTool.execute(
      { name: "file.txt" },
      { toolCallId: "call-1", messages: [] },
    );

    expect(genericResult).toEqual({ ok: false, error: "boom" });
    expect(generic.events.at(-1)).toMatchObject({
      type: "tool.completed",
      outputSummary: "boom",
    });
  });
});
