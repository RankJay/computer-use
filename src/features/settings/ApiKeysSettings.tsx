import { useState, type ReactElement } from "react";

import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import {
  settingsInputGroupClassName,
  settingsInputGroupInputClassName,
} from "@/features/settings/styles";
import { useSettingsSelector, useUpdateSecret } from "@/lib/settings/queries";
import { selectSecretIsSaved } from "@/lib/settings/selectors";
import type { AppSecrets } from "@/lib/settings/types";

type ApiKeyRowProps = {
  label: string;
  description: string;
  placeholder: string;
  inputId: string;
  secretKey: keyof AppSecrets;
};

function ApiKeyRow({
  label,
  description,
  placeholder,
  inputId,
  secretKey,
}: ApiKeyRowProps): ReactElement {
  const saved = useSettingsSelector(selectSecretIsSaved[secretKey]);
  const updateSecret = useUpdateSecret();
  const [draft, setDraft] = useState("");

  return (
    <SettingsRow label={label} description={description}>
      <InputGroup className={`w-36 ${settingsInputGroupClassName}`}>
        <InputGroupInput
          id={inputId}
          type="password"
          placeholder={saved ? "Enter new key to replace" : placeholder}
          autoComplete="off"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft.trim().length > 0) {
              void updateSecret.mutateAsync({ key: secretKey, value: draft.trim() }).then(() => {
                setDraft("");
              });
            }
          }}
          className={`text-sm ${settingsInputGroupInputClassName}`}
        />
      </InputGroup>
    </SettingsRow>
  );
}

export function ApiKeysSettings(): ReactElement {
  return (
    <SettingsSection title="API keys">
      <ApiKeyRow
        label="Anthropic API key"
        description="Required for Claude models."
        placeholder="sk-ant-..."
        inputId="anthropic-api-key"
        secretKey="anthropicApiKey"
      />
      <ApiKeyRow
        label="OpenAI API key"
        description="Required for GPT models."
        placeholder="sk-..."
        inputId="openai-api-key"
        secretKey="openaiApiKey"
      />
    </SettingsSection>
  );
}
