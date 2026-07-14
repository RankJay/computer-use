import { FolderOpen } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { ContentSkeleton } from "@/components/ui/content-skeleton";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import {
  settingsGhostButtonClassName,
  settingsInputClassName,
  settingsInputGroupClassName,
  settingsInputGroupInputClassName,
  settingsSelectTriggerClassName,
} from "@/features/settings/styles";
import { isMacOsClient } from "@/lib/platform";

function SkeletonSelect({
  className,
  label = "Ask before tools",
}: {
  className?: string;
  label?: string;
}): ReactElement {
  return (
    <Select disabled items={[{ label, value: "loading" }]} value="loading">
      <SelectTrigger className={className ?? settingsSelectTriggerClassName}>
        <SelectValue />
      </SelectTrigger>
    </Select>
  );
}

export function SettingsPageSkeleton(): ReactElement {
  return (
    <ContentSkeleton loading className="flex flex-col gap-8">
      <SettingsSection title="General">
        <SettingsRow
          label="Default workspace root"
          description="Starting directory for agent file operations."
        >
          <InputGroup className={`w-40 ${settingsInputGroupClassName}`}>
            <InputGroupInput
              disabled
              readOnly
              value="/Users/.../Projects"
              className={`text-sm ${settingsInputGroupInputClassName}`}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton aria-label="Browse" size="icon-xs" disabled>
                <FolderOpen className="text-[#767676]" />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </SettingsRow>
        <SettingsRow label="Log retention" description="Days to keep local log files.">
          <Input
            disabled
            readOnly
            value="30"
            className={`${settingsInputClassName} text-right text-sm tabular-nums`}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Permissions">
        <SettingsRow
          label="Permission mode"
          description="How the agent requests approval before tool use."
        >
          <SkeletonSelect className={`w-30 ${settingsSelectTriggerClassName}`} />
        </SettingsRow>
        <SettingsRow
          label="Pointer / UI automation"
          description="Allow pointer, click, and type tools."
        >
          <Switch disabled checked={false} data-skeleton="" />
        </SettingsRow>
      </SettingsSection>

      {isMacOsClient() ? (
        <SettingsSection title="macOS permissions">
          <SettingsRow
            label="Accessibility"
            description="Required for pointer and UI automation tools."
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              className={settingsGhostButtonClassName}
            >
              Grant
            </Button>
          </SettingsRow>
        </SettingsSection>
      ) : null}

      <SettingsSection title="API keys">
        <SettingsRow label="Anthropic API key" description="Required for Claude models.">
          <InputGroup className={`w-56 ${settingsInputGroupClassName}`}>
            <InputGroupInput
              disabled
              readOnly
              type="password"
              value="sk-ant-skeleton"
              className={`text-sm ${settingsInputGroupInputClassName}`}
            />
          </InputGroup>
        </SettingsRow>
        <SettingsRow label="OpenAI API key" description="Required for GPT models.">
          <InputGroup className={`w-56 ${settingsInputGroupClassName}`}>
            <InputGroupInput
              disabled
              readOnly
              type="password"
              value="sk-skeleton"
              className={`text-sm ${settingsInputGroupInputClassName}`}
            />
          </InputGroup>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Guardrails">
        <SettingsRow
          label="Agent mode"
          description="Live uses cloud API and tools. Demo runs offline fixtures."
        >
          <SkeletonSelect label="Live" />
        </SettingsRow>
        <SettingsRow label="Max steps" description="Maximum agent steps per run.">
          <Input disabled readOnly value="50" className={`${settingsInputClassName} text-sm`} />
        </SettingsRow>
        <SettingsRow
          label="Max cost"
          description="Spending cap per run in USD. Set 0 for no limit."
        >
          <InputGroup className={`w-28 ${settingsInputGroupClassName}`}>
            <InputGroupAddon align="inline-start">
              <InputGroupText className="text-[#767676]">$</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              disabled
              readOnly
              value="0"
              className={`${settingsInputGroupInputClassName} text-right tabular-nums`}
            />
          </InputGroup>
        </SettingsRow>
        <SettingsRow
          label="Max wall-clock"
          description="Run time limit in minutes. Set 0 for no limit."
        >
          <Input disabled readOnly value="0" className={`${settingsInputClassName} text-sm`} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Maintenance">
        <SettingsRow
          label="Persistent approvals"
          description="Revoke saved tool approvals stored on this device."
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            className={settingsGhostButtonClassName}
          >
            Revoke
          </Button>
        </SettingsRow>
        <SettingsRow label="Local logs" description="View log files stored on disk.">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            className={settingsGhostButtonClassName}
          >
            Open folder
          </Button>
        </SettingsRow>
        <SettingsRow label="Clear all logs" description="Permanently delete all local log files.">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            className={settingsGhostButtonClassName}
          >
            Clear
          </Button>
        </SettingsRow>
        <SettingsRow label="Session" description="Reset in-memory timeline and execution log.">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            className={settingsGhostButtonClassName}
          >
            Reset
          </Button>
        </SettingsRow>
      </SettingsSection>
    </ContentSkeleton>
  );
}
