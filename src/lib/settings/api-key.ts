import type { AppSecrets } from "@/lib/settings/types";

/** Strip copy/paste noise (quotes, whitespace, zero-width chars) from provider keys. */
export function sanitizeApiKey(raw: string): string {
  let value = raw.trim().replace(/[\u200B-\u200D\uFEFF]/g, "");

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value.replace(/\s+/g, "");
}

export function expectedApiKeyPrefix(key: keyof AppSecrets): string {
  switch (key) {
    case "anthropicApiKey":
      return "sk-ant-";
    case "openaiApiKey":
      return "sk-";
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function validateApiKeyFormat(
  key: keyof AppSecrets,
  value: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const sanitized = sanitizeApiKey(value);
  if (sanitized.length === 0) {
    return { ok: false, message: "API key is empty." };
  }

  const prefix = expectedApiKeyPrefix(key);
  if (!sanitized.startsWith(prefix)) {
    return {
      ok: false,
      message: `Expected a key starting with ${prefix}`,
    };
  }

  return { ok: true, value: sanitized };
}
