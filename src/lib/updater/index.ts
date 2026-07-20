export { isUpdaterEnabled } from "@/lib/updater/enabled";
export { useUpdateDialogView } from "@/lib/updater/hooks";
export { startUpdaterRuntime } from "@/lib/updater/runtime";
export {
  armInstallOnClose,
  dismissUpdateForLater,
  handleQuitRequested,
  installUpdateNow,
  startLaunchUpdateCheck,
} from "@/lib/updater/service";
export type { UpdateDialogView, UpdaterPhase, UpdaterSnapshot } from "@/lib/updater/store";
