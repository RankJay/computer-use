import { describe, expect, test } from "bun:test";

import { createSettingsProviderKeyAvailability } from "@/features/settings/useSettingsPageModel";

describe("createSettingsProviderKeyAvailability", () => {
  test("exposes enabled state for stored provider keys", () => {
    expect(
      createSettingsProviderKeyAvailability({
        anthropicKeyStored: true,
        openaiKeyStored: false,
      }),
    ).toEqual({
      anthropic: {
        provider: "anthropic",
        hasStoredKey: true,
        disabled: false,
      },
      openai: {
        provider: "openai",
        hasStoredKey: false,
        disabled: true,
      },
    });
  });
});
