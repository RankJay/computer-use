export type UiAutomationRunState = {
  readonly completedFocusTypeAttempts: Set<string>;
};

export function createUiAutomationRunState(): UiAutomationRunState {
  return { completedFocusTypeAttempts: new Set() };
}

export function focusTypeAttemptKey(input: {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly submit?: boolean;
}): string {
  return `${input.x},${input.y},${input.text},${input.submit === true}`;
}

export function pointerDeltaFromTarget(
  targetX: number,
  targetY: number,
  cursorImageX: number | null,
  cursorImageY: number | null,
): { readonly deltaX: number | null; readonly deltaY: number | null } {
  if (cursorImageX === null || cursorImageY === null) {
    return { deltaX: null, deltaY: null };
  }
  return {
    deltaX: cursorImageX - targetX,
    deltaY: cursorImageY - targetY,
  };
}
