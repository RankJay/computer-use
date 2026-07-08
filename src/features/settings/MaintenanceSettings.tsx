import { FolderOpen } from "lucide-react";
import type { ReactElement } from "react";

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
import { useSettingsSelector, useUpdateSettings } from "@/lib/settings/queries";
import { selectHasPersistedApprovals } from "@/lib/settings/selectors";

export function MaintenanceSettings(): ReactElement {
  const hasPersistedApprovals = useSettingsSelector(selectHasPersistedApprovals);
  const updateSettings = useUpdateSettings();

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
