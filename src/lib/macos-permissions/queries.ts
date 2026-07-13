import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import { mapInvokeError } from "@/lib/agent/capabilities/native-invoke";
import { isTauriRuntime } from "@/lib/agent/is-tauri-runtime";
import {
  getMacOsPermissionStatus,
  openMacOsPrivacySettings,
  requestMacOsPermission,
} from "@/lib/macos-permissions/commands";
import type { MacOsPermissionKind } from "@/lib/macos-permissions/types";
import { isMacOsClient } from "@/lib/platform";

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
  const query = useQuery(macosPermissionStatusQueryOptions());

  useEffect(() => {
    if (!isTauriRuntime()) return;

    const onFocus = () => {
      void query.refetch();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [query.refetch]);

  return query;
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
