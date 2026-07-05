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
import {
  settingsInputClassName,
  settingsInputGroupClassName,
  settingsInputGroupInputClassName,
  settingsSelectTriggerClassName,
} from "@/features/settings/settings-control-styles";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";

export function ModelProviderSettings(): ReactElement {
  return (
    <>
      <SettingsSection title="Model & provider">
        <SettingsRow
          label="Agent mode"
          description="Live uses cloud API and tools. Demo runs offline fixtures."
        >
          <Select defaultValue="live">
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
          <Input
            id="max-steps"
            type="number"
            min={1}
            defaultValue="50"
            className={settingsInputClassName}
          />
        </SettingsRow>

        <SettingsRow label="Max cost" description="Spending cap per run in USD.">
          <InputGroup className={`w-28 ${settingsInputGroupClassName}`}>
            <InputGroupAddon align="inline-start">
              <InputGroupText className="text-[#767676]">$</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="max-cost"
              type="number"
              min={0}
              step="0.01"
              defaultValue="5.00"
              className={`${settingsInputGroupInputClassName} text-right tabular-nums`}
            />
          </InputGroup>
        </SettingsRow>

        <SettingsRow label="Max wall-clock" description="15 minutes (900000 ms).">
          <Input
            id="max-wall-clock"
            type="number"
            min={0}
            defaultValue="900000"
            className={settingsInputClassName}
          />
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
