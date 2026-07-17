import { describe, expect, test } from "bun:test";

import { firstAuthCallbackToken, parseAuthCallbackToken } from "@/lib/auth/auth-callback-handler";

describe("parseAuthCallbackToken", () => {
  test("parses actuate://auth/callback?token=", () => {
    expect(parseAuthCallbackToken("actuate://auth/callback?token=abc123")).toBe("abc123");
  });

  test("trims token whitespace", () => {
    expect(parseAuthCallbackToken("actuate://auth/callback?token=%20ott%20")).toBe("ott");
  });

  test("rejects missing token", () => {
    expect(parseAuthCallbackToken("actuate://auth/callback")).toBeNull();
    expect(parseAuthCallbackToken("actuate://auth/callback?token=")).toBeNull();
  });

  test("rejects wrong scheme or path", () => {
    expect(parseAuthCallbackToken("https://auth/callback?token=abc")).toBeNull();
    expect(parseAuthCallbackToken("actuate://auth/other?token=abc")).toBeNull();
    expect(parseAuthCallbackToken("actuate://settings?token=abc")).toBeNull();
  });
});

describe("firstAuthCallbackToken", () => {
  test("returns the first valid token in a list", () => {
    expect(
      firstAuthCallbackToken([
        "https://example.com",
        "actuate://auth/callback?token=first",
        "actuate://auth/callback?token=second",
      ]),
    ).toBe("first");
  });

  test("returns null when none match", () => {
    expect(firstAuthCallbackToken(["https://example.com", "actuate://noop"])).toBeNull();
  });
});
