import { createHostRuntime, type HostRuntime } from "@/agent/host/hostRuntime";
import type { AgentNativeBridge } from "@/agent/native/nativeBridge";
import type { AppSettingsPayload } from "@/agent/native/tauriIpc";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/workspace/browserWorkspace";
import type { TauriInvoke } from "@/agent/workspace/workspaceAdapter";

type TestHostOptions = {
  readonly isDesktop?: boolean;
  readonly secrets?: Readonly<Record<string, string>>;
  readonly native?: AgentNativeBridge | null;
  readonly invoke?: TauriInvoke;
};

export function createTestHostRuntime(options: TestHostOptions = {}): HostRuntime {
  const isDesktop = options.isDesktop ?? false;

  return createHostRuntime({
    detectDesktop: () => isDesktop,
    invoke: options.invoke ?? (async () => null),
    localStorage: () => globalThis.localStorage,
    createNativeBridge: () => options.native ?? null,
    minimizeWindow: async () => {},
    startWindowDrag: () => {},
  });
}

export function createWebTestHost(secrets: Readonly<Record<string, string>> = {}): HostRuntime {
  const base = createTestHostRuntime({ isDesktop: false, secrets });
  return {
    ...base,
    loadSecret: async (key) => secrets[key] ?? null,
    resolveWorkspaceRoot: (workspaceOverride, settings) => {
      const workspaceRoot =
        workspaceOverride && workspaceOverride.trim().length > 0
          ? workspaceOverride.trim()
          : settings.workspaceRoot?.trim() || null;
      if (!workspaceRoot) return BROWSER_SAMPLE_WORKSPACE_ROOT;
      return workspaceRoot;
    },
    apiKeyReadFailureMessage: (error) => `Could not read API key from browser storage: ${error}`,
    missingApiKeyFailureMessage: () =>
      "No API key in browser storage. Open Settings and save an Anthropic or OpenAI key, then retry.",
  };
}

export function createDesktopTestHost(secrets: Readonly<Record<string, string>> = {}): HostRuntime {
  const base = createTestHostRuntime({ isDesktop: true, secrets });
  return {
    ...base,
    loadSecret: async (key) => secrets[key] ?? null,
    resolveWorkspaceRoot: (workspaceOverride, settings) => {
      const workspaceRoot =
        workspaceOverride && workspaceOverride.trim().length > 0
          ? workspaceOverride.trim()
          : settings.workspaceRoot?.trim() || null;
      return workspaceRoot;
    },
    apiKeyReadFailureMessage: (error) =>
      `Could not read API key from OS credential store: ${error}`,
    missingApiKeyFailureMessage: () =>
      "No API key found in the OS store. Open Settings and save an Anthropic or OpenAI key, then retry.",
  };
}

export function resolveWorkspaceRootWithHost(
  workspaceOverride: string | null,
  settings: Pick<AppSettingsPayload, "workspaceRoot">,
  isDesktop: boolean,
): string | null {
  const host = isDesktop ? createDesktopTestHost() : createWebTestHost();
  return host.resolveWorkspaceRoot(workspaceOverride, settings);
}
