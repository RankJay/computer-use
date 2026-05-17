import type { AgentToolName } from "@/agent/toolContract";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/browserWorkspace";
import { isTauriRuntime } from "@/agent/nativeBridge";
import { loadAppSettings, saveAppSettings, settingsOrDefault } from "@/agent/settingsApi";
import type { AppSettingsPayload } from "@/agent/tauriIpc";
import type { PermissionMode } from "@/agent/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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

function parsePermissionMode(raw: string): PermissionMode {
  switch (raw) {
    case "ask_risky":
    case "ask_all":
    case "session_low_risk":
      return raw;
    default:
      return "ask_risky";
  }
}

export function SettingsProvider(props: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettingsState] = useState<AppSettingsPayload>(() => settingsOrDefault(null));

  const refresh = useCallback(async () => {
    if (!isTauriRuntime()) {
      const loaded = await loadAppSettings();
      const base = settingsOrDefault(loaded);
      const next =
        !base.workspaceRoot || base.workspaceRoot.trim() === ""
          ? { ...base, workspaceRoot: BROWSER_SAMPLE_WORKSPACE_ROOT }
          : base;
      setSettingsState(next);
      setReady(true);
      return;
    }
    const loaded = await loadAppSettings();
    setSettingsState(settingsOrDefault(loaded));
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
