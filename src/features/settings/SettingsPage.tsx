import type { ReactElement } from "react";

import { Separator } from "@/components/ui/separator";
import { SettingsGeneralSection } from "@/features/settings/SettingsGeneralSection";
import { SettingsMaintenanceSection } from "@/features/settings/SettingsMaintenanceSection";
import { SettingsModelSection } from "@/features/settings/SettingsModelSection";
import { SettingsPageHeader } from "@/features/settings/SettingsPageHeader";
import { SettingsSecretKeyField } from "@/features/settings/SettingsSecretKeyField";
import { settingsSeparatorClassName } from "@/features/settings/settingsStyles";
import { useSettingsPageModel } from "@/features/settings/useSettingsPageModel";

export function SettingsPage(): ReactElement {
  const model = useSettingsPageModel();

  return (
    <div className="box-border flex h-full min-h-dvh w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#0E0E0E] p-2 text-[#cdcdcd] shadow-none ring-0">
      <SettingsPageHeader />

      <div className="min-h-0 flex-1 overflow-y-auto pb-8 pt-6 scrollbar-none">
        <div className="mx-auto max-w-2xl space-y-8 px-2 sm:px-4">
          <p className="text-sm text-neutral-500">
            BYOK, workspace, logs, and supervision. {model.runtime.overviewCopy}
          </p>

          <SettingsModelSection modelProvider={model.modelProvider} />

          {model.secretKeys.map((key) => (
            <SettingsSecretKeyField
              key={key.id}
              id={key.id}
              label={key.label}
              storageHint={model.runtime.storageHint}
              emptyPlaceholder={key.emptyPlaceholder}
              apiKeyDraft={key.apiKeyDraft}
              hasStoredKey={key.hasStoredKey}
              apiKeyError={key.apiKeyError}
              onDraftChange={key.setApiKeyDraft}
              onSave={key.saveSecret}
              onRemove={key.removeSecret}
              saveLabel={key.saveLabel}
              removeLabel={key.removeLabel}
            />
          ))}

          <Separator className={settingsSeparatorClassName} />

          <SettingsGeneralSection general={model.general} />

          <SettingsMaintenanceSection commands={model.maintenance} />
        </div>
      </div>
    </div>
  );
}
