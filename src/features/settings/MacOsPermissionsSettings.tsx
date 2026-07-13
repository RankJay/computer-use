import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import { settingsGhostButtonClassName } from "@/features/settings/styles";
import {
  useMacOsPermissionStatus,
  useRequestMacOsPermission,
} from "@/lib/macos-permissions/queries";
import { missingMacOsPermissions } from "@/lib/macos-permissions/types";

function MacOsPermissionsSkeleton(): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <Skeleton className="mx-4 h-4 w-36 bg-[#252525]" />
      <div className="divide-y divide-[#252525] overflow-hidden rounded-xl bg-[#141414] shadow-layered">
        <div className="flex items-center justify-between gap-6 px-4 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-28 bg-[#252525]" />
            <Skeleton className="h-3 w-52 max-w-full bg-[#252525]" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0 bg-[#252525]" />
        </div>
      </div>
    </section>
  );
}

export function MacOsPermissionsSettings(): ReactElement | null {
  const { data, isPending, isError, refetch, isFetching } = useMacOsPermissionStatus();
  const requestPermission = useRequestMacOsPermission();

  if (isPending) {
    return <MacOsPermissionsSkeleton />;
  }

  if (isError) {
    return (
      <SettingsSection title="macOS permissions">
        <SettingsRow
          label="Could not check permissions"
          description="Retry after Actuate is running as a desktop app."
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetching}
            className={settingsGhostButtonClassName}
            onClick={() => {
              void refetch();
            }}
          >
            Retry
          </Button>
        </SettingsRow>
      </SettingsSection>
    );
  }

  const missing = data ? missingMacOsPermissions(data) : [];

  // Only surface permissions that still need action.
  if (missing.length === 0) {
    return null;
  }

  return (
    <SettingsSection title="macOS permissions">
      {missing.map((permission) => (
        <SettingsRow
          key={permission.kind}
          label={permission.label}
          description={permission.description}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={requestPermission.isPending}
            className={settingsGhostButtonClassName}
            onClick={() => {
              requestPermission.mutate(permission.kind);
            }}
          >
            Grant
          </Button>
        </SettingsRow>
      ))}
    </SettingsSection>
  );
}
