import { describe, expect, test } from "bun:test";

import {
  fallbackPlatformCapabilities,
  getCachedPlatformCapabilities,
  setCachedPlatformCapabilities,
} from "./platform";

describe("platform capabilities", () => {
  test("fallback matches process platform automation support", () => {
    const caps = fallbackPlatformCapabilities();
    expect(caps.groups.fileSystem).toBe(true);
    expect(caps.groups.shell).toBe(true);
    expect(caps.groups.clipboard).toBe(true);

    const desktop = process.platform === "win32" || process.platform === "darwin";
    expect(caps.groups.window).toBe(desktop);
    expect(caps.groups.input).toBe(desktop);
    expect(caps.groups.accessibility).toBe(desktop);
  });

  test("cache round-trip", () => {
    const previous = getCachedPlatformCapabilities();
    const next = fallbackPlatformCapabilities();
    next.groups.window = false;
    setCachedPlatformCapabilities(next);
    expect(getCachedPlatformCapabilities().groups.window).toBe(false);
    setCachedPlatformCapabilities(previous);
  });
});
