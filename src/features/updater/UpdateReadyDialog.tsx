import { useState, type ReactElement } from "react";

import { queryClient } from "@/app/query-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { settingsKeys, useUpdateSettings } from "@/lib/settings/queries";
import type { LoadedSettings } from "@/lib/settings/types";
import { useUpdateDialogView } from "@/lib/updater/hooks";
import { armInstallOnClose, dismissUpdateForLater, installUpdateNow } from "@/lib/updater/service";

function readInstallUpdateOnClose(): boolean {
  return (
    queryClient.getQueryData<LoadedSettings>(settingsKeys.loaded())?.installUpdateOnClose ?? false
  );
}

function UpdateReadyDialogBody({ version }: { readonly version: string }): ReactElement {
  const storedAlways = readInstallUpdateOnClose();
  const [alwaysOnClose, setAlwaysOnClose] = useState(storedAlways);
  const { mutate } = useUpdateSettings();

  function persistAlwaysPreference(): void {
    if (alwaysOnClose !== storedAlways) {
      mutate({ installUpdateOnClose: alwaysOnClose });
    }
  }

  return (
    <AlertDialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          persistAlwaysPreference();
          dismissUpdateForLater();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update ready</AlertDialogTitle>
          <AlertDialogDescription>Version {version} is ready to install.</AlertDialogDescription>
        </AlertDialogHeader>

        <Label className="flex items-center gap-2 font-normal text-[#767676]">
          <Checkbox
            checked={alwaysOnClose}
            onCheckedChange={(checked) => {
              setAlwaysOnClose(checked === true);
            }}
          />
          Always do this on close
        </Label>

        <AlertDialogFooter className="sm:flex-col sm:items-stretch">
          <AlertDialogAction
            onClick={() => {
              persistAlwaysPreference();
              void installUpdateNow();
            }}
          >
            Install now
          </AlertDialogAction>
          <AlertDialogAction
            variant="outline"
            onClick={() => {
              persistAlwaysPreference();
              armInstallOnClose();
            }}
          >
            Install when I close
          </AlertDialogAction>
          <AlertDialogCancel
            onClick={() => {
              persistAlwaysPreference();
              dismissUpdateForLater();
            }}
          >
            Later
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function UpdateReadyDialog(): ReactElement | null {
  const ready = useUpdateDialogView();
  if (!ready) {
    return null;
  }
  return <UpdateReadyDialogBody key={ready.version} version={ready.version} />;
}
