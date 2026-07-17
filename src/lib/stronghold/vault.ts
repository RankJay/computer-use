import { appDataDir } from "@tauri-apps/api/path";
import { type Client, Stronghold } from "@tauri-apps/plugin-stronghold";

const STRONGHOLD_CLIENT = "actuate";
// Fixed internal vault password derived from bundle id; upgrade path is OS keychain.
const VAULT_PASSWORD = "com.rankj.actuate";

export type StrongholdSession = {
  stronghold: Stronghold;
  client: Client;
};

let sessionPromise: Promise<StrongholdSession> | null = null;

export function encodeStrongholdValue(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

export function decodeStrongholdValue(data: Uint8Array | number[] | null): string {
  if (!data || data.length === 0) {
    return "";
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new TextDecoder().decode(bytes);
}

/**
 * Process-wide Stronghold open. Shared by API keys, auth tokens, and any future
 * secure values — never open a second vault for the same `vault.hold`.
 */
export async function getStrongholdSession(): Promise<StrongholdSession> {
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

/** Read a UTF-8 string. Missing or empty → `""`. */
export async function readVaultString(key: string): Promise<string> {
  const { client } = await getStrongholdSession();
  const data = await client.getStore().get(key);
  return decodeStrongholdValue(data);
}

/** Write a UTF-8 string and persist the vault. */
export async function writeVaultString(key: string, value: string): Promise<void> {
  await writeVaultStrings([[key, value]]);
}

/** Write several keys then persist once. */
export async function writeVaultStrings(
  entries: ReadonlyArray<readonly [string, string]>,
): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  const { stronghold, client } = await getStrongholdSession();
  const store = client.getStore();
  for (const [key, value] of entries) {
    await store.insert(key, encodeStrongholdValue(value));
  }
  await stronghold.save();
}

/** Clear a key (empty value) and persist. */
export async function clearVaultString(key: string): Promise<void> {
  await writeVaultString(key, "");
}

/** Clear several keys then persist once. */
export async function clearVaultStrings(keys: readonly string[]): Promise<void> {
  await writeVaultStrings(keys.map((key) => [key, ""] as const));
}
