import { describe, expect, test } from "bun:test";

import { deriveChatTitle } from "@/lib/chats/title";

describe("deriveChatTitle", () => {
  test("collapses whitespace", () => {
    expect(deriveChatTitle("  hello   world\n\tthere  ")).toBe("hello world there");
  });

  test("keeps titles at or under 48 chars", () => {
    const at47 = "a".repeat(47);
    const at48 = "a".repeat(48);
    expect(deriveChatTitle(at47)).toBe(at47);
    expect(deriveChatTitle(at48)).toBe(at48);
  });

  test("truncates at 49 chars with ellipsis", () => {
    const at49 = "a".repeat(49);
    expect(deriveChatTitle(at49)).toBe(`${"a".repeat(47)}…`);
    expect(deriveChatTitle(at49).length).toBe(48);
  });

  test("empty prompt stays empty", () => {
    expect(deriveChatTitle("   ")).toBe("");
  });
});
