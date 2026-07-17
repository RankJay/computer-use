import { afterEach, describe, expect, test } from "bun:test";

import { clearConsumedOttForTests, markOttConsumed, wasOttConsumed } from "@/lib/auth/consumed-ott";

afterEach(() => {
  clearConsumedOttForTests();
});

describe("consumed OTT persistence", () => {
  test("marks and remembers a token across reads", () => {
    expect(wasOttConsumed("ott-1")).toBe(false);
    markOttConsumed("ott-1");
    expect(wasOttConsumed("ott-1")).toBe(true);
  });

  test("mark is idempotent", () => {
    markOttConsumed("ott-2");
    markOttConsumed("ott-2");
    expect(wasOttConsumed("ott-2")).toBe(true);
  });
});
