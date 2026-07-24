import { FolderOpen } from "lucide-react";
import type { ReactElement } from "react";
import { toast } from "sonner";

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
import { hostSupportsUiAutomation } from "@/lib/agent/capabilities/shared/ui-automation";
import {
  getMacOsPermissionStatus,
  openMacOsPrivacySettings,
  requestMacOsPermission,
} from "@/lib/macos-permissions/commands";
import { isTauriRuntime } from "@/lib/runtime/is-tauri-runtime";
import { isMacOsClient } from "@/lib/runtime/platform";
import { parsePermissionMode, PERMISSION_MODE_OPTIONS } from "@/lib/settings/options";
import { useSettingsSelector, useUpdateSettings } from "@/lib/settings/queries";
import { SETTINGS_SECTION_IDS } from "@/lib/settings/section-ids";
import {
  selectInstallUpdateOnClose,
  selectLogRetentionDays,
  selectPermissionMode,
  selectUiAutomation,
  selectWorkspaceRoot,
} from "@/lib/settings/selectors";
import { pickWorkspaceFolder } from "@/lib/settings/workspace-picker";

const isMac = isMacOsClient();
const uiAutomationSupported = hostSupportsUiAutomation();

const UI_AUTOMATION_DESCRIPTION = !uiAutomationSupported
  ? "UI automation is not available on this OS."
  : isMac
    ? "Allow pointer, click, and type tools. Grant macOS Accessibility below when prompted."
    : "Allow pointer, click, and type tools.";

async function ensureMacOsAccessibilityOnEnable(): Promise<void> {
  if (!isMac || !isTauriRuntime()) {
    return;
  }

  try {
    const status = await getMacOsPermissionStatus();
    if (status.accessibility) {
      return;
    }
    toast.message("Grant Accessibility for Actuate in System Settings → Privacy & Security.");
    await openMacOsPrivacySettings("accessibility");
    await requestMacOsPermission("accessibility");
  } catch {
    toast.error("Could not open macOS Accessibility settings.");
  }
}

function WorkspaceRootRow(): ReactElement {
  const workspaceRoot = useSettingsSelector(selectWorkspaceRoot);
  const { mutate, isPending } = useUpdateSettings();

  async function handleBrowseWorkspace(): Promise<void> {
    try {
      const path = await pickWorkspaceFolder();
      if (path !== null && path !== workspaceRoot) {
        mutate({ workspaceRoot: path });
      }
    } catch {
      toast.error("Could not open folder picker. Try again.");
    }
  }

  return (
    <SettingsRow
      id={SETTINGS_SECTION_IDS.workspace}
      label="Default workspace root"
      description="Starting directory for agent file operations."
    >
      <InputGroup className={`w-40 ${settingsInputGroupClassName}`}>
        <InputGroupInput
          id="workspace-root"
          type="text"
          placeholder={isMac ? "/Users/.../Projects" : "C:\\Users\\...\\Projects"}
          key={workspaceRoot}
          defaultValue={workspaceRoot}
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (next !== workspaceRoot) {
              mutate({ workspaceRoot: next });
            }
          }}
          className={`text-sm ${settingsInputGroupInputClassName}`}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label="Browse for workspace folder"
            size="icon-xs"
            disabled={isPending}
            onClick={() => {
              void handleBrowseWorkspace();
            }}
          >
            <FolderOpen className="text-[#767676]" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </SettingsRow>
  );
}

function LogRetentionRow(): ReactElement {
  const logRetentionDays = useSettingsSelector(selectLogRetentionDays);
  const { mutate } = useUpdateSettings();

  return (
    <SettingsRow label="Log retention" description="Days to keep local log files.">
      <Input
        id="log-retention"
        type="number"
        min={1}
        key={logRetentionDays}
        defaultValue={String(logRetentionDays)}
        onBlur={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          if (!Number.isNaN(next) && next !== logRetentionDays) {
            mutate({ logRetentionDays: next });
          }
        }}
        className={`${settingsInputClassName} text-right text-sm tabular-nums`}
      />
    </SettingsRow>
  );
}

function PermissionModeRow(): ReactElement {
  const permissionMode = useSettingsSelector(selectPermissionMode);
  const { mutate } = useUpdateSettings();

  return (
    <SettingsRow
      label="Permission mode"
      description="How the agent requests approval before tool use."
    >
      <Select
        items={PERMISSION_MODE_OPTIONS}
        value={permissionMode}
        onValueChange={(value) => {
          if (value !== null) {
            mutate({ permissionMode: parsePermissionMode(value) });
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
  );
}

function UiAutomationRow(): ReactElement {
  const uiAutomation = useSettingsSelector(selectUiAutomation);
  const { mutate } = useUpdateSettings();

  return (
    <SettingsRow label="Pointer / UI automation" description={UI_AUTOMATION_DESCRIPTION}>
      <Switch
        id="ui-automation"
        checked={uiAutomation}
        disabled={!uiAutomationSupported}
        onCheckedChange={(checked) => {
          mutate({ uiAutomation: checked });
          if (checked) {
            void ensureMacOsAccessibilityOnEnable();
          }
        }}
      />
    </SettingsRow>
  );
}

function InstallUpdateOnCloseRow(): ReactElement {
  const installUpdateOnClose = useSettingsSelector(selectInstallUpdateOnClose);
  const { mutate } = useUpdateSettings();

  return (
    <SettingsRow
      label="Install updates on close"
      description="Skip the update dialog and apply verified updates when you quit."
    >
      <Switch
        id="install-update-on-close"
        checked={installUpdateOnClose}
        onCheckedChange={(checked) => {
          mutate({ installUpdateOnClose: checked });
        }}
      />
    </SettingsRow>
  );
}

export function GeneralSettings(): ReactElement {
  return (
    <>
      <SettingsSection title="General">
        <WorkspaceRootRow />
        <LogRetentionRow />
        <InstallUpdateOnCloseRow />
      </SettingsSection>

      <SettingsSection title="Permissions">
        <PermissionModeRow />
        <UiAutomationRow />
      </SettingsSection>
    </>
  );
}
