import { useState, type ReactElement } from "react";
import { toast } from "sonner";

import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import {
  settingsInputGroupClassName,
  settingsInputGroupInputClassName,
} from "@/features/settings/styles";
import { sanitizeApiKey, validateApiKeyFormat } from "@/lib/settings/api-key";
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

  async function persistKey(raw: string): Promise<void> {
    const validated = validateApiKeyFormat(secretKey, raw);
    if (!validated.ok) {
      if (sanitizeApiKey(raw).length > 0) {
        toast.error(validated.message);
      }
      return;
    }

    try {
      await updateSecret.mutateAsync({ key: secretKey, value: validated.value });
      setDraft("");
      const tail = validated.value.slice(-4);
      toast.success(`Saved key ending in …${tail}`);
    } catch {
      // Error toast is handled by the mutation onError callback.
    }
  }

  return (
    <SettingsRow label={label} description={description}>
      <InputGroup className={`w-36 ${settingsInputGroupClassName}`}>
        <InputGroupInput
          id={inputId}
          type="password"
          placeholder={saved ? "Enter new key to replace" : placeholder}
          autoComplete="off"
          spellCheck={false}
          value={draft}
          disabled={updateSecret.isPending}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text/plain");
            if (text.length === 0) {
              return;
            }
            event.preventDefault();
            const next = sanitizeApiKey(text);
            setDraft(next);
            void persistKey(next);
          }}
          onBlur={() => {
            void persistKey(draft);
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
