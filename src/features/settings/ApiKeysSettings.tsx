import { useCallback, useState, type ReactElement } from "react";

import { useSettingsActions, useSettingsState } from "@/app/providers/SettingsProvider";
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
  saved: boolean;
  onSave: (value: string) => Promise<void>;
};

function ApiKeyRow({
  label,
  description,
  placeholder,
  inputId,
  saved,
  onSave,
}: ApiKeyRowProps): ReactElement {
  const [draft, setDraft] = useState("");

  return (
    <SettingsRow
      label={label}
      description={saved ? `${description} Saved on this device.` : `${description} Not saved yet.`}
      className="max-md:flex-col max-md:w-full max-md:gap-3 max-md:items-start"
    >
      <InputGroup className={`w-52 max-md:w-full ${settingsInputGroupClassName}`}>
        <InputGroupInput
          id={inputId}
          type="password"
          placeholder={saved ? "Enter new key to replace" : placeholder}
          autoComplete="off"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft.trim().length > 0) {
              void onSave(draft.trim()).then(() => setDraft(""));
            }
          }}
          className={settingsInputGroupInputClassName}
        />
      </InputGroup>
    </SettingsRow>
  );
}

export function ApiKeysSettings(): ReactElement {
  const { settings } = useSettingsState();
  const { updateSecret } = useSettingsActions();

  const saveAnthropicKey = useCallback(
    (value: string) => updateSecret("anthropicApiKey", value),
    [updateSecret],
  );

  const saveOpenAiKey = useCallback(
    (value: string) => updateSecret("openaiApiKey", value),
    [updateSecret],
  );

  return (
    <SettingsSection title="API keys">
      <ApiKeyRow
        label="Anthropic API key"
        description="Required for Claude models in Live mode."
        placeholder="sk-ant-..."
        inputId="anthropic-api-key"
        saved={settings.secrets.anthropicApiKey.length > 0}
        onSave={saveAnthropicKey}
      />
      <ApiKeyRow
        label="OpenAI API key"
        description="Required for GPT models in Live mode."
        placeholder="sk-..."
        inputId="openai-api-key"
        saved={settings.secrets.openaiApiKey.length > 0}
        onSave={saveOpenAiKey}
      />
    </SettingsSection>
  );
}
