import { describe, expect, test } from "bun:test";
import {
  applyAgentEvent,
  beginAgentRun,
  createInitialAgentProjection,
} from "@/agent/session/sessionProjection";
import type { AgentEvent, AgentTimelineItem, PermissionChoice } from "@/agent/types";

const taskId = "task-1";

function baseEvent(id: string): Pick<AgentEvent, "id" | "at" | "taskId"> {
  return { id, at: 1000, taskId };
}

function createdEvent(id = "created"): AgentEvent {
  return {
    ...baseEvent(id),
    type: "task.created",
    prompt: "Summarize the workspace",
  };
}

function permissionRequestEvent(id = "permission-requested"): AgentEvent {
  return {
    ...baseEvent(id),
    type: "permission.requested",
    permissionId: "permission-1",
    toolName: "terminal.run",
    title: "Run command",
    summary: "Run bun test",
    rationale: "Verify the projection",
    risk: "Runs a local command",
    details: "bun test src/agent/sessionProjection.test.ts",
  };
}

function permissionResolvedEvent(choice: PermissionChoice, id = "permission-resolved"): AgentEvent {
  return {
    ...baseEvent(id),
    type: "permission.resolved",
    permissionId: "permission-1",
    choice,
  };
}

describe("sessionProjection", () => {
  test("task.created sets running status", () => {
    const projection = applyAgentEvent(createInitialAgentProjection(), createdEvent());

    expect(projection.status).toBe("running");
    expect(projection.capabilities.canStartRun).toBe(false);
    expect(projection.capabilities.taskInputDisabled).toBe(true);
  });

  test("assistant deltas accumulate in assistantStream", () => {
    let projection = applyAgentEvent(createInitialAgentProjection(), createdEvent());

    projection = applyAgentEvent(projection, {
      ...baseEvent("delta-1"),
      type: "assistant.text.delta",
      text: "Hello ",
    });
    projection = applyAgentEvent(projection, {
      ...baseEvent("delta-2"),
      type: "assistant.text.delta",
      text: "there",
    });

    expect(projection.assistantStream).toBe("Hello there");
  });

  test("assistant.text.done flushes one assistant timeline item and clears stream", () => {
    let projection = createInitialAgentProjection();
    projection = applyAgentEvent(projection, {
      ...baseEvent("delta-1"),
      type: "assistant.text.delta",
      text: " Done. ",
    });
    projection = applyAgentEvent(projection, {
      ...baseEvent("done-1"),
      type: "assistant.text.done",
    });

    expect(projection.assistantStream).toBe("");
    expect(projection.timeline).toEqual([
      { id: "done-1", at: 1000, kind: "assistant", text: "Done." },
    ]);
  });

  test("task.completed sets completed status and summary", () => {
    const projection = applyAgentEvent(createInitialAgentProjection(), {
      ...baseEvent("completed"),
      type: "task.completed",
      summary: "Finished",
    });

    expect(projection.status).toBe("completed");
    expect(projection.lastSummary).toBe("Finished");
    expect(projection.currentStep).toBeNull();
  });

  test("task.failed exposes the latest failure message", () => {
    let projection = createInitialAgentProjection();

    projection = applyAgentEvent(projection, {
      ...baseEvent("failed-1"),
      type: "task.failed",
      message: "First failure",
    });
    projection = applyAgentEvent(projection, {
      ...baseEvent("failed-2"),
      type: "task.failed",
      message: "Latest failure",
    });

    expect(projection.status).toBe("failed");
    expect(projection.failureMessage).toBe("Latest failure");
  });

  test("task.failed preserves the active assistant stream for post-failure visibility", () => {
    let projection = createInitialAgentProjection();

    projection = applyAgentEvent(projection, {
      ...baseEvent("delta-1"),
      type: "assistant.text.delta",
      text: "Partial answer",
    });
    projection = applyAgentEvent(projection, {
      ...baseEvent("failed-1"),
      type: "task.failed",
      message: "Network failure",
    });

    expect(projection.status).toBe("failed");
    expect(projection.assistantStream).toBe("Partial answer");
  });

  test("permission request and resolution update pending permission state", () => {
    let projection = applyAgentEvent(createInitialAgentProjection(), permissionRequestEvent());

    expect(projection.status).toBe("awaiting_permission");
    expect(projection.pendingPermission?.permissionId).toBe("permission-1");

    projection = applyAgentEvent(projection, permissionResolvedEvent("allow_once"));

    expect(projection.status).toBe("running");
    expect(projection.pendingPermission).toBeNull();
  });

  test("activity events are kept between user and assistant timeline rows", () => {
    let projection = beginAgentRun(createInitialAgentProjection(), {
      userTimelineItem: { id: "user-1", at: 900, kind: "user", text: "Run tests" },
    });

    projection = applyAgentEvent(projection, {
      ...baseEvent("tool-started"),
      type: "tool.started",
      toolName: "terminal.run",
      inputSummary: "bun test",
    });
    projection = applyAgentEvent(projection, {
      ...baseEvent("delta-1"),
      type: "assistant.text.delta",
      text: "Done.",
    });
    projection = applyAgentEvent(projection, {
      ...baseEvent("done-1"),
      type: "assistant.text.done",
    });
    projection = applyAgentEvent(projection, {
      ...baseEvent("completed-1"),
      type: "task.completed",
      summary: "Finished",
    });

    expect(projection.timeline).toEqual([
      { id: "user-1", at: 900, kind: "user", text: "Run tests" },
      {
        id: "tool-started",
        at: expect.any(Number),
        kind: "activity",
        taskId,
        status: "completed",
        rows: [
          {
            id: "tool-started",
            title: "Running terminal.run",
            detail: "bun test",
          },
        ],
      },
      { id: "done-1", at: 1000, kind: "assistant", text: "Done." },
    ]);
  });

  test("capability flags match idle, running, awaiting permission, completed, and failed states", () => {
    const assistantItem: AgentTimelineItem = {
      id: "assistant-1",
      at: 1000,
      kind: "assistant",
      text: "Answer",
    };

    const idle = createInitialAgentProjection();
    const running = applyAgentEvent(idle, createdEvent());
    const awaitingPermission = applyAgentEvent(running, permissionRequestEvent());
    const completed = applyAgentEvent(beginAgentRun(idle, { userTimelineItem: assistantItem }), {
      ...baseEvent("completed"),
      type: "task.completed",
      summary: "Finished",
    });
    const failed = applyAgentEvent(beginAgentRun(idle, { userTimelineItem: assistantItem }), {
      ...baseEvent("failed"),
      type: "task.failed",
      message: "Boom",
    });

    expect(idle.capabilities).toEqual({
      canStartRun: true,
      taskInputDisabled: false,
      canRegenerateAssistant: false,
      hasConversation: false,
    });
    expect(running.capabilities.canStartRun).toBe(false);
    expect(running.capabilities.taskInputDisabled).toBe(true);
    expect(awaitingPermission.capabilities.canStartRun).toBe(false);
    expect(awaitingPermission.capabilities.taskInputDisabled).toBe(true);
    expect(completed.capabilities.canStartRun).toBe(true);
    expect(completed.capabilities.canRegenerateAssistant).toBe(true);
    expect(failed.capabilities.canStartRun).toBe(true);
    expect(failed.capabilities.canRegenerateAssistant).toBe(true);
  });
});
