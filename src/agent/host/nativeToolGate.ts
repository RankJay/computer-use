import type { AgentNativeBridge } from "@/agent/native/nativeBridge";

export const NATIVE_TOOL_DESKTOP_ONLY_ERROR = "This tool requires the Tauri desktop app.";

export type NativeToolKind = "terminal" | "uiAutomation" | "displayCapture";

const TIMELINE_SUMMARY: Record<NativeToolKind, string> = {
  terminal: "No native bridge (web build).",
  uiAutomation: "No native bridge.",
  displayCapture: "No native bridge.",
};

export type NativeToolGateResult =
  | { readonly ok: true; readonly native: AgentNativeBridge }
  | {
      readonly ok: false;
      readonly error: string;
      readonly timelineSummary: string;
    };

export function gateNativeTool(
  native: AgentNativeBridge | null,
  kind: NativeToolKind,
): NativeToolGateResult {
  if (native === null) {
    return {
      ok: false,
      error: NATIVE_TOOL_DESKTOP_ONLY_ERROR,
      timelineSummary: TIMELINE_SUMMARY[kind],
    };
  }
  return { ok: true, native };
}
