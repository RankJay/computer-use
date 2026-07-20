import { useSyncExternalStore } from "react";

import { getUpdateDialogView, subscribeUpdater, type UpdateDialogView } from "@/lib/updater/store";

/** Re-renders only when the ready dialog should open, close, or change version. */
export function useUpdateDialogView(): UpdateDialogView {
  return useSyncExternalStore(subscribeUpdater, getUpdateDialogView, getUpdateDialogView);
}
