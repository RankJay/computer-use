import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { queryClient } from "@/app/query-client";
import { sanitizeApiKey } from "@/lib/settings/api-key";
import { loadedSettingsOrDefault, mergeSettingsPatch } from "@/lib/settings/defaults";
import { createSettingsPersistence } from "@/lib/settings/persistence";
import type { AppSecrets, AppSettings, LoadedSettings } from "@/lib/settings/types";

const persistence = createSettingsPersistence();

function settingsMutationError(scope: string) {
  return () => {
    toast.error(`Could not save ${scope}. Try again.`);
  };
}

export const settingsKeys = {
  all: ["settings"] as const,
  loaded: () => [...settingsKeys.all, "loaded"] as const,
};

function stripSecrets(settings: LoadedSettings): AppSettings {
  const { secrets: _secrets, ...appSettings } = settings;
  return appSettings;
}

function mergeSecretsIntoCache(secrets: AppSecrets): void {
  queryClient.setQueryData<LoadedSettings>(settingsKeys.loaded(), (current) => {
    if (!current) {
      return current;
    }
    return { ...current, secrets };
  });
}

let secretsHydration: Promise<AppSecrets> | null = null;

/** Background vault open — does not gate first paint. */
export function scheduleSecretsHydration(): void {
  void ensureSecretsReady();
}

/** Await Stronghold secrets and patch the settings cache. Idempotent. */
export function ensureSecretsReady(): Promise<AppSecrets> {
  if (!secretsHydration) {
    secretsHydration = persistence
      .loadSecrets()
      .then((secrets) => {
        mergeSecretsIntoCache(secrets);
        return secrets;
      })
      .catch((error: unknown) => {
        secretsHydration = null;
        throw error;
      });
  }
  return secretsHydration;
}

export function settingsQueryOptions() {
  return queryOptions({
    queryKey: settingsKeys.loaded(),
    queryFn: async (): Promise<LoadedSettings> => {
      const loaded = await persistence.load();
      const result = loadedSettingsOrDefault(loaded);
      scheduleSecretsHydration();
      return result;
    },
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
}

export function useLoadedSettings() {
  return useSuspenseQuery(settingsQueryOptions());
}

/** Subscribe to a slice of settings; re-renders only when the selected value changes. */
export function useSettingsSelector<TSelected>(
  selector: (settings: LoadedSettings) => TSelected,
): TSelected {
  return useSuspenseQuery({
    ...settingsQueryOptions(),
    select: selector,
  }).data;
}

export function useUpdateSettings() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<AppSettings>): Promise<LoadedSettings> => {
      const current = await client.ensureQueryData(settingsQueryOptions());
      // Never write placeholder DEFAULT_SECRETS into cache from a pre-hydration patch.
      const secrets = await ensureSecretsReady();
      const nextSettings = mergeSettingsPatch(stripSecrets(current), patch);
      await persistence.saveSettings(nextSettings);
      return { ...nextSettings, secrets };
    },
    onSuccess: (next) => {
      client.setQueryData(settingsKeys.loaded(), next);
    },
    onError: settingsMutationError("settings"),
  });
}

export function useUpdateSecret() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async ({
      key,
      value,
    }: {
      key: keyof AppSecrets;
      value: string;
    }): Promise<LoadedSettings> => {
      const current = await client.ensureQueryData(settingsQueryOptions());
      await ensureSecretsReady();
      const sanitized = sanitizeApiKey(value);
      await persistence.saveSecret(key, sanitized);
      const latest = client.getQueryData<LoadedSettings>(settingsKeys.loaded()) ?? current;
      return {
        ...stripSecrets(latest),
        secrets: { ...latest.secrets, [key]: sanitized },
      };
    },
    onSuccess: (next) => {
      client.setQueryData(settingsKeys.loaded(), next);
    },
    onError: settingsMutationError("API key"),
  });
}

export function usePersistToolApproval() {
  const client = useQueryClient();
  // Depend on mutateAsync only — the full mutation result object changes every render.
  const { mutateAsync } = useUpdateSettings();

  return useCallback(
    async (tool: string) => {
      const current =
        client.getQueryData<LoadedSettings>(settingsKeys.loaded()) ??
        (await client.ensureQueryData(settingsQueryOptions()));

      if (current.persistedApprovals.includes(tool)) {
        return;
      }

      await mutateAsync({
        persistedApprovals: [...current.persistedApprovals, tool],
      });
    },
    [client, mutateAsync],
  );
}
