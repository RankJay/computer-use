import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/workspace/browserWorkspace";
import type { LiveAgentSessionOptions } from "@/agent/session/liveAgentSession";
import { runDemoAgentSession } from "@/agent/session/demoAgentSession";
import type { AgentNativeBridge } from "@/agent/native/nativeBridge";
import { createNativeBridge, isTauriRuntime } from "@/agent/native/nativeBridge";
import { SECRET_ANTHROPIC_API_KEY } from "@/agent/secrets";
import { loadSecretKey } from "@/agent/persistence/secretPersistence";
import type { AppSettingsPayload } from "@/agent/native/tauriIpc";
import type { AgentToolName } from "@/agent/toolContract";
import { createEventId, type EmitFn, type PermissionChoice, type PermissionMode } from "@/agent/types";
import type { WorkspaceAdapter } from "@/agent/workspace/workspaceAdapter";

export type AgentSessionRunnerOptions = {
  readonly taskId: string;
  readonly prompt: string;
  readonly settings: AppSettingsPayload;
  readonly workspaceRoot: string | null;
  readonly permissionMode: PermissionMode;
  readonly native: AgentNativeBridge | null;
  /** Override workspace file I/O (defaults to app workspace adapter). */
  readonly workspaceAdapter?: WorkspaceAdapter;
  readonly emit: EmitFn;
  readonly waitForPermissionChoice: (permissionId: string) => Promise<PermissionChoice>;
  readonly persistAlwaysAllow: (toolName: AgentToolName) => Promise<void>;
};

export type AgentSessionRunner = (options: AgentSessionRunnerOptions) => Promise<void>;

export type AgentSessionRunnerHost = {
  readonly native: AgentNativeBridge | null;
  readonly isTauriRuntime: boolean;
  readonly loadSecretKey: (key: string) => Promise<string | null>;
};

export type AgentSessionRunners = {
  readonly demo: AgentSessionRunner;
  readonly live: AgentSessionRunner;
};

type LiveAgentSessionRunner = (options: LiveAgentSessionOptions) => Promise<void>;

async function runLiveAgentSessionFromChunk(options: LiveAgentSessionOptions): Promise<void> {
  const module = await import("@/agent/session/liveAgentSession");
  await module.runLiveAgentSession(options);
}

export function createAgentSessionRunnerHost(): AgentSessionRunnerHost {
  return {
    native: createNativeBridge(),
    isTauriRuntime: isTauriRuntime(),
    loadSecretKey,
  };
}

export function resolveAgentWorkspaceRoot(
  workspaceOverride: string | null,
  settings: Pick<AppSettingsPayload, "workspaceRoot">,
  host: Pick<AgentSessionRunnerHost, "isTauriRuntime">,
): string | null {
  const workspaceRoot =
    workspaceOverride && workspaceOverride.trim().length > 0
      ? workspaceOverride.trim()
      : settings.workspaceRoot?.trim() || null;

  if (!workspaceRoot && !host.isTauriRuntime) {
    return BROWSER_SAMPLE_WORKSPACE_ROOT;
  }

  return workspaceRoot;
}

export function createLiveAgentSessionRunner(
  host: AgentSessionRunnerHost,
  liveRunner: LiveAgentSessionRunner = runLiveAgentSessionFromChunk,
): AgentSessionRunner {
  return async (options) => {
    let apiKey: string;
    try {
      apiKey = (await host.loadSecretKey(SECRET_ANTHROPIC_API_KEY))?.trim() ?? "";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      options.emit({
        id: createEventId(),
        at: Date.now(),
        taskId: options.taskId,
        type: "task.failed",
        message: host.isTauriRuntime
          ? `Could not read API key from OS credential store: ${message}`
          : `Could not read API key from browser storage: ${message}`,
      });
      return;
    }

    if (!apiKey) {
      options.emit({
        id: createEventId(),
        at: Date.now(),
        taskId: options.taskId,
        type: "task.failed",
        message: host.isTauriRuntime
          ? "No Anthropic API key found in the OS store. Open Settings, save your key again, then retry."
          : "No Anthropic API key in browser storage. Open Settings → Save API key, then retry.",
      });
      return;
    }

    await liveRunner({ ...options, apiKey });
  };
}

export function createAgentSessionRunners(host: AgentSessionRunnerHost): AgentSessionRunners {
  return {
    demo: runDemoAgentSession,
    live: createLiveAgentSessionRunner(host),
  };
}

export function selectAgentSessionRunner(
  settings: Pick<AppSettingsPayload, "agentMode">,
  runners: AgentSessionRunners,
): AgentSessionRunner {
  return settings.agentMode === "demo" ? runners.demo : runners.live;
}

export async function runSelectedAgentSession(
  options: AgentSessionRunnerOptions,
  runners: AgentSessionRunners,
): Promise<void> {
  const runner = selectAgentSessionRunner(options.settings, runners);
  await runner(options);
}
