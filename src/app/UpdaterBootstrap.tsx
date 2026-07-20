import type { ReactElement } from "react";

import { UpdateReadyDialog } from "@/features/updater/UpdateReadyDialog";
import { startUpdaterRuntime } from "@/lib/updater/runtime";

/** Starts updater once per load; renders only the ready dialog (no other chrome). */
export function UpdaterBootstrap(): ReactElement {
  startUpdaterRuntime();
  return <UpdateReadyDialog />;
}
