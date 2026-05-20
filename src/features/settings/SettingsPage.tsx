import type { ReactElement } from "react";

import { hostRuntime } from "@/agent/host/hostRuntime";
import { SECRET_ANTHROPIC_API_KEY, SECRET_OPENAI_API_KEY } from "@/agent/secrets";
import { useSettings } from "@/app/providers/SettingsProvider";
import { Separator } from "@/components/ui/separator";
import { useAgentSessionContext } from "@/features/control-center/AgentSessionProvider";
import { SettingsGeneralSection } from "@/features/settings/SettingsGeneralSection";
import { SettingsMaintenanceSection } from "@/features/settings/SettingsMaintenanceSection";
import { SettingsModelSection } from "@/features/settings/SettingsModelSection";
import { SettingsPageHeader } from "@/features/settings/SettingsPageHeader";
import { SettingsSecretKeyField } from "@/features/settings/SettingsSecretKeyField";
import { settingsSeparatorClassName } from "@/features/settings/settingsStyles";
import {
  useLogSettingsCommands,
  useSecretKeySettings,
} from "@/features/settings/useSettingsCommands";
import { useUnifiedModelSelection } from "@/features/settings/useUnifiedModelSelection";

export function SettingsPage(): ReactElement {
  const { resetSession } = useAgentSessionContext();
  const { settings, setPermissionMode, permissionMode, updateSettings, revokePersistedApprovals } =
    useSettings();
  const anthropicKey = useSecretKeySettings(SECRET_ANTHROPIC_API_KEY);
  const openaiKey = useSecretKeySettings(SECRET_OPENAI_API_KEY);
  const logs = useLogSettingsCommands();
  const isDesktop = hostRuntime.isDesktop;
  const storageHint = isDesktop ? "OS keychain" : "browser localStorage";

  const modelSelection = useUnifiedModelSelection(
    settings,
    updateSettings,
    anthropicKey.hasStoredKey,
    openaiKey.hasStoredKey,
  );

  return (
    <div className="box-border flex h-full min-h-dvh w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#0E0E0E] p-2 text-[#cdcdcd] shadow-none ring-0">
      <SettingsPageHeader />

      <div className="min-h-0 flex-1 overflow-y-auto pb-8 pt-6 scrollbar-none">
        <div className="mx-auto max-w-2xl space-y-8 px-2 sm:px-4">
          <p className="text-sm text-neutral-500">
            BYOK, workspace, logs, and supervision.{" "}
            {isDesktop
              ? "Desktop: secrets use the OS credential store."
              : "Web: settings and keys stay in this browser only (localStorage), not on a server."}
          </p>

          <SettingsModelSection
            settings={settings}
            updateSettings={updateSettings}
            anthropicKeyStored={anthropicKey.hasStoredKey}
            openaiKeyStored={openaiKey.hasStoredKey}
            modelSelection={modelSelection}
          />

          <SettingsSecretKeyField
            id="anthropic-api-key"
            label="Anthropic API key"
            storageHint={storageHint}
            emptyPlaceholder="sk-ant-api03-…"
            apiKeyDraft={anthropicKey.apiKeyDraft}
            hasStoredKey={anthropicKey.hasStoredKey}
            apiKeyError={anthropicKey.apiKeyError}
            onDraftChange={anthropicKey.setApiKeyDraft}
            onSave={anthropicKey.saveSecret}
            onRemove={anthropicKey.removeSecret}
            saveLabel="Save Anthropic key"
            removeLabel="Remove Anthropic key"
          />

          <SettingsSecretKeyField
            id="openai-api-key"
            label="OpenAI API key"
            storageHint={storageHint}
            emptyPlaceholder="sk-…"
            apiKeyDraft={openaiKey.apiKeyDraft}
            hasStoredKey={openaiKey.hasStoredKey}
            apiKeyError={openaiKey.apiKeyError}
            onDraftChange={openaiKey.setApiKeyDraft}
            onSave={openaiKey.saveSecret}
            onRemove={openaiKey.removeSecret}
            saveLabel="Save OpenAI key"
            removeLabel="Remove OpenAI key"
          />

          <Separator className={settingsSeparatorClassName} />

          <SettingsGeneralSection
            isDesktop={isDesktop}
            settings={settings}
            permissionMode={permissionMode}
            updateSettings={updateSettings}
            setPermissionMode={setPermissionMode}
          />

          <SettingsMaintenanceSection
            onRevokePersistedApprovals={revokePersistedApprovals}
            onResetSession={resetSession}
            logs={logs}
          />
        </div>
      </div>
    </div>
  );
}
