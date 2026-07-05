import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { loadedSettingsOrDefault } from "@/lib/settings/defaults";
import { settingsService } from "@/lib/settings/settings-service";
import type { AppSecrets, AppSettings, LoadedSettings } from "@/lib/settings/types";

export type SettingsState = {
  ready: boolean;
  error: string | null;
  settings: LoadedSettings;
};

export type SettingsActions = {
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  updateSecret: (key: keyof AppSecrets, value: string) => Promise<void>;
  refresh: () => Promise<void>;
  persistToolApproval: (tool: string) => Promise<void>;
  revokePersistedApprovals: () => Promise<void>;
};

export type SettingsContextValue = SettingsState & SettingsActions;

const SettingsStateContext = createContext<SettingsState | null>(null);
const SettingsActionsContext = createContext<SettingsActions | null>(null);

export function SettingsProvider(props: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<LoadedSettings>(() => loadedSettingsOrDefault(null));

  const refresh = useCallback(async () => {
    const loaded = await settingsService.refreshSettings();
    setSettings(loaded);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void settingsService
      .initSettings()
      .then((loaded: LoadedSettings) => {
        if (!cancelled) {
          setSettings(loaded);
          setError(null);
        }
        return loaded;
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : "Failed to load settings";
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      try {
        const next = await settingsService.saveSettings(patch);
        setSettings(next);
        setError(null);
      } catch (cause: unknown) {
        const message = cause instanceof Error ? cause.message : "Failed to save settings";
        setError(message);
        await refresh();
        throw cause;
      }
    },
    [refresh],
  );

  const updateSecret = useCallback(
    async (key: keyof AppSecrets, value: string) => {
      try {
        const next = await settingsService.saveSecret(key, value);
        setSettings(next);
        setError(null);
      } catch (cause: unknown) {
        const message = cause instanceof Error ? cause.message : "Failed to save secret";
        setError(message);
        await refresh();
        throw cause;
      }
    },
    [refresh],
  );

  const persistToolApproval = useCallback(
    async (tool: string) => {
      const current = settingsService.getCachedSettings();
      if (!current || current.persistedApprovals.includes(tool)) {
        return;
      }
      await updateSettings({
        persistedApprovals: [...current.persistedApprovals, tool],
      });
    },
    [updateSettings],
  );

  const revokePersistedApprovals = useCallback(async () => {
    await updateSettings({ persistedApprovals: [] });
  }, [updateSettings]);

  const stateValue = useMemo<SettingsState>(
    () => ({ ready, error, settings }),
    [ready, error, settings],
  );

  const actionsValue = useMemo<SettingsActions>(
    () => ({
      updateSettings,
      updateSecret,
      refresh,
      persistToolApproval,
      revokePersistedApprovals,
    }),
    [updateSettings, updateSecret, refresh, persistToolApproval, revokePersistedApprovals],
  );

  return (
    <SettingsActionsContext.Provider value={actionsValue}>
      <SettingsStateContext.Provider value={stateValue}>
        {props.children}
      </SettingsStateContext.Provider>
    </SettingsActionsContext.Provider>
  );
}

export function useSettingsState(): SettingsState {
  const ctx = useContext(SettingsStateContext);
  if (!ctx) {
    throw new Error("useSettingsState must be used within SettingsProvider");
  }
  return ctx;
}

export function useSettingsActions(): SettingsActions {
  const ctx = useContext(SettingsActionsContext);
  if (!ctx) {
    throw new Error("useSettingsActions must be used within SettingsProvider");
  }
  return ctx;
}

export function useSettings(): SettingsContextValue {
  return { ...useSettingsState(), ...useSettingsActions() };
}
