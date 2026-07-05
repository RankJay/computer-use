import type { ReactElement } from "react";

import { ApiKeysSettings } from "@/features/settings/ApiKeysSettings";
import { GeneralSettings } from "@/features/settings/GeneralSettings";
import { MaintenanceSettings } from "@/features/settings/MaintenanceSettings";
import { ModelProviderSettings } from "@/features/settings/ModelProviderSettings";
import { SettingsPageHeader } from "@/features/settings/SettingsPageHeader";

export function SettingsPage(): ReactElement {
  return (
    <div className="box-border flex h-full min-h-dvh w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#0E0E0E] text-[#cdcdcd] shadow-none ring-0">
      <SettingsPageHeader />
      <div className="scrollbar-none mx-auto flex min-h-0 max-w-2xl flex-1 flex-col gap-10 overflow-y-auto px-4 pb-10 pt-2">
        <GeneralSettings />
        <ApiKeysSettings />
        <ModelProviderSettings />
        <MaintenanceSettings />
      </div>
    </div>
  );
}
