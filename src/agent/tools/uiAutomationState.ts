export type UiAutomationRunState = {
  readonly completedFocusTypeAttempts: Set<string>;
  /** 1 after a capture until an effective pointer action clears it; blocks repeat captures. */
  capturesWithoutEffectiveMove: number;
  lastCaptureCursorBlockX: number | null;
  lastCaptureCursorBlockY: number | null;
};

/** Fine grid cell size in capture pixels (matches Rust GRID_CELL_PX). */
export const GRID_CELL_PX = 8;

/** Each pink macro block spans this many fine cells (matches Rust BLOCK_SQUARES). */
export const BLOCK_SQUARES = 10;

/** Pink block size in capture pixels (matches Rust BLOCK_PX). */
export const BLOCK_PX = BLOCK_SQUARES * GRID_CELL_PX;

export function createUiAutomationRunState(): UiAutomationRunState {
  return {
    completedFocusTypeAttempts: new Set(),
    capturesWithoutEffectiveMove: 0,
    lastCaptureCursorBlockX: null,
    lastCaptureCursorBlockY: null,
  };
}

export function rememberCaptureCursorBlock(
  state: UiAutomationRunState,
  cursorBlockX: number | null,
  cursorBlockY: number | null,
): void {
  state.lastCaptureCursorBlockX = cursorBlockX;
  state.lastCaptureCursorBlockY = cursorBlockY;
  state.capturesWithoutEffectiveMove = 1;
}

export function clearPendingCapture(state: UiAutomationRunState): void {
  state.capturesWithoutEffectiveMove = 0;
}

export function isRepeatCaptureBlocked(state: UiAutomationRunState): boolean {
  return state.capturesWithoutEffectiveMove >= 1;
}

export function isCursorBlockTarget(
  state: UiAutomationRunState,
  blockX: number,
  blockY: number,
): boolean {
  return (
    state.lastCaptureCursorBlockX === blockX && state.lastCaptureCursorBlockY === blockY
  );
}

export function focusTypeAttemptKey(input: {
  readonly blockX: number;
  readonly blockY: number;
  readonly text: string;
  readonly submit?: boolean;
}): string {
  return `${input.blockX},${input.blockY},${input.text},${input.submit === true}`;
}

export function pointerDeltaFromTarget(
  targetBlockX: number,
  targetBlockY: number,
  cursorBlockX: number | null,
  cursorBlockY: number | null,
): { readonly deltaX: number | null; readonly deltaY: number | null } {
  if (cursorBlockX === null || cursorBlockY === null) {
    return { deltaX: null, deltaY: null };
  }
  return {
    deltaX: cursorBlockX - targetBlockX,
    deltaY: cursorBlockY - targetBlockY,
  };
}

export function pointerMoveWasEffective(
  deltaX: number | null,
  deltaY: number | null,
): boolean {
  return deltaX !== null && deltaY !== null && (deltaX !== 0 || deltaY !== 0);
}
