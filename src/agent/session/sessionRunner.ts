import { hostRuntime, type HostRuntime } from "@/agent/host/hostRuntime";
import { resolveEffectiveProvider } from "@/agent/llm/resolveEffectiveProvider";
import type { AgentNativeBridge } from "@/agent/native/nativeBridge";
import type { AppSettingsPayload } from "@/agent/native/tauriIpc";
import { SECRET_ANTHROPIC_API_KEY, SECRET_OPENAI_API_KEY } from "@/agent/secrets";
import { runDemoAgentSession } from "@/agent/session/demoAgentSession";
import type { LiveAgentSessionOptions } from "@/agent/session/liveAgentSession";
import type { AgentToolName } from "@/agent/toolContract";
import {
  createEventId,
  type EmitFn,
  type PermissionChoice,
  type PermissionMode,
  type RunBudget,
} from "@/agent/types";
import type { WorkspaceAdapter } from "@/agent/workspace/workspaceAdapter";

export type AgentSessionRunnerOptions = {
  readonly taskId: string;
  readonly prompt: string;
  readonly settings: AppSettingsPayload;
  readonly workspaceRoot: string | null;
  readonly abortSignal: AbortSignal;
  readonly permissionMode: PermissionMode;
  readonly native: AgentNativeBridge | null;
  readonly runBudgetOverride?: RunBudget;
  /** Override workspace file I/O (defaults to app workspace adapter). */
  readonly workspaceAdapter?: WorkspaceAdapter;
  readonly emit: EmitFn;
  readonly waitForPermissionChoice: (permissionId: string) => Promise<PermissionChoice>;
  readonly persistAlwaysAllow: (toolName: AgentToolName) => Promise<void>;
};

export type AgentSessionRunner = (options: AgentSessionRunnerOptions) => Promise<void>;

export type AgentSessionRunnerHost = HostRuntime;

export type AgentSessionRunners = {
  readonly demo: AgentSessionRunner;
  readonly live: AgentSessionRunner;
};

type LiveAgentSessionRunner = (options: LiveAgentSessionOptions) => Promise<void>;

async function runLiveAgentSessionFromChunk(options: LiveAgentSessionOptions): Promise<void> {
  const module = await import("@/agent/session/liveAgentSession");
  await module.runLiveAgentSession(options);
}

export function createAgentSessionRunnerHost(
  runtime: HostRuntime = hostRuntime,
): AgentSessionRunnerHost {
  return runtime;
}

export function resolveAgentWorkspaceRoot(
  workspaceOverride: string | null,
  settings: Pick<AppSettingsPayload, "workspaceRoot">,
  host: AgentSessionRunnerHost,
): string | null {
  return host.resolveWorkspaceRoot(workspaceOverride, settings);
}

export function createLiveAgentSessionRunner(
  host: AgentSessionRunnerHost,
  liveRunner: LiveAgentSessionRunner = runLiveAgentSessionFromChunk,
): AgentSessionRunner {
  return async (options) => {
    let anthropicKey = "";
    let openaiKey = "";
    try {
      anthropicKey = (await host.loadSecret(SECRET_ANTHROPIC_API_KEY))?.trim() ?? "";
      openaiKey = (await host.loadSecret(SECRET_OPENAI_API_KEY))?.trim() ?? "";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      options.emit({
        id: createEventId(),
        at: Date.now(),
        taskId: options.taskId,
        type: "task.failed",
        message: host.apiKeyReadFailureMessage(message),
      });
      return;
    }

    const provider = resolveEffectiveProvider(
      options.settings.activeApiProvider,
      anthropicKey.length > 0,
      openaiKey.length > 0,
    );

    if (!provider) {
      options.emit({
        id: createEventId(),
        at: Date.now(),
        taskId: options.taskId,
        type: "task.failed",
        message: host.missingApiKeyFailureMessage(),
      });
      return;
    }

    const apiKey = provider === "anthropic" ? anthropicKey : openaiKey;
    const liveModelId =
      provider === "anthropic" ? options.settings.anthropicModelId : options.settings.openaiModelId;

    await liveRunner({ ...options, apiKey, llmProvider: provider, liveModelId });
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
