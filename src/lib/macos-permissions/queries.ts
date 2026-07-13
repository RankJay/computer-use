import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";

import { isTauriRuntime } from "@/lib/agent/is-tauri-runtime";
import {
  getMacOsPermissionStatus,
  openMacOsPrivacySettings,
  requestMacOsPermission,
} from "@/lib/macos-permissions/commands";
import type { MacOsPermissionKind } from "@/lib/macos-permissions/types";

export const macosPermissionKeys = {
  all: ["macos-permissions"] as const,
  status: () => [...macosPermissionKeys.all, "status"] as const,
};

export function macosPermissionStatusQueryOptions() {
  return queryOptions({
    queryKey: macosPermissionKeys.status(),
    queryFn: getMacOsPermissionStatus,
    enabled: isTauriRuntime(),
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
    onError: () => {
      toast.error("Could not request permission. Try again.");
    },
  });
}

export function useOpenMacOsPrivacySettings() {
  return useMutation({
    mutationFn: (kind: MacOsPermissionKind) => openMacOsPrivacySettings(kind),
    onError: () => {
      toast.error("Could not open System Settings.");
    },
  });
}
