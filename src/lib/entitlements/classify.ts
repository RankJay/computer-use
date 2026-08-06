import type { EntitlementCapabilityClass, ModelTier } from "./types";

/** Standard = cheaper/smaller catalog entries; premium = flagship. */
const STANDARD_MODEL_IDS = new Set(["openai/gpt-5.4-mini", "anthropic/claude-haiku-4-5"]);

export function modelTierOf(modelId: string): ModelTier {
  return STANDARD_MODEL_IDS.has(modelId) ? "standard" : "premium";
}

/**
 * UI-automation / desktop-drive Capabilities (coarse computer-use class).
 * FS/shell/clipboard stay `other` — gated by PermissionPolicy, not this class.
 */
export function capabilityClassOf(capability: string): EntitlementCapabilityClass {
  if (
    capability.startsWith("mouse_") ||
    capability.startsWith("key_") ||
    capability === "hotkey" ||
    capability === "type_text" ||
    capability.startsWith("accessibility_")
  ) {
    return "computer_use";
  }
  return "other";
}
