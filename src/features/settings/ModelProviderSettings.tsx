import type { ReactElement } from "react";

import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import {
  settingsInputClassName,
  settingsInputGroupClassName,
  settingsInputGroupInputClassName,
  settingsSelectTriggerClassName,
} from "@/features/settings/styles";
import {
  AGENT_MODE_OPTIONS,
  parseAgentMode,
  wallClockMinutesFromMs,
  wallClockMsFromMinutes,
} from "@/lib/settings/options";
import { useSettingsSelector, useUpdateSettings } from "@/lib/settings/queries";
import {
  selectAgentMode,
  selectMaxCostUsd,
  selectMaxSteps,
  selectMaxWallClockMs,
} from "@/lib/settings/selectors";

function AgentModeRow(): ReactElement {
  const agentMode = useSettingsSelector(selectAgentMode);
  const { mutate } = useUpdateSettings();

  return (
    <SettingsRow
      label="Agent mode"
      description="Live uses cloud API and tools. Demo runs offline fixtures."
    >
      <Select
        items={AGENT_MODE_OPTIONS}
        value={agentMode}
        onValueChange={(value) => {
          if (value !== null) {
            mutate({ agentMode: parseAgentMode(value) });
          }
        }}
      >
        <SelectTrigger className={settingsSelectTriggerClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="end" className="p-0.5">
          {AGENT_MODE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}

function MaxStepsRow(): ReactElement {
  const maxSteps = useSettingsSelector(selectMaxSteps);
  const { mutate } = useUpdateSettings();

  return (
    <SettingsRow label="Max steps" description="Maximum agent steps per run.">
      <Input
        id="max-steps"
        type="number"
        min={1}
        key={maxSteps}
        defaultValue={String(maxSteps)}
        onBlur={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          if (!Number.isNaN(next) && next !== maxSteps) {
            mutate({ maxSteps: next });
          }
        }}
        className={`${settingsInputClassName} text-sm`}
      />
    </SettingsRow>
  );
}

function MaxCostRow(): ReactElement {
  const maxCostUsd = useSettingsSelector(selectMaxCostUsd);
  const { mutate } = useUpdateSettings();

  return (
    <SettingsRow label="Max cost" description="Spending cap per run in USD. Set 0 for no limit.">
      <InputGroup className={`w-28 ${settingsInputGroupClassName}`}>
        <InputGroupAddon align="inline-start">
          <InputGroupText className="text-[#767676]">$</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          id="max-cost"
          type="number"
          min={0}
          step="0.01"
          key={maxCostUsd}
          defaultValue={String(maxCostUsd)}
          onBlur={(event) => {
            const next = Number.parseFloat(event.target.value);
            if (!Number.isNaN(next) && next !== maxCostUsd) {
              mutate({ maxCostUsd: next });
            }
          }}
          className={`${settingsInputGroupInputClassName} text-right tabular-nums`}
        />
      </InputGroup>
    </SettingsRow>
  );
}

function MaxWallClockRow(): ReactElement {
  const maxWallClockMs = useSettingsSelector(selectMaxWallClockMs);
  const { mutate } = useUpdateSettings();
  const wallClockMinutes = wallClockMinutesFromMs(maxWallClockMs);

  return (
    <SettingsRow
      label="Max wall-clock"
      description="Run time limit in minutes. Set 0 for no limit."
    >
      <Input
        id="max-wall-clock"
        type="number"
        min={0}
        key={wallClockMinutes}
        defaultValue={wallClockMinutes}
        onBlur={(event) => {
          const minutes = Number.parseInt(event.target.value, 10);
          if (Number.isNaN(minutes)) {
            return;
          }
          const nextMs = wallClockMsFromMinutes(minutes);
          if (nextMs !== maxWallClockMs) {
            mutate({ maxWallClockMs: nextMs });
          }
        }}
        className={`${settingsInputClassName} text-sm`}
      />
    </SettingsRow>
  );
}

export function ModelProviderSettings(): ReactElement {
  return (
    <SettingsSection title="Guardrails">
      <AgentModeRow />
      <MaxStepsRow />
      <MaxCostRow />
      <MaxWallClockRow />
    </SettingsSection>
  );
}
