import {
  catalogModeForRuntime,
  filterSettingsUpdatedKeys,
  sanitizeEventProperties,
  toAnalyticsProperties,
  type ProductEventMap,
  type ProductEventName,
} from "@/lib/analytics/catalog";
import { getAnalyticsPort } from "@/lib/analytics/client";

/**
 * Sole product capture path: typed events, catalog sanitize, then transport.
 * Callers and tests should go through here — not the raw port.
 */
export function captureProductEvent<E extends ProductEventName>(
  event: E,
  properties: ProductEventMap[E],
): void {
  const mode = catalogModeForRuntime(false);
  const sanitized = sanitizeEventProperties(event, toAnalyticsProperties(properties), mode);
  getAnalyticsPort().capture(event, sanitized);
}

export function capturePageview(path: string): void {
  captureProductEvent("$pageview", { $current_url: path, path });
}

export function captureSignInClicked(): void {
  captureProductEvent("sign_in_clicked", {});
}

export function captureSignInCompleted(): void {
  captureProductEvent("sign_in_completed", {});
}

export function captureSignOut(): void {
  captureProductEvent("sign_out", {});
}

export function captureAttemptStarted(props: ProductEventMap["attempt_started"]): void {
  captureProductEvent("attempt_started", props);
}

export function captureAttemptCompleted(props: ProductEventMap["attempt_completed"]): void {
  captureProductEvent("attempt_completed", props);
}

export function captureAttemptFailed(props: ProductEventMap["attempt_failed"]): void {
  captureProductEvent("attempt_failed", props);
}

export function captureAttemptBlocked(props: ProductEventMap["attempt_blocked"]): void {
  captureProductEvent("attempt_blocked", props);
}

export function captureChatOpened(props: ProductEventMap["chat_opened"]): void {
  captureProductEvent("chat_opened", props);
}

export function captureSettingsUpdated(props: { keys: string[] }): void {
  const keys = filterSettingsUpdatedKeys(props.keys);
  if (keys.length === 0) {
    return;
  }
  captureProductEvent("settings_updated", { keys });
}
