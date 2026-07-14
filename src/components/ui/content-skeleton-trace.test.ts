import { describe, expect, test } from "bun:test";

import {
  hasDirectTextChild,
  isTraceLeafTag,
  toRelativeRect,
} from "@/components/ui/content-skeleton-trace";

describe("content-skeleton-trace", () => {
  test("isTraceLeafTag recognizes media and form controls", () => {
    expect(isTraceLeafTag("button")).toBe(true);
    expect(isTraceLeafTag("INPUT")).toBe(true);
    expect(isTraceLeafTag("svg")).toBe(true);
    expect(isTraceLeafTag("div")).toBe(false);
    expect(isTraceLeafTag("span")).toBe(false);
  });

  test("toRelativeRect subtracts container origin", () => {
    const rect = toRelativeRect(
      { left: 100, top: 50 },
      { left: 140, top: 80, width: 200, height: 16 },
      "6px",
      "bone-0",
    );
    expect(rect).toEqual({
      key: "bone-0",
      left: 40,
      top: 30,
      width: 200,
      height: 16,
      borderRadius: "6px",
    });
  });

  test("hasDirectTextChild ignores whitespace-only text", () => {
    expect(
      hasDirectTextChild({
        childNodes: [{ nodeType: 3, textContent: "   \n  " }],
      }),
    ).toBe(false);

    expect(
      hasDirectTextChild({
        childNodes: [{ nodeType: 3, textContent: "Today" }],
      }),
    ).toBe(true);

    expect(
      hasDirectTextChild({
        childNodes: [{ nodeType: 1, textContent: "nested" }],
      }),
    ).toBe(false);
  });
});
