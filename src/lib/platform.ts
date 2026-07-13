/** True when the UI is running on a Mac. */
export function isMacOsClient(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return navigator.userAgent.includes("Mac");
}
