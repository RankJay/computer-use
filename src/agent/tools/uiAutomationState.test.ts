import { describe, expect, test } from "bun:test";

import { focusTypeAttemptKey, pointerDeltaFromTarget } from "@/agent/tools/uiAutomationState";

describe("uiAutomationState", () => {
  test("focusTypeAttemptKey includes submit flag", () => {
    expect(focusTypeAttemptKey({ x: 10, y: 20, text: "hello", submit: false })).toBe(
      "10,20,hello,false",
    );
    expect(focusTypeAttemptKey({ x: 10, y: 20, text: "hello", submit: true })).toBe(
      "10,20,hello,true",
    );
  });

  test("pointerDeltaFromTarget computes delta when cursor is known", () => {
    expect(pointerDeltaFromTarget(100, 200, 105, 198)).toEqual({
      deltaX: 5,
      deltaY: -2,
    });
    expect(pointerDeltaFromTarget(100, 200, null, 198)).toEqual({
      deltaX: null,
      deltaY: null,
    });
  });
});
