import type { Update } from "@tauri-apps/plugin-updater";

export type UpdaterPhase = "idle" | "checking" | "downloading" | "ready" | "armed" | "installing";

export type UpdaterSnapshot = {
  phase: UpdaterPhase;
  version: string | null;
  /** One-shot arm for this session ("Install when I close"). */
  sessionArm: boolean;
};

/** Stable UI view: only changes when the ready dialog should open/close or version changes. */
export type UpdateDialogView = {
  version: string;
} | null;

type Listener = () => void;

let phase: UpdaterPhase = "idle";
let version: string | null = null;
let sessionArm = false;
let pendingUpdate: Update | null = null;
const listeners = new Set<Listener>();

/** Stable reference for useSyncExternalStore — new object only when values change. */
let snapshot: UpdaterSnapshot = { phase, version, sessionArm };
let dialogView: UpdateDialogView = null;

function nextDialogView(): UpdateDialogView {
  if (phase !== "ready" || version === null) {
    return null;
  }
  if (dialogView?.version === version) {
    return dialogView;
  }
  return { version };
}

function emit(): void {
  snapshot = { phase, version, sessionArm };
  dialogView = nextDialogView();
  for (const listener of listeners) {
    listener();
  }
}

export function getUpdaterSnapshot(): UpdaterSnapshot {
  return snapshot;
}

export function getUpdateDialogView(): UpdateDialogView {
  return dialogView;
}

export function subscribeUpdater(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPendingUpdate(): Update | null {
  return pendingUpdate;
}

export function setUpdaterPhase(next: UpdaterPhase): void {
  if (phase === next) {
    return;
  }
  phase = next;
  emit();
}

export function setPendingUpdate(update: Update | null, nextVersion: string | null): void {
  pendingUpdate = update;
  version = nextVersion;
  emit();
}

export function setSessionArm(armed: boolean): void {
  if (sessionArm === armed) {
    return;
  }
  sessionArm = armed;
  emit();
}

export function resetUpdaterSession(): void {
  pendingUpdate = null;
  version = null;
  sessionArm = false;
  phase = "idle";
  emit();
}
