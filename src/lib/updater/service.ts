import { exit, relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

import { isUpdaterEnabled } from "@/lib/updater/enabled";
import {
  getPendingUpdate,
  getUpdaterSnapshot,
  setPendingUpdate,
  setSessionArm,
  setUpdaterPhase,
} from "@/lib/updater/store";

let launchCheckStarted = false;
let quitInFlight = false;

function logUpdater(message: string, error?: unknown): void {
  // Failures stay out of the UI (plan: silent); keep a console breadcrumb for debug.
  // eslint-disable-next-line no-console -- updater failures are intentionally silent in UI
  console.warn(`[updater] ${message}`, error);
}

/** Once per app launch: check → background download → ready/armed. Failures are silent. */
export async function startLaunchUpdateCheck(installUpdateOnClose: boolean): Promise<void> {
  if (launchCheckStarted) {
    return;
  }
  launchCheckStarted = true;

  if (!(await isUpdaterEnabled())) {
    return;
  }

  setUpdaterPhase("checking");
  try {
    const update = await check();
    if (!update) {
      setUpdaterPhase("idle");
      return;
    }

    setPendingUpdate(update, update.version);
    setUpdaterPhase("downloading");
    await update.download();

    // Always-on-close: no dialog; apply is decided at quit from the preference.
    if (installUpdateOnClose) {
      setUpdaterPhase("armed");
      return;
    }

    setUpdaterPhase("ready");
  } catch (error) {
    logUpdater("check/download failed", error);
    setPendingUpdate(null, null);
    setSessionArm(false);
    setUpdaterPhase("idle");
  }
}

export async function installUpdateNow(): Promise<void> {
  const update = getPendingUpdate();
  if (!update) {
    return;
  }

  setUpdaterPhase("installing");
  try {
    await update.install();
    await relaunch();
  } catch (error) {
    logUpdater("install now failed", error);
    setUpdaterPhase("ready");
  }
}

export function armInstallOnClose(): void {
  setSessionArm(true);
  setUpdaterPhase("armed");
}

export function dismissUpdateForLater(): void {
  setSessionArm(false);
  // Keep cached package; idle UI, re-prompt next launch if still newer.
  setUpdaterPhase("idle");
}

/** Real quit (tray / Cmd+Q): apply when armed or Always, otherwise exit. */
export async function handleQuitRequested(installUpdateOnClose: boolean): Promise<void> {
  if (quitInFlight) {
    return;
  }
  quitInFlight = true;

  const { sessionArm, phase } = getUpdaterSnapshot();
  const update = getPendingUpdate();
  const canApply =
    update !== null && phase !== "checking" && phase !== "downloading" && phase !== "installing";
  const shouldApply = canApply && (sessionArm || installUpdateOnClose);

  try {
    if (shouldApply) {
      setUpdaterPhase("installing");
      await update.install();
    }
    await exit(0);
  } catch (error) {
    logUpdater("quit apply failed", error);
    quitInFlight = false;
    try {
      await exit(0);
    } catch (exitError) {
      logUpdater("exit failed", exitError);
    }
  }
}
