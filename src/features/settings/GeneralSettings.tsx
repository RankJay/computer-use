import { FolderOpen } from "lucide-react";
import type { ReactElement } from "react";

import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import {
  settingsInputClassName,
  settingsInputGroupClassName,
  settingsInputGroupInputClassName,
  settingsSelectTriggerClassName,
} from "@/features/settings/styles";
import { useSettingsSelector, useUpdateSettings } from "@/lib/settings/queries";
import { selectGeneralSettings } from "@/lib/settings/selectors";
import { parsePermissionMode, PERMISSION_MODE_OPTIONS } from "@/lib/settings/utils";

export function GeneralSettings(): ReactElement {
  const settings = useSettingsSelector(selectGeneralSettings);
  const updateSettings = useUpdateSettings();

  return (
    <>
      <SettingsSection title="General">
        <SettingsRow
          label="Default workspace root"
          description="Starting directory for agent file operations."
        >
          <InputGroup className={`w-40 ${settingsInputGroupClassName}`}>
            <InputGroupInput
              id="workspace-root"
              type="text"
              placeholder="C:\Users\...\Projects"
              key={settings.workspaceRoot}
              defaultValue={settings.workspaceRoot}
              onBlur={(event) => {
                const next = event.target.value.trim();
                if (next !== settings.workspaceRoot) {
                  updateSettings.mutate({ workspaceRoot: next });
                }
              }}
              className={`text-sm ${settingsInputGroupInputClassName}`}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton aria-label="Browse for workspace folder" size="icon-xs">
                <FolderOpen className="text-[#767676]" />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </SettingsRow>

        <SettingsRow label="Log retention" description="Days to keep local log files.">
          <Input
            id="log-retention"
            type="number"
            min={1}
            key={settings.logRetentionDays}
            defaultValue={String(settings.logRetentionDays)}
            onBlur={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              if (!Number.isNaN(next) && next !== settings.logRetentionDays) {
                updateSettings.mutate({ logRetentionDays: next });
              }
            }}
            className={`${settingsInputClassName} text-right text-sm tabular-nums`}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Permissions">
        <SettingsRow
          label="Permission mode"
          description="How the agent requests approval before tool use."
        >
          <Select
            items={PERMISSION_MODE_OPTIONS}
            value={settings.permissionMode}
            onValueChange={(value) => {
              if (value !== null) {
                updateSettings.mutate({ permissionMode: parsePermissionMode(value) });
              }
            }}
          >
            <SelectTrigger className={`w-30 ${settingsSelectTriggerClassName}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="end" className="p-0.5">
              {PERMISSION_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          label="Pointer / UI automation"
          description="Allow pointer, click, and type tools."
        >
          <Switch
            id="ui-automation"
            checked={settings.uiAutomation}
            onCheckedChange={(checked) => {
              updateSettings.mutate({ uiAutomation: checked });
            }}
          />
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
