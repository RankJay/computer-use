import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { clearLogs, openLogsFolder, resetSession } from "@/lib/maintenance/commands";
import { resetActiveSessionEngine } from "@/lib/session";

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
      await resetActiveSessionEngine();
      await resetSession();
    },
    onSuccess: () => {
      toast.success("Session reset");
    },
    onError: maintenanceMutationError("reset session"),
  });
}
