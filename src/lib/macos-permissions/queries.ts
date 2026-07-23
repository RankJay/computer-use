import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { mapInvokeError } from "@/lib/agent/capabilities/native-invoke";
import {
  getMacOsPermissionStatus,
  openMacOsPrivacySettings,
  requestMacOsPermission,
} from "@/lib/macos-permissions/commands";
import type { MacOsPermissionKind } from "@/lib/macos-permissions/types";
import { isTauriRuntime } from "@/lib/runtime/is-tauri-runtime";
import { isMacOsClient } from "@/lib/runtime/platform";

export const macosPermissionKeys = {
  all: ["macos-permissions"] as const,
  status: () => [...macosPermissionKeys.all, "status"] as const,
};

/** Map invoke rejection; toast unless the platform has no TCC permissions. */
export function reportMacOsPermissionError(error: unknown): { code: string; message: string } {
  const mapped = mapInvokeError(error);
  if (mapped.code !== "unsupported_platform") {
    toast.error(mapped.message);
  }
  return { code: mapped.code, message: mapped.message };
}

export function macosPermissionStatusQueryOptions() {
  return queryOptions({
    queryKey: macosPermissionKeys.status(),
    queryFn: getMacOsPermissionStatus,
    enabled: isTauriRuntime() && isMacOsClient(),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
}

/** Lazy status probe — only fetches once the settings section mounts. */
export function useMacOsPermissionStatus() {
  return useQuery(macosPermissionStatusQueryOptions());
}

export function useRequestMacOsPermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (kind: MacOsPermissionKind) => requestMacOsPermission(kind),
    onSuccess: (status) => {
      queryClient.setQueryData(macosPermissionKeys.status(), status);
    },
    onError: (error) => {
      reportMacOsPermissionError(error);
    },
  });
}

export function useOpenMacOsPrivacySettings() {
  return useMutation({
    mutationFn: (kind: MacOsPermissionKind) => openMacOsPrivacySettings(kind),
    onError: (error) => {
      reportMacOsPermissionError(error);
    },
  });
}
