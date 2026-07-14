import { Suspense } from "react";

import { queryClient } from "@/app/query-client";
import { SectionErrorBoundary } from "@/components/boundaries/ErrorBoundary";
import { GeneralSettings } from "@/features/settings/GeneralSettings";
import { SettingsPageHeader } from "@/features/settings/header";
import { MacOsPermissionsSettings } from "@/features/settings/MacOsPermissionsSettings";
import { SettingsPageSkeleton } from "@/features/settings/SettingsPageSkeleton";
import { isMacOsClient } from "@/lib/platform";
import { settingsKeys } from "@/lib/settings/queries";

import { ApiKeysSettings } from "./ApiKeysSettings";
import { MaintenanceSettings } from "./MaintenanceSettings";
import { ModelProviderSettings } from "./ModelProviderSettings";

function SettingsSections() {
  return (
    <div className="flex flex-col gap-8">
      <GeneralSettings />
      {isMacOsClient() ? <MacOsPermissionsSettings /> : null}
      <ApiKeysSettings />
      <ModelProviderSettings />
      <MaintenanceSettings />
    </div>
  );
}

function handleSettingsRetry(): void {
  void queryClient.invalidateQueries({ queryKey: settingsKeys.loaded() });
}

export default function SettingsPageContent() {
  return (
    <div className="flex flex-col h-full w-full gap-0 overflow-hidden box-border overscroll-contain">
      <div>
        <SettingsPageHeader />
      </div>
      <div className="flex min-h-0 flex-1 w-full md:max-w-3xl mx-auto flex-col gap-8 px-4 pb-4 overflow-y-auto scrollbar-none">
        <SectionErrorBoundary onRetry={handleSettingsRetry}>
          <Suspense fallback={<SettingsPageSkeleton />}>
            <SettingsSections />
          </Suspense>
        </SectionErrorBoundary>
      </div>
    </div>
  );
}
