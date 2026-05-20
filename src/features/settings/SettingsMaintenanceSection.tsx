import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  destructiveButtonClassName,
  outlineButtonClassName,
  settingBlockClass,
  settingDescriptionClass,
  settingHeadingClass,
  settingLeadClass,
  settingsSeparatorClassName,
} from "@/features/settings/settingsStyles";
import type { SettingsMaintenanceCommands } from "@/features/settings/useSettingsPageModel";

export type SettingsMaintenanceSectionProps = {
  readonly commands: SettingsMaintenanceCommands;
};

export function SettingsMaintenanceSection(props: SettingsMaintenanceSectionProps): ReactElement {
  const { onRevokePersistedApprovals, onResetSession, logs } = props.commands;

  return (
    <>
      <Separator className={settingsSeparatorClassName} />

      <div className={settingBlockClass}>
        <div className={settingLeadClass}>
          <div className={settingHeadingClass}>Persistent approvals</div>
          <p className={settingDescriptionClass}>
            Clear &quot;always allow&quot; tool choices saved with settings.
          </p>
        </div>
        <Button
          variant="outline"
          className={outlineButtonClassName}
          onClick={() => void onRevokePersistedApprovals()}
        >
          Revoke saved tool approvals
        </Button>
      </div>

      <Separator className={settingsSeparatorClassName} />

      <div className={settingBlockClass}>
        <div className={settingLeadClass}>
          <div className={settingHeadingClass}>Local logs</div>
          <p className={settingDescriptionClass}>
            Session transcripts and keyframes on disk; clearing cannot be undone.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className={outlineButtonClassName}
            onClick={() => void logs.openLogsFolder()}
          >
            Open logs folder
          </Button>
          <Button
            variant="destructive"
            className={destructiveButtonClassName}
            onClick={() => logs.setConfirmClearLogsOpen(true)}
          >
            Clear all logs
          </Button>
        </div>
        <Dialog open={logs.confirmClearLogsOpen} onOpenChange={logs.setConfirmClearLogsOpen}>
          <DialogContent className="border border-white/6 bg-[#0E0E0E] text-[#cdcdcd] shadow-layered ring-0">
            <DialogHeader>
              <DialogTitle className="text-[#eaeaea]">Clear all local logs?</DialogTitle>
              <DialogDescription className="text-neutral-500">
                This deletes local session logs and keyframes from this device.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="border-t border-white/6 bg-[#121212]">
              <DialogClose asChild>
                <Button variant="outline" className={outlineButtonClassName}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant="destructive"
                className={destructiveButtonClassName}
                onClick={logs.clearLogs}
              >
                Clear logs
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Separator className={settingsSeparatorClassName} />

      <div className={settingBlockClass}>
        <div className={settingLeadClass}>
          <div className={settingHeadingClass}>Session</div>
          <p className={settingDescriptionClass}>
            Reset only the in-memory timeline and execution log for this window.
          </p>
        </div>
        <Button variant="outline" className={outlineButtonClassName} onClick={onResetSession}>
          Reset session
        </Button>
      </div>
    </>
  );
}
