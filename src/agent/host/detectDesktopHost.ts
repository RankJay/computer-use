declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

/** True when the app shell is the Tauri desktop host (not a plain browser tab). */
export function detectDesktopHost(): boolean {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
}
