import { sanitizeApiKey } from "@/lib/settings/api-key";
import { DEFAULT_SECRETS } from "@/lib/settings/defaults";
import type { AppSecrets } from "@/lib/settings/types";
import { readVaultString, writeVaultString } from "@/lib/stronghold";

const SECRET_KEYS: (keyof AppSecrets)[] = ["anthropicApiKey", "openaiApiKey"];

export async function readAppSecrets(): Promise<AppSecrets> {
  const entries = await Promise.all(
    SECRET_KEYS.map(async (key) => [key, await readVaultString(key)] as const),
  );

  const secrets = { ...DEFAULT_SECRETS, ...Object.fromEntries(entries) };
  return {
    anthropicApiKey: sanitizeApiKey(secrets.anthropicApiKey),
    openaiApiKey: sanitizeApiKey(secrets.openaiApiKey),
  };
}

export async function writeAppSecret(key: keyof AppSecrets, value: string): Promise<void> {
  await writeVaultString(key, sanitizeApiKey(value));
}
