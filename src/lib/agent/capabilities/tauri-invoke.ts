import { invoke } from "@tauri-apps/api/core";

import type { CapabilityError } from "./types";

export type TauriCommandError = {
  code: string;
  message: string;
};

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export function mapInvokeError(error: unknown): CapabilityError {
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    const commandError = error as TauriCommandError;
    return { code: commandError.code, message: commandError.message };
  }

  if (error instanceof Error) {
    return { code: "invoke_failed", message: error.message };
  }

  return { code: "invoke_failed", message: "Unknown native command failure" };
}

export async function invokeCapabilityCommand<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (!isTauriRuntime()) {
    throw {
      code: "tauri_unavailable",
      message: `${command} requires the Actuate desktop runtime`,
    } satisfies CapabilityError;
  }

  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw mapInvokeError(error);
  }
}

export type CapabilityNativeInvoker = (capability: string, input: unknown) => Promise<unknown>;

export function createTauriCapabilityInvoker(workspaceRoot: string): CapabilityNativeInvoker {
  return async (capability, input) => {
    const payload = {
      workspaceRoot,
      ...(typeof input === "object" && input !== null ? input : {}),
    };

    switch (capability) {
      case "read_file":
        return invokeCapabilityCommand("read_file", payload);
      case "search_files":
        return invokeCapabilityCommand("search_files", payload);
      case "write_file":
        return invokeCapabilityCommand("write_file", payload);
      case "delete_file":
        return invokeCapabilityCommand("delete_file", payload);
      case "run_shell":
        return invokeCapabilityCommand("run_shell", payload);
      case "read_clipboard":
        return invokeCapabilityCommand("read_clipboard", payload);
      case "write_clipboard":
        return invokeCapabilityCommand("write_clipboard", payload);
      case "get_system_info":
        return invokeCapabilityCommand("get_system_info", payload);
      default:
        throw {
          code: "unknown_capability",
          message: `Unknown capability: ${capability}`,
        } satisfies CapabilityError;
    }
  };
}

export function createMockCapabilityInvoker(
  handlers: Partial<Record<string, (input: unknown) => Promise<unknown> | unknown>>,
): CapabilityNativeInvoker {
  return async (capability, input) => {
    const handler = handlers[capability];
    if (!handler) {
      throw {
        code: "mock_unconfigured",
        message: `No mock handler for ${capability}`,
      } satisfies CapabilityError;
    }
    return handler(input);
  };
}
