/** App composition + product capture surface. Tests import adapters/client via subpaths. */

export { AnalyticsBootstrap } from "@/lib/analytics/bootstrap";
export { AnalyticsIdentityBoot } from "@/lib/analytics/boot-identify";
export { AnalyticsNavListener } from "@/lib/analytics/nav-analytics";
export { createAttemptLifecycleAnalyticsAdapter } from "@/lib/analytics/attempt-lifecycle-adapter";
export { identifyUser, resetAnalytics } from "@/lib/analytics/identify";
export {
  captureAttemptBlocked,
  captureAttemptCompleted,
  captureAttemptFailed,
  captureAttemptStarted,
  captureChatOpened,
  capturePageview,
  captureProductEvent,
  captureSettingsUpdated,
  captureSignInClicked,
  captureSignInCompleted,
  captureSignOut,
} from "@/lib/analytics/capture";
