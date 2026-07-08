import { appDataDir } from "@tauri-apps/api/path";
import { type Client, Stronghold } from "@tauri-apps/plugin-stronghold";

import { DEFAULT_SECRETS } from "@/lib/settings/defaults";
import type { AppSecrets } from "@/lib/settings/types";

const STRONGHOLD_CLIENT = "actuate";
// Fixed internal vault password derived from bundle id; upgrade path is OS keychain.
const VAULT_PASSWORD = "com.rankj.actuate";

const SECRET_KEYS: (keyof AppSecrets)[] = ["anthropicApiKey", "openaiApiKey"];

type StrongholdSession = {
  stronghold: Stronghold;
  client: Client;
};

let sessionPromise: Promise<StrongholdSession> | null = null;

function encodeSecret(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function decodeSecret(data: Uint8Array | number[] | null): string {
  if (!data || data.length === 0) {
    return "";
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new TextDecoder().decode(bytes);
}

async function getStrongholdSession(): Promise<StrongholdSession> {
  if (!sessionPromise) {
    sessionPromise = initStrongholdSession();
  }
  return sessionPromise;
}

async function initStrongholdSession(): Promise<StrongholdSession> {
  const vaultPath = `${await appDataDir()}/vault.hold`;
  const stronghold = await Stronghold.load(vaultPath, VAULT_PASSWORD);

  let client: Client;
  try {
    client = await stronghold.loadClient(STRONGHOLD_CLIENT);
  } catch {
    client = await stronghold.createClient(STRONGHOLD_CLIENT);
  }

  return { stronghold, client };
}

export async function readAppSecrets(): Promise<AppSecrets> {
  const { client } = await getStrongholdSession();
  const store = client.getStore();

  const entries = await Promise.all(
    SECRET_KEYS.map(async (key) => {
      const data = await store.get(key);
      return [key, decodeSecret(data)] as const;
    }),
  );

  return { ...DEFAULT_SECRETS, ...Object.fromEntries(entries) };
}

export async function writeAppSecret(key: keyof AppSecrets, value: string): Promise<void> {
  const { stronghold, client } = await getStrongholdSession();
  const store = client.getStore();
  await store.insert(key, encodeSecret(value));
  await stronghold.save();
}
