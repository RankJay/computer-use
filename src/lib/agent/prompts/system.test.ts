import { describe, expect, test } from "bun:test";

import {
  fallbackPlatformCapabilities,
  getCachedPlatformCapabilities,
  setCachedPlatformCapabilities,
} from "@/lib/native/platform";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

import { buildSystemPrompt } from "./system";

describe("buildSystemPrompt", () => {
  test("UI-on prompt includes compound-click and batch-verify guidance", () => {
    const previous = getCachedPlatformCapabilities();
    const caps = fallbackPlatformCapabilities();
    caps.groups.accessibility = true;
    caps.groups.input = true;
    setCachedPlatformCapabilities(caps);

    try {
      const prompt = buildSystemPrompt({ ...DEFAULT_SETTINGS, uiAutomation: true });
      expect(prompt).toContain("prefer mouse_click_image");
      expect(prompt).toContain("two separate integers");
      expect(prompt).toContain("focus_denied");
      expect(prompt).toContain("type_text");
      expect(prompt).toContain("Never type via run_shell/xdotool");
      expect(prompt).toContain("Avoid a separate mouse_move");
      expect(prompt).toContain("Batch UI mutations");
      expect(prompt).toContain("not after every micro-step");
      expect(prompt).toContain("Prefer OS Accessibility");
    } finally {
      setCachedPlatformCapabilities(previous);
    }
  });

  test("UI-off prompt does not include mouse compound-click rules", () => {
    const prompt = buildSystemPrompt({ ...DEFAULT_SETTINGS, uiAutomation: false });
    expect(prompt).toContain("Pointer / UI automation is OFF");
    expect(prompt).not.toContain("prefer mouse_click_image");
    expect(prompt).not.toContain("Batch UI mutations");
  });

  test("includes high-leverage behavior sections", () => {
    const prompt = buildSystemPrompt(DEFAULT_SETTINGS);
    expect(prompt).toContain("# Verification");
    expect(prompt).toContain("Causal evidence only");
    expect(prompt).toContain("Ground every claim");
    expect(prompt).toContain("signals stop");
    expect(prompt).toContain("FINDING");
    expect(prompt).toContain("# Repository work");
    expect(prompt).toContain("Never rewrite git history");
  });
});
