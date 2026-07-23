import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { resetAttemptHost } from "@/lib/session";
import { clearLogs, openLogsFolder, resetSession } from "@/lib/settings/maintenance/commands";

function maintenanceMutationError(action: string) {
  return () => {
    toast.error(`Could not ${action}. Try again.`);
  };
}

export function useOpenLogsFolder() {
  return useMutation({
    mutationFn: openLogsFolder,
    onError: maintenanceMutationError("open logs folder"),
  });
}

export function useClearLogs() {
  return useMutation({
    mutationFn: clearLogs,
    onSuccess: () => {
      toast.success("Logs cleared");
    },
    onError: maintenanceMutationError("clear logs"),
  });
}

export function useResetSession() {
  return useMutation({
    mutationFn: async () => {
      await resetAttemptHost();
      await resetSession();
    },
    onSuccess: () => {
      toast.success("Session reset");
    },
    onError: maintenanceMutationError("reset session"),
  });
}
