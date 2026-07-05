import type { ReactElement } from "react";

import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import {
  settingsInputGroupClassName,
  settingsInputGroupInputClassName,
} from "@/features/settings/settings-control-styles";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";

type ApiKeyRowProps = {
  label: string;
  description: string;
  placeholder: string;
  inputId: string;
};

function ApiKeyRow({ label, description, placeholder, inputId }: ApiKeyRowProps): ReactElement {
  return (
    <>
      <SettingsRow
        label={label}
        description={`${description} Not saved yet.`}
        className="max-md:flex-col max-md:w-full max-md:gap-3 max-md:items-start"
      >
        <InputGroup className={`w-52 max-md:w-full ${settingsInputGroupClassName}`}>
          <InputGroupInput
            id={inputId}
            type="password"
            placeholder={placeholder}
            autoComplete="off"
            className={settingsInputGroupInputClassName}
          />
        </InputGroup>
      </SettingsRow>
    </>
  );
}

export function ApiKeysSettings(): ReactElement {
  return (
    <SettingsSection title="API keys">
      <ApiKeyRow
        label="Anthropic API key"
        description="Required for Claude models in Live mode."
        placeholder="sk-ant-..."
        inputId="anthropic-api-key"
      />
      <ApiKeyRow
        label="OpenAI API key"
        description="Required for GPT models in Live mode."
        placeholder="sk-..."
        inputId="openai-api-key"
      />
    </SettingsSection>
  );
}
