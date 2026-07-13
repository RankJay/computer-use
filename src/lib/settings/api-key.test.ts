import { describe, expect, test } from "bun:test";

import { expectedApiKeyPrefix, sanitizeApiKey, validateApiKeyFormat } from "@/lib/settings/api-key";

describe("sanitizeApiKey", () => {
  test("trims whitespace and strips zero-width characters", () => {
    expect(sanitizeApiKey("  sk-ant-\u200Babc\n")).toBe("sk-ant-abc");
  });

  test("strips wrapping quotes", () => {
    expect(sanitizeApiKey('"sk-ant-abc"')).toBe("sk-ant-abc");
    expect(sanitizeApiKey("'sk-ant-abc'")).toBe("sk-ant-abc");
  });
});

describe("validateApiKeyFormat", () => {
  test("accepts anthropic keys with sk-ant- prefix", () => {
    expect(validateApiKeyFormat("anthropicApiKey", "  sk-ant-test  ")).toEqual({
      ok: true,
      value: "sk-ant-test",
    });
  });

  test("rejects anthropic keys without prefix", () => {
    expect(validateApiKeyFormat("anthropicApiKey", "sk-openai")).toEqual({
      ok: false,
      message: `Expected a key starting with ${expectedApiKeyPrefix("anthropicApiKey")}`,
    });
  });
});
