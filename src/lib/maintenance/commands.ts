import { invoke } from "@tauri-apps/api/core";

export function openLogsFolder(): Promise<void> {
  return invoke<void>("open_logs_folder");
}

export function clearLogs(): Promise<void> {
  return invoke<void>("clear_logs");
}

export function resetSession(): Promise<void> {
  return invoke<void>("reset_session");
}
