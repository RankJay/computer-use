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
import {
  settingsInputClassName,
  settingsInputGroupClassName,
  settingsInputGroupInputClassName,
  settingsSelectTriggerClassName,
} from "@/features/settings/settings-control-styles";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";

export function GeneralSettings(): ReactElement {
  return (
    <>
      <SettingsSection title="General">
        <SettingsRow
          label="Default workspace root"
          description="Starting directory for agent file operations."
          className="max-md:flex-col max-md:w-full max-md:gap-3 max-md:items-start"
        >
          <InputGroup className={`w-52 max-md:w-full ${settingsInputGroupClassName}`}>
            <InputGroupInput
              id="workspace-root"
              placeholder="C:\Users\...\Projects"
              defaultValue=""
              className={settingsInputGroupInputClassName}
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
            defaultValue="30"
            className={settingsInputClassName}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Permissions">
        <SettingsRow
          label="Permission mode"
          description="How the agent requests approval before tool use."
        >
          <Select defaultValue="risky">
            <SelectTrigger className={settingsSelectTriggerClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="end" className="p-0.5">
              <SelectItem value="risky">Ask before risky actions</SelectItem>
              <SelectItem value="every-meaningful">Ask before every action</SelectItem>
              <SelectItem value="once-per-class">Ask once per class</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          label="Pointer / UI automation"
          description="Allow pointer, click, and type tools."
        >
          <Switch id="ui-automation" defaultChecked={false} />
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
