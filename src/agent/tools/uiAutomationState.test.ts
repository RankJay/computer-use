import { describe, expect, test } from "bun:test";

import {
  clearPendingCapture,
  createUiAutomationRunState,
  focusTypeAttemptKey,
  isCursorBlockTarget,
  isRepeatCaptureBlocked,
  isRepeatA11ySnapshotBlocked,
  isDisplayCaptureBlockedByA11y,
  pointerDeltaFromTarget,
  pointerMoveWasEffective,
  rememberA11ySnapshot,
  rememberCaptureCursorBlock,
} from "@/agent/tools/uiAutomationState";

describe("uiAutomationState", () => {
  test("focusTypeAttemptKey includes submit flag", () => {
    expect(focusTypeAttemptKey({ blockX: 10, blockY: 20, text: "hello", submit: false })).toBe(
      "10,20,hello,false",
    );
    expect(focusTypeAttemptKey({ blockX: 10, blockY: 20, text: "hello", submit: true })).toBe(
      "10,20,hello,true",
    );
  });

  test("pointerDeltaFromTarget computes delta when cursor is known", () => {
    expect(pointerDeltaFromTarget(3, 4, 5, 3)).toEqual({
      deltaX: 2,
      deltaY: -1,
    });
    expect(pointerDeltaFromTarget(3, 4, null, 3)).toEqual({
      deltaX: null,
      deltaY: null,
    });
  });

  test("repeat capture blocked after screenshot until pointer action", () => {
    const state = createUiAutomationRunState();
    expect(isRepeatCaptureBlocked(state)).toBe(false);
    rememberCaptureCursorBlock(state, 16, 7);
    expect(isRepeatCaptureBlocked(state)).toBe(true);
    clearPendingCapture(state);
    expect(isRepeatCaptureBlocked(state)).toBe(false);
  });

  test("isCursorBlockTarget detects moving to current cursor block", () => {
    const state = createUiAutomationRunState();
    rememberCaptureCursorBlock(state, 16, 7);
    expect(isCursorBlockTarget(state, 16, 7)).toBe(true);
    expect(isCursorBlockTarget(state, 1, 3)).toBe(false);
  });

  test("repeat a11y snapshot blocked until interact", () => {
    const state = createUiAutomationRunState();
    expect(isRepeatA11ySnapshotBlocked(state)).toBe(false);
    rememberA11ySnapshot(state);
    expect(isRepeatA11ySnapshotBlocked(state)).toBe(true);
    expect(isDisplayCaptureBlockedByA11y(state)).toBe(true);
    clearPendingCapture(state);
    expect(isRepeatA11ySnapshotBlocked(state)).toBe(false);
  });

  test("pointerMoveWasEffective requires non-zero delta", () => {
    expect(pointerMoveWasEffective(0, 0)).toBe(false);
    expect(pointerMoveWasEffective(1, 0)).toBe(true);
    expect(pointerMoveWasEffective(null, 0)).toBe(false);
  });
});
