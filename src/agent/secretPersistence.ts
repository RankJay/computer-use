import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/agent/nativeBridge";
import { TAURI_COMMAND } from "@/agent/tauriIpc";

function webSecretStorageKey(secretId: string): string {
  return `actuate.secret.${secretId}`;
}

export async function loadSecretKey(key: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    return globalThis.localStorage?.getItem(webSecretStorageKey(key)) ?? null;
  }
  return invoke<string | null>(TAURI_COMMAND.loadSecret, { key });
}

export async function storeSecretKey(key: string, value: string): Promise<void> {
  if (!isTauriRuntime()) {
    globalThis.localStorage?.setItem(webSecretStorageKey(key), value);
    return;
  }
  await invoke(TAURI_COMMAND.storeSecret, { key, value });
}

export async function deleteSecretKey(key: string): Promise<void> {
  if (!isTauriRuntime()) {
    globalThis.localStorage?.removeItem(webSecretStorageKey(key));
    return;
  }
  await invoke(TAURI_COMMAND.deleteSecret, { key });
}
