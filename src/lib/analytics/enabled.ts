/** True when both project key and explicit enable flag are set. */
export function isAnalyticsEnabled(): boolean {
  if (!import.meta.env.VITE_POSTHOG_KEY) {
    return false;
  }
  const flag = String(import.meta.env.VITE_POSTHOG_ENABLED ?? "").toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}
