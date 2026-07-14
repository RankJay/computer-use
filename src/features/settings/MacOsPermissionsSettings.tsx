import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { ContentSkeleton } from "@/components/ui/content-skeleton";
import { SettingsRow } from "@/features/settings/SettingsRow";
import { SettingsSection } from "@/features/settings/SettingsSection";
import { settingsGhostButtonClassName } from "@/features/settings/styles";
import { mapInvokeError } from "@/lib/agent/capabilities/native-invoke";
import {
  useMacOsPermissionStatus,
  useRequestMacOsPermission,
} from "@/lib/macos-permissions/queries";
import { missingMacOsPermissions } from "@/lib/macos-permissions/types";

function MacOsPermissionsSkeleton(): ReactElement {
  return (
    <ContentSkeleton loading>
      <SettingsSection title="macOS permissions">
        <SettingsRow
          label="Accessibility"
          description="Required for pointer and UI automation tools."
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            className={settingsGhostButtonClassName}
          >
            Grant
          </Button>
        </SettingsRow>
      </SettingsSection>
    </ContentSkeleton>
  );
}

export function MacOsPermissionsSettings(): ReactElement | null {
  const { data, isPending, isError, error, refetch, isFetching } = useMacOsPermissionStatus();
  const requestPermission = useRequestMacOsPermission();

  if (isPending) {
    return <MacOsPermissionsSkeleton />;
  }

  if (isError) {
    if (mapInvokeError(error).code === "unsupported_platform") {
      return null;
    }

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
