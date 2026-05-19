import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { isTauriRuntime } from "@/agent/native/nativeBridge";
import type { AppSettingsPayload } from "@/agent/native/tauriIpc";
import {
  loadAppSettings,
  saveAppSettings,
  settingsForRuntime,
  settingsOrDefault,
} from "@/agent/persistence/settingsPersistence";
import type { AgentToolName } from "@/agent/toolContract";
import { parsePermissionMode, type PermissionMode } from "@/agent/types";

type SettingsContextValue = {
  ready: boolean;
  settings: AppSettingsPayload;
  permissionMode: PermissionMode;
  setPermissionMode: (mode: PermissionMode) => void;
  updateSettings: (patch: Partial<AppSettingsPayload>) => Promise<void>;
  refresh: () => Promise<void>;
  persistToolApproval: (tool: AgentToolName) => Promise<void>;
  revokePersistedApprovals: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider(props: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettingsState] = useState<AppSettingsPayload>(() => settingsOrDefault(null));

  const refresh = useCallback(async () => {
    const loaded = await loadAppSettings();
    setSettingsState(settingsForRuntime(loaded, isTauriRuntime()));
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateSettings = useCallback(async (patch: Partial<AppSettingsPayload>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      void saveAppSettings(next);
      return next;
    });
  }, []);

  const setPermissionMode = useCallback(
    async (mode: PermissionMode) => {
      await updateSettings({ permissionMode: mode });
    },
    [updateSettings],
  );

  const persistToolApproval = useCallback(async (tool: AgentToolName) => {
    setSettingsState((prev) => {
      if (prev.persistedApprovals.includes(tool)) {
        return prev;
      }
      const next = {
        ...prev,
        persistedApprovals: [...prev.persistedApprovals, tool],
      };
      void saveAppSettings(next);
      return next;
    });
  }, []);

  const revokePersistedApprovals = useCallback(async () => {
    await updateSettings({ persistedApprovals: [] });
  }, [updateSettings]);

  const permissionMode = useMemo(
    () => parsePermissionMode(settings.permissionMode),
    [settings.permissionMode],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      ready,
      settings,
      permissionMode,
      setPermissionMode,
      updateSettings,
      refresh,
      persistToolApproval,
      revokePersistedApprovals,
    }),
    [
      ready,
      settings,
      permissionMode,
      setPermissionMode,
      updateSettings,
      refresh,
      persistToolApproval,
      revokePersistedApprovals,
    ],
  );

  return <SettingsContext.Provider value={value}>{props.children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
