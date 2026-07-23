import { invoke } from "@tauri-apps/api/core";

import { isTauriRuntime } from "@/lib/runtime/is-tauri-runtime";

import { getCapabilityDefinition } from "./catalog";
import type { CapabilityError, CapabilityNativeInvoker } from "./types";

export type TauriCommandError = {
  code: string;
  message: string;
  details?: string;
  cause?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function commandErrorFromRecord(record: Record<string, unknown>): CapabilityError | null {
  const code = readStringField(record, "code");
  const message = readStringField(record, "message");
  if (!code || !message) {
    return null;
  }

  return {
    code,
    message,
    details: readStringField(record, "details"),
    cause: readStringField(record, "cause"),
  };
}

function tryParseJsonCommandError(value: string): CapabilityError | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isRecord(parsed) ? commandErrorFromRecord(parsed) : null;
  } catch {
    return null;
  }
}

export function mapInvokeError(error: unknown): CapabilityError {
  if (isRecord(error)) {
    const direct = commandErrorFromRecord(error);
    if (direct) {
      return direct;
    }

    const nestedMessage = readStringField(error, "message");
    if (nestedMessage) {
      const parsed = tryParseJsonCommandError(nestedMessage);
      if (parsed) {
        return parsed;
      }
    }

    const nestedError = error.error;
    if (typeof nestedError === "string") {
      const parsed = tryParseJsonCommandError(nestedError);
      if (parsed) {
        return parsed;
      }
      return { code: "invoke_failed", message: nestedError };
    }

    if (isRecord(nestedError)) {
      const nested = commandErrorFromRecord(nestedError);
      if (nested) {
        return nested;
      }
    }
  }

  if (error instanceof Error) {
    const parsed = tryParseJsonCommandError(error.message);
    if (parsed) {
      return parsed;
    }
    return { code: "invoke_failed", message: error.message, cause: error.stack };
  }

  if (typeof error === "string") {
    const parsed = tryParseJsonCommandError(error);
    if (parsed) {
      return parsed;
    }
    return { code: "invoke_failed", message: error };
  }

  return { code: "invoke_failed", message: "Unknown native command failure" };
}

/** Single execution path: capability name is the Tauri command name. */
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

export function createDefaultNativeInvoker(): CapabilityNativeInvoker {
  return async (capability, input, workspaceRoot) => {
    const base =
      typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
    const definition = getCapabilityDefinition(capability);
    const payload = definition.needsWorkspaceRoot ? { workspaceRoot, ...base } : base;

    return invokeCapabilityCommand(capability, payload);
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
