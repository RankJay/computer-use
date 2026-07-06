import type { ReactElement } from "react";

import { useSettingsActions, useSettingsState } from "@/app/providers/SettingsProvider";
import { InputGroup, InputGroupAddon, InputGroupText } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  settingsInputClassName,
  settingsInputGroupClassName,
  settingsInputGroupInputClassName,
  settingsSelectTriggerClassName,
} from "@/features/settings/settings-control-styles";
import { SettingsDraftNumberInput } from "@/features/settings/SettingsDraftInput";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import { parseAgentMode } from "@/lib/settings/parse-agent-mode";

export function ModelProviderSettings(): ReactElement {
  const { settings } = useSettingsState();
  const { updateSettings } = useSettingsActions();

  return (
    <>
      <SettingsSection title="Model & provider">
        <SettingsRow
          label="Agent mode"
          description="Live uses cloud API and tools. Demo runs offline fixtures."
        >
          <Select
            value={settings.agentMode}
            onValueChange={(value) => {
              if (value !== null) {
                void updateSettings({ agentMode: parseAgentMode(value) });
              }
            }}
          >
            <SelectTrigger className={settingsSelectTriggerClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="end" className="p-0.5">
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="demo">Demo</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Max steps" description="Maximum agent steps per run.">
          <SettingsDraftNumberInput
            id="max-steps"
            min={1}
            committedValue={settings.maxSteps}
            onCommit={(value) => {
              void updateSettings({ maxSteps: value });
            }}
            className={settingsInputClassName}
          />
        </SettingsRow>

        <SettingsRow
          label="Max cost"
          description="Spending cap per run in USD. Set 0 for no limit."
        >
          <InputGroup className={`w-28 ${settingsInputGroupClassName}`}>
            <InputGroupAddon align="inline-start">
              <InputGroupText className="text-[#767676]">$</InputGroupText>
            </InputGroupAddon>
            <SettingsDraftNumberInput
              id="max-cost"
              variant="input-group"
              format="float"
              min={0}
              step="0.01"
              committedValue={settings.maxCostUsd}
              onCommit={(value) => {
                void updateSettings({ maxCostUsd: value });
              }}
              className={`${settingsInputGroupInputClassName} text-right tabular-nums`}
            />
          </InputGroup>
        </SettingsRow>

        <SettingsRow
          label="Max wall-clock"
          description="Run time limit in minutes. Set 0 for no limit."
        >
          <SettingsDraftNumberInput
            id="max-wall-clock"
            min={0}
            committedValue={Math.round(settings.maxWallClockMs / 60_000)}
            onCommit={(minutes) => {
              void updateSettings({ maxWallClockMs: minutes * 60_000 });
            }}
            className={settingsInputClassName}
          />
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
