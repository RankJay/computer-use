import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "@/lib/agent/is-tauri-runtime";

export type NativeNotification = {
  readonly title: string;
  readonly body: string;
};

/**
 * Send an OS notification. No-ops outside Tauri. Best-effort.
 */
export function notify(notification: NativeNotification): void {
  sendNotify(notification, false);
}

/**
 * Send an OS notification only when the main window is unfocused.
 * No-ops outside Tauri. Best-effort.
 */
export function notifyIfUnfocused(notification: NativeNotification): void {
  sendNotify(notification, true);
}

function sendNotify(notification: NativeNotification, onlyIfUnfocused: boolean): void {
  if (!isTauriRuntime()) return;
  void invoke("notify", {
    title: notification.title,
    body: notification.body,
    onlyIfUnfocused,
  }).catch(() => {
    // Non-fatal: notification is best-effort.
  });
}
