import { Suspense } from "react";

import { Spinner } from "@/components/ui/spinner";
import { GeneralSettings } from "@/features/settings/GeneralSettings";
import { SettingsPageHeader } from "@/features/settings/header";

import { ApiKeysSettings } from "./ApiKeysSettings";
import { MaintenanceSettings } from "./MaintenanceSettings";
import { ModelProviderSettings } from "./ModelProviderSettings";

function SettingsSections() {
  return (
    <>
      <GeneralSettings />
      <ApiKeysSettings />
      <ModelProviderSettings />
      <MaintenanceSettings />
    </>
  );
}

export default function SettingsPageContent() {
  return (
    <div className="flex flex-col h-full w-full gap-0 overflow-hidden box-border overscroll-contain">
      <div>
        <SettingsPageHeader />
      </div>
      <div className="flex min-h-0 flex-1 w-full md:max-w-3xl mx-auto flex-col gap-8 px-4 pb-4 overflow-y-auto scrollbar-none">
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center py-12">
              <Spinner className="size-6 text-muted-foreground" />
            </div>
          }
        >
          <SettingsSections />
        </Suspense>
      </div>
    </div>
  );
}
