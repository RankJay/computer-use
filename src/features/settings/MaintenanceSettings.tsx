import { FolderOpen } from "lucide-react";
import { useState, type ReactElement } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import { settingsGhostButtonClassName } from "@/features/settings/styles";
import {
  useClearLogs,
  useOpenLogsFolder,
  useResetSession,
} from "@/lib/maintenance/queries";
import { useSettingsSelector, useUpdateSettings } from "@/lib/settings/queries";
import { selectHasPersistedApprovals } from "@/lib/settings/selectors";

export function MaintenanceSettings(): ReactElement {
  const hasPersistedApprovals = useSettingsSelector(selectHasPersistedApprovals);
  const updateSettings = useUpdateSettings();
  const openLogsFolder = useOpenLogsFolder();
  const clearLogs = useClearLogs();
  const resetSession = useResetSession();
  const [clearLogsOpen, setClearLogsOpen] = useState(false);
  const [resetSessionOpen, setResetSessionOpen] = useState(false);

  async function handleClearLogs(): Promise<void> {
    try {
      await clearLogs.mutateAsync();
      setClearLogsOpen(false);
    } catch {
      // Error toast is handled by the mutation onError callback.
    }
  }

  async function handleResetSession(): Promise<void> {
    try {
      await resetSession.mutateAsync();
      setResetSessionOpen(false);
    } catch {
      // Error toast is handled by the mutation onError callback.
    }
  }

  return (
    <SettingsSection title="Maintenance">
      <SettingsRow
        label="Persistent approvals"
        description="Revoke saved tool approvals stored on this device."
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasPersistedApprovals || updateSettings.isPending}
          className={settingsGhostButtonClassName}
          onClick={() => updateSettings.mutate({ persistedApprovals: [] })}
        >
          Revoke
        </Button>
      </SettingsRow>

      <SettingsRow label="Local logs" description="View log files stored on disk.">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={openLogsFolder.isPending}
          className={settingsGhostButtonClassName}
          onClick={() => openLogsFolder.mutate()}
        >
          <FolderOpen />
          Open folder
        </Button>
      </SettingsRow>

      <SettingsRow label="Clear all logs" description="Permanently delete all local log files.">
        <AlertDialog open={clearLogsOpen} onOpenChange={setClearLogsOpen}>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={clearLogs.isPending}
                className={settingsGhostButtonClassName}
              >
                Clear
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all logs?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes all local log files. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={clearLogs.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={clearLogs.isPending}
                onClick={() => {
                  void handleClearLogs();
                }}
              >
                Clear logs
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SettingsRow>

      <SettingsRow label="Session" description="Reset in-memory timeline and execution log.">
        <AlertDialog open={resetSessionOpen} onOpenChange={setResetSessionOpen}>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resetSession.isPending}
                className={settingsGhostButtonClassName}
              >
                Reset
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset session?</AlertDialogTitle>
              <AlertDialogDescription>
                Clears the in-memory timeline and execution log. Running tasks may be interrupted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={resetSession.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={resetSession.isPending}
                onClick={() => {
                  void handleResetSession();
                }}
              >
                Reset session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SettingsRow>
    </SettingsSection>
  );
}
