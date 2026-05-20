import { useMemo } from "react";

import { hostRuntime } from "@/agent/host/hostRuntime";
import type { AppSettingsPayload, LlmApiProvider } from "@/agent/native/tauriIpc";
import { SECRET_ANTHROPIC_API_KEY, SECRET_OPENAI_API_KEY } from "@/agent/secrets";
import type { PermissionMode } from "@/agent/types";
import { useSettings } from "@/app/providers/SettingsProvider";
import { useAgentSessionContext } from "@/features/control-center/AgentSessionContext";
import {
  useLogSettingsCommands,
  useSecretKeySettings,
  type SecretKeySettingsState,
} from "@/features/settings/useSettingsCommands";
import type { UnifiedModelSelectionState } from "@/features/settings/useUnifiedModelSelection";
import { useUnifiedModelSelection } from "@/features/settings/useUnifiedModelSelection";

type SettingsProviderKeyAvailabilityInput = {
  readonly anthropicKeyStored: boolean;
  readonly openaiKeyStored: boolean;
};

export type SettingsProviderKeyAvailability = Record<
  LlmApiProvider,
  {
    readonly provider: LlmApiProvider;
    readonly hasStoredKey: boolean;
    readonly disabled: boolean;
  }
>;

export type SettingsSecretKeyModel = SecretKeySettingsState & {
  readonly id: string;
  readonly label: string;
  readonly emptyPlaceholder: string;
  readonly saveLabel: string;
  readonly removeLabel: string;
};

export type SettingsRuntimeModel = {
  readonly isDesktop: boolean;
  readonly storageHint: string;
  readonly overviewCopy: string;
};

export type SettingsModelProviderModel = {
  readonly settings: AppSettingsPayload;
  readonly updateSettings: (patch: Partial<AppSettingsPayload>) => Promise<void>;
  readonly modelSelection: UnifiedModelSelectionState;
  readonly providerKeys: SettingsProviderKeyAvailability;
};

export type SettingsGeneralModel = {
  readonly isDesktop: boolean;
  readonly settings: AppSettingsPayload;
  readonly permissionMode: PermissionMode;
  readonly updateSettings: (patch: Partial<AppSettingsPayload>) => Promise<void>;
  readonly setPermissionMode: (mode: PermissionMode) => void;
};

export type SettingsMaintenanceCommands = {
  readonly onRevokePersistedApprovals: () => void;
  readonly onResetSession: () => void;
  readonly logs: ReturnType<typeof useLogSettingsCommands>;
};

export type SettingsPageModel = {
  readonly runtime: SettingsRuntimeModel;
  readonly modelProvider: SettingsModelProviderModel;
  readonly secretKeys: readonly SettingsSecretKeyModel[];
  readonly general: SettingsGeneralModel;
  readonly maintenance: SettingsMaintenanceCommands;
};

export function createSettingsProviderKeyAvailability(
  input: SettingsProviderKeyAvailabilityInput,
): SettingsProviderKeyAvailability {
  return {
    anthropic: {
      provider: "anthropic",
      hasStoredKey: input.anthropicKeyStored,
      disabled: !input.anthropicKeyStored,
    },
    openai: {
      provider: "openai",
      hasStoredKey: input.openaiKeyStored,
      disabled: !input.openaiKeyStored,
    },
  };
}

function createRuntimeModel(): SettingsRuntimeModel {
  return {
    isDesktop: hostRuntime.isDesktop,
    storageHint: hostRuntime.secretStorageLabel,
    overviewCopy: hostRuntime.isDesktop
      ? "Desktop: secrets use the OS credential store."
      : "Web: settings and keys stay in this browser only (localStorage), not on a server.",
  };
}

export function useSettingsPageModel(): SettingsPageModel {
  const { resetSession } = useAgentSessionContext();
  const { settings, setPermissionMode, permissionMode, updateSettings, revokePersistedApprovals } =
    useSettings();
  const anthropicKey = useSecretKeySettings(SECRET_ANTHROPIC_API_KEY);
  const openaiKey = useSecretKeySettings(SECRET_OPENAI_API_KEY);
  const logs = useLogSettingsCommands();

  const providerKeys = useMemo(
    () =>
      createSettingsProviderKeyAvailability({
        anthropicKeyStored: anthropicKey.hasStoredKey,
        openaiKeyStored: openaiKey.hasStoredKey,
      }),
    [anthropicKey.hasStoredKey, openaiKey.hasStoredKey],
  );

  const modelSelection = useUnifiedModelSelection(
    settings,
    updateSettings,
    providerKeys.anthropic.hasStoredKey,
    providerKeys.openai.hasStoredKey,
  );

  const runtime = useMemo(() => createRuntimeModel(), []);

  const secretKeys = useMemo<readonly SettingsSecretKeyModel[]>(
    () => [
      {
        ...anthropicKey,
        id: "anthropic-api-key",
        label: "Anthropic API key",
        emptyPlaceholder: "sk-ant-api03-…",
        saveLabel: "Save Anthropic key",
        removeLabel: "Remove Anthropic key",
      },
      {
        ...openaiKey,
        id: "openai-api-key",
        label: "OpenAI API key",
        emptyPlaceholder: "sk-…",
        saveLabel: "Save OpenAI key",
        removeLabel: "Remove OpenAI key",
      },
    ],
    [anthropicKey, openaiKey],
  );

  return {
    runtime,
    modelProvider: {
      settings,
      updateSettings,
      modelSelection,
      providerKeys,
    },
    secretKeys,
    general: {
      isDesktop: runtime.isDesktop,
      settings,
      permissionMode,
      updateSettings,
      setPermissionMode,
    },
    maintenance: {
      onRevokePersistedApprovals: revokePersistedApprovals,
      onResetSession: resetSession,
      logs,
    },
  };
}
