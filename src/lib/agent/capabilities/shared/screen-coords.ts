/** Shared agent-facing copy for mouse/window/a11y screen coordinates. */
export const SCREEN_COORD_DESC =
  "Global screen coordinate, origin top-left of the primary display (same space as window_move, mouse_*, screenshot bounds, and accessibility_element_at_point). Windows: physical pixels (process is Per-Monitor V2 DPI-aware). macOS: points (logical), not Retina device pixels.";
