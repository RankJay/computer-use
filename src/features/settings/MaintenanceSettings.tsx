import { FolderOpen } from "lucide-react";
import type { ReactElement } from "react";

import { useSettingsActions, useSettingsState } from "@/app/providers/SettingsProvider";
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
import { settingsGhostButtonClassName } from "@/features/settings/settings-control-styles";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";

export function MaintenanceSettings(): ReactElement {
  const { settings } = useSettingsState();
  const { revokePersistedApprovals } = useSettingsActions();
  const hasPersistedApprovals = settings.persistedApprovals.length > 0;

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
          className={settingsGhostButtonClassName}
          disabled={!hasPersistedApprovals}
          onClick={() => void revokePersistedApprovals()}
        >
          Revoke
        </Button>
      </SettingsRow>

      <SettingsRow label="Local logs" description="View log files stored on disk.">
        <Button type="button" variant="outline" size="sm" className={settingsGhostButtonClassName}>
          <FolderOpen />
          Open folder
        </Button>
      </SettingsRow>

      <SettingsRow label="Clear all logs" description="Permanently delete all local log files.">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
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
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive">Clear logs</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SettingsRow>

      <SettingsRow label="Session" description="Reset in-memory timeline and execution log.">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
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
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive">Reset session</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SettingsRow>
    </SettingsSection>
  );
}
