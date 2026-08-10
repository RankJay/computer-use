import type { AnalyticsProperties } from "@/lib/analytics/port";

/** settings_updated allowlist — key names only; never workspaceRoot / approvals / secrets. */
export const SETTINGS_UPDATED_ALLOWLIST = [
  "logRetentionDays",
  "permissionMode",
  "uiAutomation",
  "agentMode",
  "selectedModelId",
  "maxSteps",
  "maxCostUsd",
  "maxWallClockMs",
  "installUpdateOnClose",
] as const;

export type SettingsUpdatedKey = (typeof SETTINGS_UPDATED_ALLOWLIST)[number];

const SETTINGS_ALLOW = new Set<string>(SETTINGS_UPDATED_ALLOWLIST);

/**
 * Typed product events. Property keys must stay aligned with sanitize allowlists below.
 * Optional fields use `| undefined` so callers may omit them.
 */
export type ProductEventMap = {
  $pageview: { $current_url: string; path: string };
  chat_opened: { chat_id: string };
  sign_in_clicked: Record<string, never>;
  sign_in_completed: Record<string, never>;
  sign_out: Record<string, never>;
  attempt_started: { attempt_id: string; model?: string };
  attempt_completed: {
    attempt_id: string;
    finish_reason: string;
    duration_ms?: number;
  };
  attempt_failed: {
    attempt_id: string;
    error_code?: string;
    duration_ms?: number;
  };
  attempt_blocked: { reason: string; capability?: string };
  settings_updated: { keys: SettingsUpdatedKey[] };
};

export type ProductEventName = keyof ProductEventMap;

/** Event → allowed property keys (runtime allowlist for sanitize). */
export const EVENT_ALLOWED_KEYS: {
  readonly [E in ProductEventName]: readonly (keyof ProductEventMap[E] & string)[];
} = {
  $pageview: ["$current_url", "path"],
  chat_opened: ["chat_id"],
  sign_in_clicked: [],
  sign_in_completed: [],
  sign_out: [],
  attempt_started: ["attempt_id", "model"],
  attempt_completed: ["attempt_id", "finish_reason", "duration_ms"],
  attempt_failed: ["attempt_id", "error_code", "duration_ms"],
  attempt_blocked: ["reason", "capability"],
  settings_updated: ["keys"],
};

export function filterSettingsUpdatedKeys(keys: string[]): SettingsUpdatedKey[] {
  return keys.filter((key): key is SettingsUpdatedKey => SETTINGS_ALLOW.has(key));
}

export type CatalogMode = "strict" | "strip";

/**
 * Enforce catalog: strict throws on unknown keys; strip drops them.
 * Always drops undefined values.
 */
export function sanitizeEventProperties(
  event: string,
  properties: AnalyticsProperties | undefined,
  mode: CatalogMode,
): AnalyticsProperties {
  const allowed = (EVENT_ALLOWED_KEYS as Record<string, readonly string[] | undefined>)[event];
  const input = properties ?? {};
  const out: AnalyticsProperties = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }
    if (allowed === undefined) {
      if (mode === "strict") {
        throw new Error(`analytics: unknown event "${event}"`);
      }
      continue;
    }
    if (!allowed.includes(key)) {
      if (mode === "strict") {
        throw new Error(`analytics: event "${event}" forbids property "${key}"`);
      }
      continue;
    }
    out[key] = value;
  }

  return out;
}

export function catalogModeForRuntime(strictAdapter: boolean): CatalogMode {
  if (strictAdapter || import.meta.env.DEV) {
    return "strict";
  }
  return "strip";
}

/** Convert a typed product payload into transport properties (drops undefined). */
export function toAnalyticsProperties(
  properties: ProductEventMap[ProductEventName],
): AnalyticsProperties {
  const out: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      (Array.isArray(value) && value.every((item) => typeof item === "string"))
    ) {
      out[key] = value;
    }
  }
  return out;
}
