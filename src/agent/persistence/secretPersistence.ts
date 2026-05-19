import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "@/agent/native/nativeBridge";
import {
  TAURI_COMMAND,
  type DeleteSecretRequest,
  type LoadSecretRequest,
  type StoreSecretRequest,
} from "@/agent/native/tauriIpc";

function webSecretStorageKey(secretId: string): string {
  return `actuate.secret.${secretId}`;
}

export async function loadSecretKey(key: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    return globalThis.localStorage?.getItem(webSecretStorageKey(key)) ?? null;
  }
  const request: LoadSecretRequest = { key };
  return invoke<string | null>(TAURI_COMMAND.loadSecret, request);
}

export async function storeSecretKey(key: string, value: string): Promise<void> {
  if (!isTauriRuntime()) {
    globalThis.localStorage?.setItem(webSecretStorageKey(key), value);
    return;
  }
  const request: StoreSecretRequest = { key, value };
  await invoke(TAURI_COMMAND.storeSecret, request);
}

export async function deleteSecretKey(key: string): Promise<void> {
  if (!isTauriRuntime()) {
    globalThis.localStorage?.removeItem(webSecretStorageKey(key));
    return;
  }
  const request: DeleteSecretRequest = { key };
  await invoke(TAURI_COMMAND.deleteSecret, request);
}
