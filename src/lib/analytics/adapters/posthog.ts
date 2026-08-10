import posthog from "posthog-js";

import { isAnalyticsEnabled } from "@/lib/analytics/enabled";
import type { AnalyticsPort } from "@/lib/analytics/port";
import { fallbackPlatformCapabilities } from "@/lib/native/platform";
import { ensureAppVersion, getAppVersion } from "@/lib/runtime/app-version";
import { isTauriRuntime } from "@/lib/runtime/is-tauri-runtime";

let sdkReady = false;

function ensureSdk(): boolean {
  if (!isAnalyticsEnabled()) {
    return false;
  }
  if (sdkReady) {
    return true;
  }

  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) {
    return false;
  }

  ensureAppVersion();

  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com",
    person_profiles: "identified_only",
    persistence: "localStorage",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    capture_performance: false,
  });

  posthog.register({
    app_version: getAppVersion() || "unknown",
    platform: fallbackPlatformCapabilities().os,
    runtime: isTauriRuntime() ? "tauri" : "web",
  });

  sdkReady = true;

  const version = getAppVersion();
  if (!version) {
    const poll = window.setInterval(() => {
      const next = getAppVersion();
      if (next) {
        posthog.register({ app_version: next });
        window.clearInterval(poll);
      }
    }, 250);
    window.setTimeout(() => window.clearInterval(poll), 10_000);
  }

  return true;
}

/** PostHog adapter — sole SDK touchpoint. */
export function createPostHogAnalyticsPort(): AnalyticsPort {
  return {
    capture(event, properties) {
      if (!ensureSdk()) {
        return;
      }
      posthog.capture(event, properties);
    },
    identify(distinctId, properties) {
      if (!ensureSdk()) {
        return;
      }
      posthog.identify(distinctId, properties);
    },
    reset() {
      if (!ensureSdk()) {
        return;
      }
      posthog.reset();
    },
    flush() {
      if (!sdkReady || !isAnalyticsEnabled()) {
        return;
      }
      void posthog.shutdown().finally(() => {
        sdkReady = false;
      });
    },
  };
}

export function initPostHogAnalytics(): void {
  ensureSdk();
}
