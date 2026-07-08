import { open } from "@tauri-apps/plugin-dialog";

export async function pickWorkspaceFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  if (selected === null) {
    return null;
  }

  return typeof selected === "string" ? selected : (selected[0] ?? null);
}
