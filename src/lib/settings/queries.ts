import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

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

export function settingsQueryOptions() {
  return queryOptions({
    queryKey: settingsKeys.loaded(),
    queryFn: async (): Promise<LoadedSettings> => {
      const loaded = await persistence.load();
      return loadedSettingsOrDefault(loaded);
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<AppSettings>): Promise<LoadedSettings> => {
      const current = await queryClient.ensureQueryData(settingsQueryOptions());
      const nextSettings = mergeSettingsPatch(stripSecrets(current), patch);
      await persistence.saveSettings(nextSettings);
      return { ...nextSettings, secrets: current.secrets };
    },
    onSuccess: (next) => {
      queryClient.setQueryData(settingsKeys.loaded(), next);
    },
    onError: settingsMutationError("settings"),
  });
}

export function useUpdateSecret() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      key,
      value,
    }: {
      key: keyof AppSecrets;
      value: string;
    }): Promise<LoadedSettings> => {
      const current = await queryClient.ensureQueryData(settingsQueryOptions());
      const sanitized = sanitizeApiKey(value);
      await persistence.saveSecret(key, sanitized);
      return {
        ...stripSecrets(current),
        secrets: { ...current.secrets, [key]: sanitized },
      };
    },
    onSuccess: (next) => {
      queryClient.setQueryData(settingsKeys.loaded(), next);
    },
    onError: settingsMutationError("API key"),
  });
}

export function usePersistToolApproval() {
  const queryClient = useQueryClient();
  const updateSettings = useUpdateSettings();

  return useCallback(
    async (tool: string) => {
      const current =
        queryClient.getQueryData<LoadedSettings>(settingsKeys.loaded()) ??
        (await queryClient.ensureQueryData(settingsQueryOptions()));

      if (current.persistedApprovals.includes(tool)) {
        return;
      }

      await updateSettings.mutateAsync({
        persistedApprovals: [...current.persistedApprovals, tool],
      });
    },
    [queryClient, updateSettings],
  );
}
