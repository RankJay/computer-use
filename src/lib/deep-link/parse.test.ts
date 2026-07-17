import { describe, expect, test } from "bun:test";

import { parseActuateDeepLink, parseActuateDeepLinks } from "@/lib/deep-link/parse";

describe("parseActuateDeepLink", () => {
  test("normalizes host + path forms to the same path", () => {
    expect(parseActuateDeepLink("actuate://auth/callback?token=abc")).toMatchObject({
      path: "/auth/callback",
    });
    expect(parseActuateDeepLink("actuate:///auth/callback?token=abc")).toMatchObject({
      path: "/auth/callback",
    });
  });

  test("exposes search params", () => {
    const link = parseActuateDeepLink("actuate://auth/callback?token=abc123");
    expect(link?.searchParams.get("token")).toBe("abc123");
  });

  test("supports non-auth paths for future handlers", () => {
    expect(parseActuateDeepLink("actuate://chat/open?id=1")).toMatchObject({
      path: "/chat/open",
    });
    expect(parseActuateDeepLink("actuate://settings")).toMatchObject({
      path: "/settings",
    });
  });

  test("rejects non-actuate URLs", () => {
    expect(parseActuateDeepLink("https://auth/callback?token=abc")).toBeNull();
    expect(parseActuateDeepLink("")).toBeNull();
    expect(parseActuateDeepLink("not a url")).toBeNull();
  });
});

describe("parseActuateDeepLinks", () => {
  test("keeps only valid actuate links", () => {
    const links = parseActuateDeepLinks([
      "https://example.com",
      "actuate://auth/callback?token=a",
      "actuate://noop",
    ]);
    expect(links.map((l) => l.path)).toEqual(["/auth/callback", "/noop"]);
  });
});
