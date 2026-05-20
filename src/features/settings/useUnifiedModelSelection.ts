import { useCallback } from "react";

import { resolveEffectiveProvider } from "@/agent/llm/resolveEffectiveProvider";
import type { AppSettingsPayload, LlmApiProvider } from "@/agent/native/tauriIpc";
import {
  parseUnifiedModelOptionValue,
  unifiedModelOptionValue,
} from "@/features/settings/unifiedModelSelection";

export type UnifiedModelSelectionState = {
  readonly effectiveProvider: LlmApiProvider | null;
  readonly unifiedModelSelectValue: string | undefined;
  readonly onUnifiedModelChange: (value: string) => void;
};

export type UnifiedModelSelectionSnapshot = Pick<
  UnifiedModelSelectionState,
  "effectiveProvider" | "unifiedModelSelectValue"
>;

export function resolveUnifiedModelSelectionSnapshot(
  settings: AppSettingsPayload,
  anthropicKeyStored: boolean,
  openaiKeyStored: boolean,
): UnifiedModelSelectionSnapshot {
  const effectiveProvider = resolveEffectiveProvider(
    settings.activeApiProvider,
    anthropicKeyStored,
    openaiKeyStored,
  );
  if (!effectiveProvider) {
    return { effectiveProvider, unifiedModelSelectValue: undefined };
  }

  const modelId =
    effectiveProvider === "anthropic" ? settings.anthropicModelId : settings.openaiModelId;
  return {
    effectiveProvider,
    unifiedModelSelectValue: unifiedModelOptionValue(effectiveProvider, modelId),
  };
}

export function useUnifiedModelSelection(
  settings: AppSettingsPayload,
  updateSettings: (patch: Partial<AppSettingsPayload>) => Promise<void>,
  anthropicKeyStored: boolean,
  openaiKeyStored: boolean,
): UnifiedModelSelectionState {
  const selection = resolveUnifiedModelSelectionSnapshot(
    settings,
    anthropicKeyStored,
    openaiKeyStored,
  );

  const onUnifiedModelChange = useCallback(
    (value: string) => {
      const parsed = parseUnifiedModelOptionValue(value);
      if (!parsed) return;
      if (parsed.provider === "anthropic") {
        void updateSettings({ anthropicModelId: parsed.modelId, activeApiProvider: "anthropic" });
      } else {
        void updateSettings({ openaiModelId: parsed.modelId, activeApiProvider: "openai" });
      }
    },
    [updateSettings],
  );

  return {
    effectiveProvider: selection.effectiveProvider,
    unifiedModelSelectValue: selection.unifiedModelSelectValue,
    onUnifiedModelChange,
  };
}
