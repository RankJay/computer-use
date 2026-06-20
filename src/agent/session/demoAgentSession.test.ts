import { describe, expect, test } from "bun:test";

import { DEFAULT_APP_SETTINGS } from "@/agent/persistence/settingsPersistence";
import { runDemoAgentSession } from "@/agent/session/demoAgentSession";
import type { AgentSessionRunnerOptions } from "@/agent/session/sessionRunner";
import { AGENT_TOOL_NAMES } from "@/agent/toolContract";
import type { AgentEvent } from "@/agent/types";

function createRunnerOptions(
  patch: Partial<AgentSessionRunnerOptions> = {},
): AgentSessionRunnerOptions {
  return {
    taskId: "task-1",
    prompt: "Demo the agent",
    conversationTimeline: [{ id: "u1", at: 1, kind: "user", text: "Demo the agent" }],
    settings: {
      ...DEFAULT_APP_SETTINGS,
      persistedApprovals: [...DEFAULT_APP_SETTINGS.persistedApprovals],
    },
    workspaceRoot: null,
    abortSignal: new AbortController().signal,
    permissionMode: "ask_risky",
    native: null,
    emit: () => {},
    waitForPermissionChoice: async () => "deny",
    persistAlwaysAllow: async () => {},
    ...patch,
  };
}

describe("runDemoAgentSession", () => {
  test("emits task.cancelled when aborted before the first delay completes", async () => {
    const controller = new AbortController();
    const events: AgentEvent[] = [];
    controller.abort();

    await runDemoAgentSession(
      createRunnerOptions({
        abortSignal: controller.signal,
        emit: (event) => {
          events.push(event);
        },
      }),
    );

    expect(events.map((event) => event.type)).toEqual(["task.created", "task.cancelled"]);
    expect(events.at(-1)?.type).toBe("task.cancelled");
  });

  test("emits task.cancelled after permission grant abort without completing the task", async () => {
    const controller = new AbortController();
    const events: AgentEvent[] = [];

    await runDemoAgentSession(
      createRunnerOptions({
        abortSignal: controller.signal,
        emit: (event) => {
          events.push(event);
          if (event.type === "permission.resolved") {
            controller.abort();
          }
        },
        waitForPermissionChoice: async () => "allow_once",
      }),
    );

    expect(events.at(-1)?.type).toBe("task.cancelled");
    expect(events.some((event) => event.type === "task.completed")).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === "tool.started" && event.toolName === AGENT_TOOL_NAMES.TERMINAL_RUN,
      ),
    ).toBe(false);
  });
});
