import { mapInvokeError } from "@/lib/agent/capabilities/native-invoke";
import type { CapabilityError } from "@/lib/agent/capabilities/types";

export function formatCapabilityError(error: CapabilityError): string {
  const lines = [`[${error.code}] ${error.message}`];
  if (error.details) {
    lines.push(error.details);
  }
  if (error.cause) {
    lines.push(`Cause: ${error.cause}`);
  }
  return lines.join("\n");
}

function tryParseCommandErrorJson(value: string): CapabilityError | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record.code === "string" && typeof record.message === "string") {
      return {
        code: record.code,
        message: record.message,
        details: typeof record.details === "string" ? record.details : undefined,
        cause: typeof record.cause === "string" ? record.cause : undefined,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function formatToolStreamError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    return formatCapabilityError(mapInvokeError(error));
  }

  if (error instanceof Error) {
    const fromMessage = tryParseCommandErrorJson(error.message);
    if (fromMessage) {
      return formatCapabilityError(fromMessage);
    }
    if (error.message.trim().length > 0) {
      return error.message;
    }
    return error.stack ?? "Unknown error";
  }

  if (typeof error === "string") {
    const fromString = tryParseCommandErrorJson(error);
    if (fromString) {
      return formatCapabilityError(fromString);
    }
    return error;
  }

  return formatCapabilityError(mapInvokeError(error));
}
