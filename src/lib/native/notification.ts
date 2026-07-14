import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { toast } from "sonner";

import { isTauriRuntime } from "@/lib/agent/is-tauri-runtime";
import { isMacOsClient } from "@/lib/platform";

export type NativeNotification = {
  readonly title: string;
  readonly body: string;
};

/**
 * Send an OS notification. No-ops outside Tauri. Best-effort.
 * On macOS, requests notification permission first and guides the user if denied.
 */
export function notify(notification: NativeNotification): void {
  void sendNotify(notification, false);
}

/**
 * Send an OS notification only when the main window is unfocused.
 * No-ops outside Tauri. Best-effort.
 */
export function notifyIfUnfocused(notification: NativeNotification): void {
  void sendNotify(notification, true);
}

async function ensureMacNotificationPermission(): Promise<boolean> {
  if (!isMacOsClient()) {
    return true;
  }

  try {
    if (await isPermissionGranted()) {
      return true;
    }
    const permission = await requestPermission();
    if (permission === "granted") {
      return true;
    }
    toast.message("Notifications are off", {
      description: "Enable Actuate under System Settings → Notifications to get alerts.",
    });
    return false;
  } catch {
    // Fall through and try the Rust notify path anyway.
    return true;
  }
}

async function sendNotify(
  notification: NativeNotification,
  onlyIfUnfocused: boolean,
): Promise<void> {
  if (!isTauriRuntime()) return;

  if (!(await ensureMacNotificationPermission())) {
    return;
  }

  try {
    await invoke("notify", {
      title: notification.title,
      body: notification.body,
      onlyIfUnfocused,
    });
  } catch {
    // Non-fatal: notification is best-effort.
  }
}
