import { useCallback, useEffect, useState } from "react";

import { isTauriRuntime } from "@/agent/native/nativeBridge";
import {
  deleteSecretKey,
  loadSecretKey,
  storeSecretKey,
} from "@/agent/persistence/secretPersistence";
import { clearAllLogs, openLogsFolder } from "@/agent/persistence/sessionLogs";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useSecretKeySettings(secretId: string) {
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const refreshKeyState = useCallback(async () => {
    try {
      const value = await loadSecretKey(secretId);
      const trimmed = value?.trim() ?? "";
      setHasStoredKey(trimmed.length > 0);
      setApiKeyDraft(trimmed);
      setApiKeyError(null);
    } catch (error) {
      const storageName = isTauriRuntime() ? "OS store" : "browser storage";
      setApiKeyError(`Could not read key from ${storageName}: ${errorMessage(error)}`);
      setHasStoredKey(false);
    }
  }, [secretId]);

  useEffect(() => {
    void refreshKeyState();
  }, [refreshKeyState]);

  const saveSecret = useCallback(async () => {
    const value = apiKeyDraft.trim();
    if (!value) return;
    setApiKeyError(null);
    try {
      await storeSecretKey(secretId, value);
      await refreshKeyState();
    } catch (error) {
      setApiKeyError(`Save failed: ${errorMessage(error)}`);
    }
  }, [apiKeyDraft, refreshKeyState, secretId]);

  const removeSecret = useCallback(async () => {
    setApiKeyError(null);
    try {
      await deleteSecretKey(secretId);
      setApiKeyDraft("");
      await refreshKeyState();
    } catch (error) {
      setApiKeyError(`Remove failed: ${errorMessage(error)}`);
    }
  }, [refreshKeyState, secretId]);

  return {
    apiKeyDraft,
    setApiKeyDraft,
    hasStoredKey,
    apiKeyError,
    saveSecret,
    removeSecret,
  };
}

export function useLogSettingsCommands() {
  const [confirmClearLogsOpen, setConfirmClearLogsOpen] = useState(false);

  const clearLogs = useCallback(() => {
    setConfirmClearLogsOpen(false);
    void clearAllLogs();
  }, []);

  return {
    confirmClearLogsOpen,
    setConfirmClearLogsOpen,
    clearLogs,
    openLogsFolder,
  };
}
