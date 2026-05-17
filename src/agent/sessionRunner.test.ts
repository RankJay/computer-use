import { describe, expect, test } from "bun:test";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/browserWorkspace";
import type { LiveAgentSessionOptions } from "@/agent/liveAgentSession";
import type { AgentNativeBridge } from "@/agent/nativeBridge";
import {
  createLiveAgentSessionRunner,
  resolveAgentWorkspaceRoot,
  runSelectedAgentSession,
  type AgentSessionRunnerOptions,
} from "@/agent/sessionRunner";
import type { AppSettingsPayload } from "@/agent/tauriIpc";
import type { AgentEvent } from "@/agent/types";

function createSettings(patch: Partial<AppSettingsPayload> = {}): AppSettingsPayload {
  return {
    workspaceRoot: null,
    permissionMode: "ask_risky",
    retentionDays: 30,
    modelId: "claude-sonnet-4-20250514",
    agentMode: "live",
    persistedApprovals: [],
    uiAutomationEnabled: false,
    ...patch,
  };
}

function createRunnerOptions(patch: Partial<AgentSessionRunnerOptions> = {}): AgentSessionRunnerOptions {
  return {
    taskId: "task-1",
    prompt: "Summarize the workspace",
    settings: createSettings(),
    workspaceRoot: null,
    permissionMode: "ask_risky",
    native: null,
    emit: () => {},
    waitForPermissionChoice: async () => "deny",
    persistAlwaysAllow: async () => {},
    ...patch,
  };
}

describe("sessionRunner", () => {
  test("runSelectedAgentSession chooses demo when settings request demo mode", async () => {
    const calls: string[] = [];

    await runSelectedAgentSession(
      createRunnerOptions({ settings: createSettings({ agentMode: "demo" }) }),
      {
        demo: async () => {
          calls.push("demo");
        },
        live: async () => {
          calls.push("live");
        },
      },
    );

    expect(calls).toEqual(["demo"]);
  });

  test("runSelectedAgentSession treats unknown modes as live", async () => {
    const calls: string[] = [];

    await runSelectedAgentSession(
      createRunnerOptions({ settings: createSettings({ agentMode: "preview" }) }),
      {
        demo: async () => {
          calls.push("demo");
        },
        live: async () => {
          calls.push("live");
        },
      },
    );

    expect(calls).toEqual(["live"]);
  });

  test("resolveAgentWorkspaceRoot prefers override, then settings, then browser sample", () => {
    expect(
      resolveAgentWorkspaceRoot("  d:/tmp/project  ", createSettings(), { isTauriRuntime: false }),
    ).toBe("d:/tmp/project");
    expect(
      resolveAgentWorkspaceRoot(null, createSettings({ workspaceRoot: " d:/settings/project " }), {
        isTauriRuntime: true,
      }),
    ).toBe("d:/settings/project");
    expect(resolveAgentWorkspaceRoot(null, createSettings(), { isTauriRuntime: false })).toBe(
      BROWSER_SAMPLE_WORKSPACE_ROOT,
    );
  });

  test("live runner emits failed session when browser API key is missing", async () => {
    const events: AgentEvent[] = [];
    let liveCalls = 0;
    const runner = createLiveAgentSessionRunner(
      {
        native: null,
        isTauriRuntime: false,
        loadSecretKey: async () => "",
      },
      async () => {
        liveCalls += 1;
      },
    );

    await runner(
      createRunnerOptions({
        emit: (event) => {
          events.push(event);
        },
      }),
    );

    expect(liveCalls).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("task.failed");
    expect(events[0]?.taskId).toBe("task-1");
    expect(events[0]?.type === "task.failed" ? events[0].message : "").toContain(
      "No Anthropic API key in browser storage",
    );
  });

  test("live runner passes shared options and API key after preflight", async () => {
    const native: AgentNativeBridge | null = null;
    let received: LiveAgentSessionOptions | null = null;
    const runner = createLiveAgentSessionRunner(
      {
        native,
        isTauriRuntime: false,
        loadSecretKey: async () => " key-1 ",
      },
      async (options) => {
        received = options;
      },
    );

    await runner(createRunnerOptions({ native, workspaceRoot: "d:/workspace" }));

    expect(received?.apiKey).toBe("key-1");
    expect(received?.workspaceRoot).toBe("d:/workspace");
    expect(received?.native).toBe(native);
  });
});
