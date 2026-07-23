import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "@/lib/runtime/is-tauri-runtime";

export type PlatformOs = "windows" | "macos" | "linux" | "unknown";

export type PlatformCapabilityGroups = {
  fileSystem: boolean;
  shell: boolean;
  clipboard: boolean;
  window: boolean;
  input: boolean;
  accessibility: boolean;
};

export type PlatformCapabilities = {
  os: PlatformOs;
  groups: PlatformCapabilityGroups;
  permissions?: {
    accessibilityTrusted: boolean;
  };
};

function osFromNodePlatform(platform: string): PlatformOs {
  switch (platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "macos";
    case "linux":
      return "linux";
    default:
      return "unknown";
  }
}

/** Offline / pre-fetch fallback. Prefer Rust `get_platform_capabilities` in Tauri. */
export function fallbackPlatformCapabilities(): PlatformCapabilities {
  const os =
    typeof process !== "undefined" && typeof process.platform === "string"
      ? osFromNodePlatform(process.platform)
      : "unknown";
  const desktopAutomation = os === "windows" || os === "macos";
  return {
    os,
    groups: {
      fileSystem: true,
      shell: true,
      clipboard: true,
      window: desktopAutomation,
      input: desktopAutomation,
      accessibility: desktopAutomation,
    },
    permissions: os === "macos" ? { accessibilityTrusted: false } : undefined,
  };
}

let cached: PlatformCapabilities = fallbackPlatformCapabilities();

export function getCachedPlatformCapabilities(): PlatformCapabilities {
  return cached;
}

export function setCachedPlatformCapabilities(next: PlatformCapabilities): void {
  cached = next;
}

export async function fetchPlatformCapabilities(): Promise<PlatformCapabilities> {
  if (!isTauriRuntime()) {
    const fallback = fallbackPlatformCapabilities();
    setCachedPlatformCapabilities(fallback);
    return fallback;
  }

  const caps = await invoke<PlatformCapabilities>("get_platform_capabilities");
  setCachedPlatformCapabilities(caps);
  return caps;
}
