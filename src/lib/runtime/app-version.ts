import { getVersion } from "@tauri-apps/api/app";
import { useSyncExternalStore } from "react";

import { isTauriRuntime } from "./is-tauri-runtime";

let cached = "";
let started = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string {
  return cached;
}

/** Kick off getVersion() once per app load (safe to call during render). */
export function ensureAppVersion(): void {
  if (started) {
    return;
  }
  started = true;

  if (!isTauriRuntime()) {
    cached = "0.1.0";
    emit();
    return;
  }

  void getVersion()
    .then((next) => {
      cached = next;
      emit();
      return undefined;
    })
    .catch(() => {
      cached = "0.1.0";
      emit();
    });
}

/** Current cached version (may be "" until ensureAppVersion resolves). */
export function getAppVersion(): string {
  return cached;
}

export function useAppVersion(): string {
  ensureAppVersion();
  return useSyncExternalStore(subscribe, getSnapshot, () => "");
}
