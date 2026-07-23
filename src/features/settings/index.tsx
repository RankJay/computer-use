import { useEffect } from "react";
import { toast } from "sonner";

import { SuspenseQueryBoundary } from "@/components/boundaries/ErrorBoundary";
import { GeneralSettings } from "@/features/settings/GeneralSettings";
import { SettingsPageHeader } from "@/features/settings/header";
import { MacOsPermissionsSettings } from "@/features/settings/MacOsPermissionsSettings";
import { SettingsPageSkeleton } from "@/features/settings/SettingsPageSkeleton";
import { isMacOsClient } from "@/lib/runtime/platform";
import { ensureSecretsReady, settingsKeys } from "@/lib/settings/queries";

import { AccountSettingsNav } from "./AccountSettingsNav";
import { ApiKeysSettings } from "./ApiKeysSettings";
import { MaintenanceSettings } from "./MaintenanceSettings";
import { ModelProviderSettings } from "./ModelProviderSettings";

function SettingsSections() {
  useEffect(() => {
    void ensureSecretsReady().catch(() => {
      toast.error("Could not load API keys from the vault.");
    });
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <AccountSettingsNav />
      <GeneralSettings />
      {isMacOsClient() ? <MacOsPermissionsSettings /> : null}
      <ApiKeysSettings />
      <ModelProviderSettings />
      <MaintenanceSettings />
    </div>
  );
}

export default function SettingsPageContent() {
  return (
    <div className="flex flex-col h-full w-full gap-0 overflow-hidden box-border overscroll-contain">
      <div>
        <SettingsPageHeader />
      </div>
      <div className="flex min-h-0 flex-1 w-full md:max-w-3xl mx-auto flex-col gap-8 px-4 pb-4 overflow-y-auto scrollbar-none">
        <SuspenseQueryBoundary
          queryKey={settingsKeys.loaded()}
          fallback={<SettingsPageSkeleton />}
          fallbackTitle="Could not load settings"
          fallbackDescription="Settings failed to load from this device."
        >
          <SettingsSections />
        </SuspenseQueryBoundary>
      </div>
    </div>
  );
}
