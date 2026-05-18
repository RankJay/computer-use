/** Best-effort host OS from the webview (matches typical desktop Actuate usage). */
export type HostOsKind = "windows" | "darwin" | "linux" | "unknown";

export function getHostOsKind(): HostOsKind {
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) {
    return "windows";
  }
  if (/(Macintosh|Mac OS X)/i.test(ua)) {
    return "darwin";
  }
  if (/Linux|X11/i.test(ua)) {
    return "linux";
  }
  return "unknown";
}

/** Short guidance for terminal_run tool descriptions (model-visible). */
export function terminalRunGuidanceForOs(os: HostOsKind): string {
  switch (os) {
    case "windows":
      return (
        "On Windows use program powershell.exe with args like " +
        '["-NoProfile","-Command","<one line>"]. ' +
        "Quote paths with spaces; prefer Get-ChildItem -LiteralPath. Do not assume bash or sh exist."
      );
    case "darwin":
      return "On macOS you may use bash, zsh, or /bin/sh -c with a short script, or standard BSD/Unix utilities.";
    case "linux":
      return "On Linux use bash or sh -c with a short script, or standard utilities.";
    case "unknown":
      return "Choose a shell and commands appropriate to the user's OS; if unsure, ask one clarifying question.";
    default: {
      const _exhaustive: never = os;
      return _exhaustive;
    }
  }
}

export function formatHostOsLabel(os: HostOsKind): string {
  switch (os) {
    case "windows":
      return "Windows";
    case "darwin":
      return "macOS";
    case "linux":
      return "Linux";
    case "unknown":
      return "unknown";
    default: {
      const _exhaustive: never = os;
      return _exhaustive;
    }
  }
}

/** Human-readable capability line for the model (system / user preamble). */
export function describeRuntimeCapabilities(options: {
  readonly nativeBridge: boolean;
  readonly hostOs: HostOsKind;
  /** When native: whether pointer/keyboard synthesis is allowed at all (Settings). */
  readonly uiAutomationEnabled: boolean;
}): string {
  const os = formatHostOsLabel(options.hostOs);
  if (options.nativeBridge) {
    const uiLine = options.uiAutomationEnabled
      ? "pointer_move / pointer_click / type_text / key_tap run after user approval."
      : "UI automation tools (pointer_move, pointer_click, type_text, key_tap) are disabled in Settings—do not call them; ask the user to enable UI automation in Actuate.";
    return (
      `This run uses the Actuate desktop (Tauri) app on ${os}: terminal_run and display_capture can run after approval. ${uiLine} ` +
      "workspace_inspect / read_file / write_file only work for paths relative to the configured workspace root; they cannot access arbitrary absolute paths—use terminal_run for those (e.g. list or count files under D:\\... on Windows)."
    );
  }
  return (
    `This run is the Web build (no native bridge) on ${os}. terminal_run, display_capture, and UI tools cannot run—you must not claim local shell or screen capture ran. ` +
    "workspace_inspect / read_file / write_file only apply to the sample or configured workspace root, not random disk paths."
  );
}
