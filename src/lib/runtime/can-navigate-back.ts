/**
 * True when React Router has an in-app history entry behind the current one.
 * `location.key === "default"` covers the initial load; `history.state.idx === 0`
 * covers stacks left at a single entry by `navigate(..., { replace: true })`
 * (e.g. auth deep-link → Account → Settings).
 */
export function canNavigateBack(locationKey: string): boolean {
  if (locationKey === "default") {
    return false;
  }
  const state = window.history.state;
  if (state === null || typeof state !== "object" || !("idx" in state)) {
    return true;
  }
  const idx = state.idx;
  if (typeof idx !== "number") {
    return true;
  }
  return idx > 0;
}
