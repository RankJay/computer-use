import { describe, expect, test } from "bun:test";

import type { AgentNativeBridge } from "@/agent/native/nativeBridge";
import type { AppSettingsPayload } from "@/agent/native/tauriIpc";
import { DEFAULT_APP_SETTINGS } from "@/agent/persistence/settingsPersistence";
import { SECRET_ANTHROPIC_API_KEY, SECRET_OPENAI_API_KEY } from "@/agent/secrets";
import type { LiveAgentSessionOptions } from "@/agent/session/liveAgentSession";
import {
  createLiveAgentSessionRunner,
  resolveAgentWorkspaceRoot,
  runSelectedAgentSession,
  type AgentSessionRunnerOptions,
} from "@/agent/session/sessionRunner";
import type { AgentEvent } from "@/agent/types";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/workspace/browserWorkspace";

function createSettings(patch: Partial<AppSettingsPayload> = {}): AppSettingsPayload {
  return {
    ...DEFAULT_APP_SETTINGS,
    persistedApprovals: [...DEFAULT_APP_SETTINGS.persistedApprovals],
    ...patch,
  };
}

function createRunnerOptions(
  patch: Partial<AgentSessionRunnerOptions> = {},
): AgentSessionRunnerOptions {
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

  test("live runner emits failed session when no API keys are saved", async () => {
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
    expect(events[0]?.type === "task.failed" ? events[0].message : "").toContain("No API key");
  });

  test("live runner passes Anthropic options when only Anthropic key exists", async () => {
    const native: AgentNativeBridge | null = null;
    let received: LiveAgentSessionOptions | null = null;
    const runner = createLiveAgentSessionRunner(
      {
        native,
        isTauriRuntime: false,
        loadSecretKey: async (id) => {
          if (id === SECRET_ANTHROPIC_API_KEY) return " key-1 ";
          return "";
        },
      },
      async (options) => {
        received = options;
      },
    );

    await runner(createRunnerOptions({ native, workspaceRoot: "d:/workspace" }));

    expect(received?.apiKey).toBe("key-1");
    expect(received?.llmProvider).toBe("anthropic");
    expect(received?.liveModelId).toBe(DEFAULT_APP_SETTINGS.anthropicModelId);
    expect(received?.workspaceRoot).toBe("d:/workspace");
    expect(received?.native).toBe(native);
  });

  test("live runner passes OpenAI options when only OpenAI key exists", async () => {
    let received: LiveAgentSessionOptions | null = null;
    const runner = createLiveAgentSessionRunner(
      {
        native: null,
        isTauriRuntime: false,
        loadSecretKey: async (id) => {
          if (id === SECRET_OPENAI_API_KEY) return " sk-openai ";
          return "";
        },
      },
      async (options) => {
        received = options;
      },
    );

    await runner(createRunnerOptions());

    expect(received?.apiKey).toBe("sk-openai");
    expect(received?.llmProvider).toBe("openai");
    expect(received?.liveModelId).toBe(DEFAULT_APP_SETTINGS.openaiModelId);
  });

  test("live runner respects activeApiProvider when both keys exist", async () => {
    let received: LiveAgentSessionOptions | null = null;
    const loadBoth = async (id: string) => {
      if (id === SECRET_ANTHROPIC_API_KEY) return "anthropic-key";
      if (id === SECRET_OPENAI_API_KEY) return "openai-key";
      return "";
    };
    const runner = createLiveAgentSessionRunner(
      {
        native: null,
        isTauriRuntime: false,
        loadSecretKey: loadBoth,
      },
      async (options) => {
        received = options;
      },
    );

    await runner(
      createRunnerOptions({
        settings: createSettings({ activeApiProvider: "openai", openaiModelId: "gpt-4o-mini" }),
      }),
    );

    expect(received?.llmProvider).toBe("openai");
    expect(received?.apiKey).toBe("openai-key");
    expect(received?.liveModelId).toBe("gpt-4o-mini");

    received = null;

    await runner(
      createRunnerOptions({
        settings: createSettings({
          activeApiProvider: "anthropic",
          anthropicModelId: "claude-opus-4-7",
        }),
      }),
    );

    expect(received?.llmProvider).toBe("anthropic");
    expect(received?.apiKey).toBe("anthropic-key");
    expect(received?.liveModelId).toBe("claude-opus-4-7");
  });
});
