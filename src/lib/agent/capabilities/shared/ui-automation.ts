/** True when native window / accessibility / input adapters exist (Windows + macOS). */
function hostSupportsUiAutomation(): boolean {
  if (typeof process !== "undefined" && typeof process.platform === "string") {
    return process.platform === "win32" || process.platform === "darwin";
  }
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent;
    if (/Linux/i.test(ua) && !/Android/i.test(ua)) return false;
    return true;
  }
  return true;
}

const uiAutomationEnabled = (settings: { uiAutomation: boolean }) =>
  settings.uiAutomation && hostSupportsUiAutomation();

export { hostSupportsUiAutomation, uiAutomationEnabled };
