import type { ChangeEvent, ReactElement } from "react";

import { PERMISSION_MODE_LABELS } from "@/agent/toolContract";
import { parsePermissionMode } from "@/agent/types";
import { BROWSER_SAMPLE_WORKSPACE_ROOT } from "@/agent/workspace/browserWorkspace";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ancillaryTextClass,
  settingBlockClass,
  settingDescriptionClass,
  settingHeadingClass,
  settingLeadClass,
  settingsFieldClassName,
  settingsSelectContentClassName,
  settingsSelectItemClassName,
} from "@/features/settings/settingsStyles";
import type { SettingsGeneralModel } from "@/features/settings/useSettingsPageModel";

export type SettingsGeneralSectionProps = {
  readonly general: SettingsGeneralModel;
};

export function SettingsGeneralSection(props: SettingsGeneralSectionProps): ReactElement {
  const { isDesktop, settings, permissionMode, updateSettings, setPermissionMode } = props.general;

  function handleWorkspaceChange(e: ChangeEvent<HTMLInputElement>): void {
    void updateSettings({
      workspaceRoot: e.currentTarget.value.trim() === "" ? null : e.currentTarget.value.trim(),
    });
  }

  function handleRetentionChange(e: ChangeEvent<HTMLInputElement>): void {
    void updateSettings({
      retentionDays: Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)),
    });
  }

  function handleUiAutomationChange(e: ChangeEvent<HTMLInputElement>): void {
    void updateSettings({ uiAutomationEnabled: e.currentTarget.checked });
  }

  return (
    <>
      <div className={settingBlockClass}>
        <div className={settingLeadClass}>
          <Label htmlFor="workspace-settings" className={settingHeadingClass}>
            Default workspace root
          </Label>
          <p className={settingDescriptionClass}>
            {isDesktop ? (
              <>
                Absolute folder for file tools and default shell cwd (example{" "}
                <code className="rounded bg-[#161616] px-1 py-0.5 font-mono text-[10px] text-[#9ca3af]">
                  D:\Projects\actuate
                </code>
                ).
              </>
            ) : (
              <>
                Web builds read from{" "}
                <code className="rounded bg-[#161616] px-1 py-0.5 font-mono text-[10px] text-[#9ca3af]">
                  /browser-samples
                </code>
                ; use{" "}
                <code className="rounded bg-[#161616] px-1 py-0.5 font-mono text-[10px] text-[#9ca3af]">
                  {BROWSER_SAMPLE_WORKSPACE_ROOT}
                </code>{" "}
                unless you override.
              </>
            )}
          </p>
        </div>
        <Input
          id="workspace-settings"
          value={settings.workspaceRoot ?? ""}
          onChange={handleWorkspaceChange}
          placeholder={isDesktop ? "Path to repository" : BROWSER_SAMPLE_WORKSPACE_ROOT}
          autoComplete="off"
          className={settingsFieldClassName}
        />
      </div>

      <div className={settingBlockClass}>
        <div className={settingLeadClass}>
          <Label htmlFor="retention" className={settingHeadingClass}>
            Log retention (days)
          </Label>
          <p className={settingDescriptionClass}>
            Drop session folders older than this many days; use 0 to keep everything.
          </p>
        </div>
        <Input
          id="retention"
          type="number"
          min={0}
          value={settings.retentionDays}
          onChange={handleRetentionChange}
          className={settingsFieldClassName}
        />
      </div>

      <div className={settingBlockClass}>
        <div className={settingLeadClass}>
          <Label htmlFor="permission-mode" className={settingHeadingClass}>
            Permission mode
          </Label>
          <p className={settingDescriptionClass}>
            How often Actuate asks before risky tools run or UI automation acts.
          </p>
        </div>
        <Select
          value={permissionMode}
          onValueChange={(value) => void setPermissionMode(parsePermissionMode(value))}
        >
          <SelectTrigger id="permission-mode" className={settingsFieldClassName}>
            <SelectValue placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent position="popper" className={settingsSelectContentClassName}>
            <SelectItem value="ask_risky" className={settingsSelectItemClassName}>
              {PERMISSION_MODE_LABELS.ask_risky}
            </SelectItem>
            <SelectItem value="ask_all" className={settingsSelectItemClassName}>
              {PERMISSION_MODE_LABELS.ask_all}
            </SelectItem>
            <SelectItem value="session_low_risk" className={settingsSelectItemClassName}>
              {PERMISSION_MODE_LABELS.session_low_risk}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className={settingBlockClass}>
        <div className={settingLeadClass}>
          <div id="ui-auto-heading" className={settingHeadingClass}>
            Pointer / UI automation
          </div>
          <p className={settingDescriptionClass}>
            Lets the agent drive clicks and typing on screen — only enable on trusted machines.
          </p>
        </div>
        <div className="flex items-start gap-2.5">
          <input
            id="ui-auto"
            type="checkbox"
            aria-labelledby="ui-auto-heading"
            className="mt-0.5 size-4 shrink-0 rounded border border-white/12 accent-[#3F3F3F]"
            checked={settings.uiAutomationEnabled}
            onChange={handleUiAutomationChange}
          />
          <Label htmlFor="ui-auto" className="text-xs font-normal leading-snug text-[#cdcdcd]">
            Allow pointer, click, and type tools for visible UI.
          </Label>
        </div>
        <p className={ancillaryTextClass}>
          Requires Live mode and careful supervision — misuse can affect other apps.
        </p>
      </div>
    </>
  );
}
