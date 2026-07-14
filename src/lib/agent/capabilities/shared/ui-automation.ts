import { getCachedPlatformCapabilities } from "@/lib/native/platform";

/** True when native window / accessibility / input adapters exist for this OS. */
function hostSupportsUiAutomation(): boolean {
  const groups = getCachedPlatformCapabilities().groups;
  return groups.accessibility && groups.input;
}

const uiAutomationEnabled = (settings: { uiAutomation: boolean }) =>
  settings.uiAutomation && hostSupportsUiAutomation();

/** Gate window tools on the Rust-reported window group. */
const windowAutomationEnabled = () => getCachedPlatformCapabilities().groups.window;

export { hostSupportsUiAutomation, uiAutomationEnabled, windowAutomationEnabled };
