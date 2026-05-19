import { useCallback, useMemo } from "react";

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

export function useUnifiedModelSelection(
  settings: AppSettingsPayload,
  updateSettings: (patch: Partial<AppSettingsPayload>) => Promise<void>,
  anthropicKeyStored: boolean,
  openaiKeyStored: boolean,
): UnifiedModelSelectionState {
  const effectiveProvider = useMemo(
    () => resolveEffectiveProvider(settings.activeApiProvider, anthropicKeyStored, openaiKeyStored),
    [settings.activeApiProvider, anthropicKeyStored, openaiKeyStored],
  );

  const unifiedModelSelectValue = useMemo((): string | undefined => {
    if (!effectiveProvider) return undefined;
    const modelId =
      effectiveProvider === "anthropic" ? settings.anthropicModelId : settings.openaiModelId;
    return unifiedModelOptionValue(effectiveProvider, modelId);
  }, [effectiveProvider, settings.anthropicModelId, settings.openaiModelId]);

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

  return { effectiveProvider, unifiedModelSelectValue, onUnifiedModelChange };
}
